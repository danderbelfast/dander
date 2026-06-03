/**
 * usePermissionWalkthrough — first-launch onboarding for every permission
 * the app benefits from. Runs once per install (gated by an AsyncStorage
 * flag) on the first authenticated session.
 *
 * Order (per spec, least-scary first):
 *   1. Notifications  — loyalty alerts and offer push
 *   2. Location       — WiFi scanner + BLE on Android 9
 *   3. Nearby Devices — Android 12+ BLUETOOTH_SCAN/CONNECT (called
 *                       "Nearby devices" in system settings)
 *   4. Physical Activity — already requested by useStepCounter; we don't
 *      re-ask here to avoid double-prompting.
 *
 * Each system prompt is preceded by a friendly Alert that explains *why*.
 * "Not now" skips that step without breaking the loop; the PermissionBanner
 * lower in the tree will surface a soft remedial banner for anything denied.
 */

import { useEffect } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

import { useAuth } from '../context/AuthContext';

const DONE_KEY = 'dander_permission_walkthrough_done_v1';

async function ask(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue',                    onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}

export function usePermissionWalkthrough() {
  const { isAuth } = useAuth();

  useEffect(() => {
    if (!isAuth) return;
    let cancelled = false;

    (async () => {
      try {
        const already = await AsyncStorage.getItem(DONE_KEY);
        if (already || cancelled) return;

        // ── 1. Notifications ────────────────────────────────────────
        const notifAsked = await ask(
          'Stay in the loop',
          'Get notified when you earn points and when exclusive offers are nearby.',
        );
        if (cancelled) return;
        if (notifAsked) {
          try { await Notifications.requestPermissionsAsync(); } catch { /* ignore */ }
        }

        // ── 2. Location ─────────────────────────────────────────────
        if (cancelled) return;
        const locAsked = await ask(
          'Find nearby businesses',
          'Dander uses your location to find nearby businesses and award loyalty points.',
        );
        if (cancelled) return;
        if (locAsked) {
          try { await Location.requestForegroundPermissionsAsync(); } catch { /* ignore */ }
        }

        // ── 3. Nearby Devices (Android 12+ only) ────────────────────
        if (Platform.OS === 'android') {
          const sdk = typeof Platform.Version === 'number'
            ? Platform.Version
            : parseInt(String(Platform.Version), 10);
          if (sdk >= 31 && !cancelled) {
            const btAsked = await ask(
              'Tap to check in',
              'Dander uses Bluetooth to recognise you at local businesses and award loyalty points automatically.',
            );
            if (cancelled) return;
            if (btAsked) {
              try {
                await PermissionsAndroid.requestMultiple([
                  PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                  PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                ]);
              } catch { /* ignore */ }
            }
          }
        }

        // 4. Physical Activity — owned by useStepCounter. Intentionally
        //    NOT re-asked here so we don't double-prompt the user.

        // 5. NFC — no runtime permission needed (the OS-level NFC
        //    toggle is what gates it). The PermissionBanner surfaces a
        //    soft prompt to enable NFC if the user has it disabled in
        //    system settings.

        if (!cancelled) await AsyncStorage.setItem(DONE_KEY, '1');
      } catch (err) {
        if (__DEV__) console.warn('[permissionWalkthrough]', (err as Error)?.message);
      }
    })();

    return () => { cancelled = true; };
  }, [isAuth]);
}
