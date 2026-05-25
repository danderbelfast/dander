/**
 * stepCounter.ts — Pedometer-driven step accumulation, posted to the
 * backend every 5 minutes and on app backgrounding.
 *
 * • Today's running total is held in memory and mirrored to AsyncStorage
 *   (`dander_steps_today`) so it survives app restarts inside the same
 *   UTC day. A stored value with a different date is treated as a new
 *   day — counter resets to zero.
 *
 * • Uses expo-sensors Pedometer.watchStepCount(). The native step
 *   subscription returns increments since the subscription started, so
 *   we add those to whatever was already accumulated for today.
 *
 * • Pedometer.isAvailableAsync() is checked first. On simulators and
 *   devices without a pedometer the service no-ops cleanly.
 *
 * Chris: call startStepCounting() in the app's main component on mount
 * (or after location permission is granted, alongside the wifi scanner).
 */

import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';

import { client } from '../api/client';

const STORAGE_KEY    = 'dander_steps_today';
const POST_INTERVAL  = 5 * 60 * 1000; // 5 minutes
const ENDPOINT       = '/api/steps';

interface StoredState {
  date:  string;  // YYYY-MM-DD (UTC)
  steps: number;
}

let running           = false;
let subscription:        { remove: () => void } | null = null;
let appStateSub:         { remove: () => void } | null = null;
let postTimer:           ReturnType<typeof setInterval> | null = null;
let stepsToday        = 0;
let baseline          = 0; // steps the watcher had emitted by the time we last persisted
let started           = false;

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadFromStorage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) { stepsToday = 0; return; }
    const parsed: StoredState = JSON.parse(raw);
    if (parsed?.date === utcDate() && typeof parsed.steps === 'number') {
      stepsToday = parsed.steps;
    } else {
      stepsToday = 0; // rolled over a day
    }
  } catch {
    stepsToday = 0;
  }
}

async function persist(): Promise<void> {
  try {
    const state: StoredState = { date: utcDate(), steps: stepsToday };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

async function postSteps(): Promise<void> {
  if (stepsToday <= 0) return;
  try {
    await client.post(ENDPOINT, {
      steps:           Math.round(stepsToday),
      logged_at:       utcDate(),
    });
  } catch {
    // Silent — the next interval will retry with the latest total.
  }
}

function onPedometerUpdate(result: { steps: number }): void {
  // result.steps is cumulative since the watch subscription started.
  if (!Number.isFinite(result?.steps)) return;
  const delta = result.steps - baseline;
  if (delta <= 0) return;
  baseline = result.steps;
  stepsToday += delta;
  // Persist on every increment so a crash mid-walk doesn't lose progress.
  void persist();
}

function onAppStateChange(next: AppStateStatus): void {
  // Push our latest count whenever we lose foreground focus.
  if (next === 'background' || next === 'inactive') {
    void postSteps();
  }
}

/**
 * Start watching steps. Safe to call more than once — repeated calls
 * are no-ops while a subscription is active. Returns true if step
 * counting actually started, false if the device can't provide it.
 */
export async function startStepCounting(): Promise<boolean> {
  if (started) return running;
  started = true;

  let available = false;
  try {
    available = await Pedometer.isAvailableAsync();
  } catch {
    available = false;
  }
  if (!available) {
    console.warn('[stepCounter] Pedometer not available on this device.');
    started = false;
    return false;
  }

  await loadFromStorage();
  baseline = 0;

  try {
    subscription = Pedometer.watchStepCount(onPedometerUpdate);
  } catch (err) {
    console.warn('[stepCounter] watchStepCount failed:', err);
    started = false;
    return false;
  }

  appStateSub = AppState.addEventListener('change', onAppStateChange);
  postTimer   = setInterval(() => { void postSteps(); }, POST_INTERVAL);
  running     = true;

  // Push once on start so the server has the persisted-from-storage total.
  void postSteps();
  return true;
}

/**
 * Stop watching. Idempotent.
 */
export function stopStepCounting(): void {
  if (subscription) { try { subscription.remove(); } catch {} subscription = null; }
  if (appStateSub)  { try { appStateSub.remove();  } catch {} appStateSub  = null; }
  if (postTimer)    { clearInterval(postTimer); postTimer = null; }
  running = false;
  started = false;
}

/**
 * The current in-memory step count for today (UTC). Useful for the
 * Rewards / Profile screens.
 */
export function getTodaySteps(): number {
  return Math.round(stepsToday);
}
