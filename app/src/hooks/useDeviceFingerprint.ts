/**
 * useDeviceFingerprint — call POST /api/device/fingerprint once when the
 * user is authenticated. Runs silently; the response (including the
 * `flagged` status) is stored in AsyncStorage for downstream services
 * (points system) to read. The user is never told they're flagged.
 */

import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceFingerprint } from '../utils/fingerprint';
import { postFingerprint } from '../api/device';
import { useAuth } from '../context/AuthContext';

const FLAGGED_KEY        = 'tapprove_device_flagged';
const FLAG_REASON_KEY    = 'tapprove_device_flag_reason';
const LAST_REPORT_AT_KEY = 'tapprove_fingerprint_last_at';

export function useDeviceFingerprint() {
  const { isAuth, user } = useAuth();

  useEffect(() => {
    if (!isAuth) return;
    let cancelled = false;

    (async () => {
      try {
        const payload = await getDeviceFingerprint();
        const res     = await postFingerprint(payload);
        if (cancelled) return;

        // Silent: store the flag result, do not surface to the user.
        await Promise.all([
          AsyncStorage.setItem(FLAGGED_KEY,        res.flagged ? '1' : '0'),
          AsyncStorage.setItem(FLAG_REASON_KEY,    res.flag_reason ?? ''),
          AsyncStorage.setItem(LAST_REPORT_AT_KEY, new Date().toISOString()),
        ]);
      } catch {
        // Swallow — fingerprinting failure must never block app boot.
      }
    })();

    return () => { cancelled = true; };
    // Re-run if the authenticated user changes (login after logout etc.).
  }, [isAuth, user?.id]);
}

/**
 * Read whether this install is currently flagged. Use in the points
 * system to silently suppress rewards.
 */
export async function isFlagged(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FLAGGED_KEY)) === '1';
  } catch {
    return false;
  }
}
