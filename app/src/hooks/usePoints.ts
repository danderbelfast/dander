/**
 * usePoints — composite hook that fetches the user's loyalty status +
 * their monthly leaderboard row, and pairs it with the locally-tracked
 * step count from the in-app Pedometer service.
 *
 *   • GET /api/users/loyalty       — totalPoints, tier
 *   • GET /api/leaderboard/me      — rank + monthly totals
 *   • getTodaySteps() (local)      — today's running step count
 *
 * Refresh cadence:
 *   - on mount and on auth/user change
 *   - every REFRESH_MS while the app is in the foreground
 *   - whenever the app returns to 'active' from background
 *
 * Quietly no-ops while the user is unauthenticated; values default to 0.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { getLoyaltyStatus } from '../api/users';
import { getMyLeaderboard } from '../api/leaderboard';
import { getTodaySteps } from '../services/stepCounter';

const REFRESH_MS = 30_000;

export interface PointsSummary {
  totalPoints:           number;
  lifetimePoints:        number;
  tier:                  string;
  rank:                  number | null;
  pointsThisMonth:       number;
  stepsToday:            number;
  stepsThisMonth:        number;
  wifiNetworksThisMonth: number;
  loading:               boolean;
  error:                 string | null;
  refresh:               () => Promise<void>;
}

const EMPTY = {
  totalPoints:           0,
  lifetimePoints:        0,
  tier:                  'bronze',
  rank:                  null as number | null,
  pointsThisMonth:       0,
  stepsToday:            0,
  stepsThisMonth:        0,
  wifiNetworksThisMonth: 0,
};

export function usePoints(): PointsSummary {
  const { isAuth, user } = useAuth();
  const [state, setState]   = useState(EMPTY);
  const [loading, setLoad]  = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!isAuth) return;
    setLoad(true);
    try {
      const [loyalty, me] = await Promise.all([
        getLoyaltyStatus().catch(() => null),
        getMyLeaderboard().catch(() => null),
      ]);
      if (!mounted.current) return;
      // Server is now the authoritative source for step totals
      // (loyaltyService.getLoyaltyStatus exposes user_loyalty.steps_*).
      // Pad stepsToday with the locally-counted total so the UI feels
      // live between POST cycles — Math.max can only grow within a day.
      const serverToday = loyalty?.steps_today ?? 0;
      const localToday  = getTodaySteps();
      setState({
        totalPoints:           loyalty?.total_points ?? 0,
        lifetimePoints:        loyalty?.lifetime_points ?? 0,
        tier:                  loyalty?.tier ?? 'bronze',
        rank:                  me?.rank ?? null,
        pointsThisMonth:       me?.points_this_month ?? 0,
        stepsToday:            Math.max(serverToday, localToday),
        stepsThisMonth:        loyalty?.steps_this_month ?? me?.steps_this_month ?? 0,
        wifiNetworksThisMonth: me?.wifi_networks_this_month ?? 0,
      });
      setError(null);
    } catch (err: unknown) {
      if (!mounted.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to load points.';
      setError(msg);
    } finally {
      if (mounted.current) setLoad(false);
    }
  }, [isAuth]);

  // Track mounted to avoid setState on unmounted components.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Initial fetch + re-fetch when auth flips or the user id changes.
  useEffect(() => {
    if (!isAuth) {
      setState(EMPTY);
      setError(null);
      return;
    }
    void refresh();
  }, [isAuth, user?.id, refresh]);

  // Polling — only while authenticated and foregrounded.
  useEffect(() => {
    if (!isAuth) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    let foreground = AppState.currentState === 'active';

    const arm = () => {
      if (timer || !foreground) return;
      timer = setInterval(() => { void refresh(); }, REFRESH_MS);
    };
    const disarm = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };
    arm();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const becameActive = foreground !== true && next === 'active';
      foreground = next === 'active';
      if (foreground) {
        if (becameActive) void refresh();
        arm();
      } else {
        disarm();
      }
    });

    return () => {
      disarm();
      sub.remove();
    };
  }, [isAuth, refresh]);

  return { ...state, loading, error, refresh };
}
