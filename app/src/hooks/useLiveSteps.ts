/**
 * useLiveSteps — display-only live step count for today (UTC).
 *
 * Display only — never hits the network. The background sync pipeline in
 * services/stepCounter.ts is what actually persists steps to the backend.
 *
 * How it works:
 *   - On mount, seed display from a per-day AsyncStorage cache
 *     (`dander_live_steps_display` + `dander_steps_date`) so a remount
 *     doesn't flash 0 while the pedometer baseline is loading.
 *   - Query Pedometer.getStepCountAsync(midnightUTC, now) for the real
 *     baseline (iOS provides this; Android usually doesn't, so we fall
 *     back to the AsyncStorage value the background service writes).
 *   - Then subscribe to Pedometer.watchStepCount() and add its cumulative
 *     delta to the baseline on every tick. Each new total is written
 *     back to the display cache so the next remount has a warm value.
 *
 * Returns the total, or `null` if no pedometer is available and there's
 * nothing in cache — the caller falls back to the server-side count in
 * that case.
 */

import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';

import { watchLiveSteps } from '../services/stepCounter';

const SERVICE_BASELINE_KEY = 'tapprove_steps_today';   // shared with services/stepCounter.ts
const DISPLAY_VALUE_KEY    = 'tapprove_live_steps_display';
const DISPLAY_DATE_KEY     = 'tapprove_steps_date';

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

async function readDisplayCache(): Promise<number | null> {
  try {
    const [value, date] = await Promise.all([
      AsyncStorage.getItem(DISPLAY_VALUE_KEY),
      AsyncStorage.getItem(DISPLAY_DATE_KEY),
    ]);
    if (date !== utcDate())   return null;       // stale — rolled past midnight UTC
    if (value == null)        return null;
    const n = parseInt(value, 10);
    if (Number.isNaN(n) || n < 0) return null;
    return n;
  } catch { return null; }
}

function writeDisplayCache(total: number): void {
  // Fire-and-forget; AsyncStorage failure is non-fatal.
  AsyncStorage.setItem(DISPLAY_VALUE_KEY, String(total)).catch(() => {});
  AsyncStorage.setItem(DISPLAY_DATE_KEY,  utcDate()).catch(() => {});
}

async function readServiceBaseline(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SERVICE_BASELINE_KEY);
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
      // 1. Seed instantly from the display cache so a remount doesn't
      //    flash 0 while the rest of the chain is still resolving.
      const cached = await readDisplayCache();
      if (cancelled) return;
      if (cached != null) setTotal(cached);

      // 2. Is there a pedometer? On simulators / devices without one we
      //    return whatever cache we have (or null, signalling fallback).
      let available = false;
      try {
        available = await Pedometer.isAvailableAsync();
      } catch { available = false; }
      if (!available || cancelled) {
        if (!cancelled && cached == null) setTotal(null);
        return;
      }

      // 3. Establish a baseline. iOS exposes getStepCountAsync; on
      //    Android it usually throws and we read the bg service's
      //    AsyncStorage instead.
      let baseline = 0;
      try {
        const result = await Pedometer.getStepCountAsync(utcMidnightToday(), new Date());
        baseline = Math.max(0, Math.round(result?.steps ?? 0));
      } catch {
        baseline = await readServiceBaseline();
      }
      if (cancelled) return;

      baselineRef.current = baseline;
      setTotal(baseline);
      writeDisplayCache(baseline);

      // 4. Live increments.
      unsubscribe = watchLiveSteps((delta) => {
        if (cancelled) return;
        const next = baselineRef.current + Math.max(0, Math.round(delta));
        setTotal(next);
        writeDisplayCache(next);
      });
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return total;
}
