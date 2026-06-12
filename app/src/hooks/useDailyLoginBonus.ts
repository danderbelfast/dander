/**
 * useDailyLoginBonus — POST /api/users/daily-login at most once per UTC
 * day, locally deduped via AsyncStorage so re-renders / quick relaunches
 * don't hammer the endpoint.
 *
 * The backend dedups too, but the AsyncStorage cache stops us from making
 * a network call we already know will be a no-op.
 */

import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { claimDailyLogin } from '../api/users';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'tapprove_last_login_bonus';

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useDailyLoginBonus() {
  const { isAuth, user } = useAuth();

  useEffect(() => {
    if (!isAuth) return;
    let cancelled = false;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const today  = utcDate();
        if (stored === today) return;          // already handled today

        await claimDailyLogin();
        if (cancelled) return;

        // Persist today's date whether we earned points or the server
        // said already_claimed — either way, we've handled today.
        await AsyncStorage.setItem(STORAGE_KEY, today);
      } catch {
        // Silent — retried on next launch / next isAuth flip.
      }
    })();

    return () => { cancelled = true; };
    // Re-run if the authenticated user changes (login after logout, etc.).
  }, [isAuth, user?.id]);
}
