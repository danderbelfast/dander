/**
 * useStepCounter — start the Pedometer subscription once the user is
 * authenticated and stop it on unmount / logout. Mirrors the gating used
 * by useWifiScanner so step counting never runs for an anonymous user.
 *
 * Devices without a pedometer (most simulators, very old phones) are
 * handled inside startStepCounting() itself — it returns false and the
 * service no-ops, so this hook is safe to mount unconditionally.
 *
 * Android 10+ requires ACTIVITY_RECOGNITION runtime permission before
 * the Pedometer will deliver step events. We request it explicitly here
 * so the user sees the OS prompt the first time they sign in.
 */

import { useEffect } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

import { startStepCounting, stopStepCounting } from '../services/stepCounter';
import { useAuth } from '../context/AuthContext';

async function requestActivityPermission(): Promise<boolean> {
  if (Platform.OS !== 'android')   return true;
  if ((Platform.Version as number) < 29) return true;

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
      {
        title:          'Activity Permission',
        message:        'TapProve needs access to your physical activity to count your steps and reward you for exploring.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('[useStepCounter] permission request failed:', err);
    return false;
  }
}

function useStepCounter() {
  const { isAuth } = useAuth();

  useEffect(() => {
    if (!isAuth) return;

    let cancelled = false;
    (async () => {
      const ok = await requestActivityPermission();
      if (!ok) {
        console.warn('[useStepCounter] activity permission denied — steps disabled.');
        return;
      }
      if (cancelled) return;
      startStepCounting().catch((err) => {
        console.warn('[useStepCounter] start failed:', err);
      });
    })();

    return () => {
      cancelled = true;
      stopStepCounting();
    };
  }, [isAuth]);
}

export default useStepCounter;
