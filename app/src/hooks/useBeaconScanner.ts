/**
 * useBeaconScanner — starts the background Dander Node BLE scanner on
 * auth, stops it on logout/unmount. Mirrors the useWifiScanner pattern.
 *
 * Permissions:
 *   - On first scan attempt we show a one-time explanation dialog so the
 *     user understands *why* we need Bluetooth before the system prompt
 *     fires. Subsequent app launches skip the explanation (a flag in
 *     AsyncStorage tracks "shown once"); the system prompts are still
 *     handled by the scanner service.
 *   - Pre-Android-12 needs ACCESS_FINE_LOCATION; Android 12+ also needs
 *     BLUETOOTH_SCAN + BLUETOOTH_CONNECT.
 *
 * Side effects:
 *   - Haptic + console log on a successful proximity hit; a real toast
 *     lands in a follow-up.
 */

import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../context/AuthContext';
import { startBeaconScanner, stopBeaconScanner, refreshKnownNodes } from '../services/beaconScanner';

const EXPLAINED_KEY = 'dander_ble_explanation_shown_v1';

/**
 * Show the friendly "why Bluetooth?" prompt once. Resolves to true if
 * the user agreed to continue (or if we've already shown it before);
 * false if they tapped "Not now" the first time round. Non-Android
 * resolves true immediately — iOS shows its own prompt with the
 * Info.plist usage description.
 */
async function maybeShowExplanation(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const already = await AsyncStorage.getItem(EXPLAINED_KEY);
    if (already) return true;
  } catch { /* fall through and ask anyway */ }
  const agreed = await new Promise<boolean>((resolve) => {
    Alert.alert(
      'Bluetooth for loyalty points',
      'Dander uses Bluetooth to recognise you at local businesses and award loyalty points automatically.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Allow',                       onPress: () => resolve(true)  },
      ],
      { cancelable: false },
    );
  });
  try { await AsyncStorage.setItem(EXPLAINED_KEY, '1'); } catch { /* best-effort */ }
  return agreed;
}

export function useBeaconScanner() {
  const { isAuth } = useAuth();

  useEffect(() => {
    if (!isAuth) return;
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      const agreed = await maybeShowExplanation();
      if (!agreed || cancelled) return;

      const ok = await startBeaconScanner((hit) => {
        if (cancelled) return;
        // Haptic + log. A proper toast component lands in a follow-up.
        try { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* ignore */ }
        if (__DEV__) {
          console.log(
            `[beaconScanner] proximity at ${hit.businessName}: ` +
            `+${hit.pointsAwarded} points${hit.alreadyVisited ? ' (already visited)' : ''}`,
          );
        }
      });
      if (!ok || cancelled) return;
      // Refresh the known-nodes cache every hour to pick up newly-paired Nodes.
      refreshTimer = setInterval(() => { void refreshKnownNodes(); }, 60 * 60 * 1000);
    })();

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
      stopBeaconScanner();
    };
  }, [isAuth]);
}
