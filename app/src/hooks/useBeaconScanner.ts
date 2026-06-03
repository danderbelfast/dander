/**
 * useBeaconScanner — starts the background Dander Node BLE scanner on
 * auth, stops it on logout/unmount. Mirrors the useWifiScanner pattern.
 *
 * Permissions: usePermissionWalkthrough owns the first-launch
 * explanation + system prompt. This hook just attempts to start the
 * scanner; if the user denied the prompt earlier, startBeaconScanner
 * returns false and we silently no-op. The PermissionBanner provides
 * the remedial UX path.
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
        // Haptic + log. The NfcCheckInScreen overlay handles full UI.
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
