/**
 * usePoints — single source of truth for the user's loyalty status and
 * monthly leaderboard position. Also fires the once-per-UTC-day login
 * claim the first time it mounts in an authenticated session.
 *
 * Callers can read `{ loyalty, me, loading, refresh }` and use any of the
 * derived fields without needing to think about how they're fetched.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import {
  getLoyalty,
  claimDailyLogin,
  LoyaltyStatus,
} from '../api/users';
import { getMyRank, LeaderboardRow } from '../api/leaderboard';

interface UsePointsResult {
  loyalty:  LoyaltyStatus | null;
  me:       LeaderboardRow | null;
  loading:  boolean;
  refresh:  () => Promise<void>;
}

export function usePoints(): UsePointsResult {
  const { isAuth } = useAuth();
  const [loyalty, setLoyalty] = useState<LoyaltyStatus | null>(null);
  const [me, setMe]           = useState<LeaderboardRow | null>(null);
  const [loading, setLoading] = useState(false);

  // Daily-login claim is fire-and-forget; the ref guards against double
  // claims on remount during the same session.
  const dailyClaimed = useRef(false);

  const load = useCallback(async () => {
    if (!isAuth) return;
    setLoading(true);
    const [l, r] = await Promise.allSettled([getLoyalty(), getMyRank()]);
    if (l.status === 'fulfilled') setLoyalty(l.value);
    if (r.status === 'fulfilled') setMe(r.value);
    setLoading(false);
  }, [isAuth]);

  useEffect(() => {
    if (!isAuth) {
      setLoyalty(null);
      setMe(null);
      dailyClaimed.current = false;
      return;
    }

    void load();

    if (!dailyClaimed.current) {
      dailyClaimed.current = true;
      claimDailyLogin()
        .then((res) => {
          // If we actually earned points, refresh so the new balance shows.
          if (res.points_awarded > 0) void load();
        })
        .catch(() => { /* non-fatal */ });
    }
  }, [isAuth, load]);

  return { loyalty, me, loading, refresh: load };
}
