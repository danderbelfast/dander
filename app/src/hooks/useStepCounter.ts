/**
 * useStepCounter — start the Pedometer-driven step accumulator once
 * the user is authenticated. Requests Motion & Fitness / activity-
 * recognition permission before starting; no-ops cleanly if the device
 * can't provide it (simulator, no pedometer hardware, denied permission).
 *
 * The stepCounter service handles the watch loop, AsyncStorage day-
 * bounded caching, and periodic POSTs to /api/steps.
 */

import { useEffect } from 'react';
import { Pedometer } from 'expo-sensors';

import { startStepCounting, stopStepCounting } from '../services/stepCounter';
import { useAuth } from '../context/AuthContext';

export function useStepCounter() {
  const { isAuth } = useAuth();

  useEffect(() => {
    if (!isAuth) return;
    let cancelled = false;

    (async () => {
      try {
        const available = await Pedometer.isAvailableAsync();
        if (!available) {
          console.warn('[useStepCounter] Pedometer not available on this device.');
          return;
        }
        const perm = await Pedometer.requestPermissionsAsync();
        if (!perm?.granted) {
          console.warn('[useStepCounter] Motion permission not granted — steps disabled.');
          return;
        }
        if (cancelled) return;
        await startStepCounting();
      } catch (err) {
        if (__DEV__) console.warn('[useStepCounter] start failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      stopStepCounting();
    };
  }, [isAuth]);
}
