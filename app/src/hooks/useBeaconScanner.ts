/**
 * useBeaconScanner — starts the background Dander Node BLE scanner on
 * auth, stops it on logout/unmount. Mirrors the useWifiScanner pattern.
 *
 * Permissions:
 *   - On Android 12+ the OS requires runtime BLUETOOTH_SCAN permission.
 *     react-native-ble-plx surfaces this through the manager; we don't
 *     re-implement the prompt here. Until a fresh EAS build with
 *     react-native-ble-plx ships, startBeaconScanner() returns false
 *     gracefully and this hook is a no-op.
 *
 * Side effects:
 *   - Haptic + lightweight console log on a successful proximity hit so
 *     the user has at-least-some feedback even before we ship a toast UI.
 */

import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';

import { useAuth } from '../context/AuthContext';
import { startBeaconScanner, stopBeaconScanner, refreshKnownNodes } from '../services/beaconScanner';

export function useBeaconScanner() {
  const { isAuth } = useAuth();

  useEffect(() => {
    if (!isAuth) return;
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
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
