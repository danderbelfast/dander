/**
 * useLiveSteps — display-only live step count for today (UTC).
 *
 * Display only — never hits the network. The background sync pipeline in
 * services/stepCounter.ts is what actually persists steps to the backend.
 *
 * How it works:
 *   - On mount, query Pedometer.getStepCountAsync(midnightUTC, now) for the
 *     baseline (iOS provides this; Android usually doesn't, so we fall back
 *     to the AsyncStorage value the background service writes).
 *   - Then subscribe to Pedometer.watchStepCount() and add its cumulative
 *     delta to the baseline on every tick.
 *
 * Returns the total, or `null` if no pedometer is available so the caller
 * can fall back to the server-side count.
 */

import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';

import { watchLiveSteps } from '../services/stepCounter';

const STORAGE_KEY = 'dander_steps_today'; // matches services/stepCounter.ts

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function utcMidnightToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
}

async function readStoredBaseline(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (parsed?.date === utcDate() && typeof parsed.steps === 'number') {
      return parsed.steps;
    }
  } catch { /* ignore */ }
  return 0;
}

export default function useLiveSteps(): number | null {
  const [total, setTotal] = useState<number | null>(null);
  const baselineRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      let available = false;
      try {
        available = await Pedometer.isAvailableAsync();
      } catch {
        available = false;
      }
      if (!available || cancelled) {
        if (!cancelled) setTotal(null);
        return;
      }

      // Baseline — try the platform API first (works on iOS). If it throws
      // (Android typically), fall back to what the background service has
      // already persisted to AsyncStorage.
      let baseline = 0;
      try {
        const result = await Pedometer.getStepCountAsync(utcMidnightToday(), new Date());
        baseline = Math.max(0, Math.round(result?.steps ?? 0));
      } catch {
        baseline = await readStoredBaseline();
      }

      if (cancelled) return;
      baselineRef.current = baseline;
      setTotal(baseline);

      unsubscribe = watchLiveSteps((delta) => {
        if (cancelled) return;
        setTotal(baselineRef.current + Math.max(0, Math.round(delta)));
      });
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return total;
}
