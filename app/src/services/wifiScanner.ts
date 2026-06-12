/**
 * wifiScanner.ts — Android-only WiFi scan loop, fully silent.
 *
 *   scanNetworks()                — one-shot scan, returns normalised list
 *   startBackgroundScanning(loc?) — 30-second loop, POSTs each batch
 *   stopBackgroundScanning()      — clears the loop + AppState listener
 *   setCurrentLocation(loc)       — the location-watcher in the hook
 *                                   pushes fresh GPS in here
 *
 * Platform notes:
 *   Android  →  full scan via react-native-wifi-reborn. Requires the user
 *               to have granted ACCESS_FINE_LOCATION (the hook handles
 *               the permission flow — we just bail if the lib refuses).
 *   iOS      →  Apple does not expose any public API to scan nearby
 *               WiFi networks. scanNetworks() returns []; the loop
 *               start function logs a warning and returns false.
 *
 * Runtime notes:
 *   react-native-wifi-reborn ships native code → won't load under
 *   Expo Go. An EAS dev-client / `npx expo run:android` build is
 *   required after any version change to this dep.
 *
 *   When a POST awards points, the backend response's `points_earned`
 *   is added to AsyncStorage('tapprove_pending_points') (cumulative) so a
 *   later "+N points!" UI can pop and clear it.
 */

import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { postObservations, WifiObservation } from '../api/wifi';
import { hapticLight } from './haptics';

// ── Tunables ────────────────────────────────────────────────────────────────
const SCAN_INTERVAL_MS  = 30_000;
const MAX_BATCH         = 50;
const MAX_RETRIES       = 3;
const PENDING_POINTS_KEY = 'tapprove_pending_points';

// ── Native module: dynamic require so iOS / Expo Go don't crash ────────────
type WifiLib = typeof import('react-native-wifi-reborn').default;
let wifiLib: WifiLib | null = null;
if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    wifiLib = require('react-native-wifi-reborn').default as WifiLib;
  } catch {
    wifiLib = null;
  }
}

interface ScanRecord {
  BSSID:         string;
  SSID?:         string;
  level?:        number;
  capabilities?: string;
  frequency?:    number;
  timestamp?:    number;
}

interface AppLocation {
  latitude:  number;
  longitude: number;
  accuracy?: number;
}

interface ScannedNetwork {
  bssid: string;
  ssid:  string | null;
  level: number;
}

// ── State ───────────────────────────────────────────────────────────────────
let currentLocation: AppLocation | null = null;
let timer:           ReturnType<typeof setInterval> | null = null;
let appStateSub:     { remove: () => void } | null = null;
let running   = false;
let foreground = AppState.currentState === 'active';
let cycleInFlight = false;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Lowercase + reject obviously-invalid BSSIDs:
 *   • the all-zero address
 *   • the all-ones (broadcast) address
 *   • multicast/group MACs (LSB of first octet = 1) — router BSSIDs
 *     never have this bit set, so anything that does is junk
 */
function isUsableBssid(bssid: unknown): bssid is string {
  if (typeof bssid !== 'string') return false;
  const lower = bssid.toLowerCase();
  if (lower === '00:00:00:00:00:00') return false;
  if (lower === 'ff:ff:ff:ff:ff:ff') return false;
  const firstOctet = lower.split(':')[0];
  if (!firstOctet) return false;
  const n = parseInt(firstOctet, 16);
  if (Number.isNaN(n)) return false;
  if ((n & 0x01) === 1) return false; // multicast bit
  return true;
}

async function bumpPendingPoints(earned: number): Promise<void> {
  if (!earned || earned <= 0) return;
  // Subtle tap when WiFi scan earned points. No sound — these can fire
  // frequently and a chime every 30s would be tiresome.
  hapticLight();
  try {
    const prior = parseInt((await AsyncStorage.getItem(PENDING_POINTS_KEY)) || '0', 10) || 0;
    await AsyncStorage.setItem(PENDING_POINTS_KEY, String(prior + earned));
  } catch {
    /* AsyncStorage failure is non-fatal — the points still landed server-side */
  }
}

function onAppStateChange(next: AppStateStatus): void {
  foreground = next === 'active';
}

// ── Public: one-shot scan ──────────────────────────────────────────────────

/**
 * Scan for nearby WiFi networks once. Returns an array of `{ bssid, ssid,
 * level }` with BSSIDs already lowercased and broadcast/multicast junk
 * filtered out. iOS and Expo-Go-on-Android both resolve to [].
 */
export async function scanNetworks(): Promise<ScannedNetwork[]> {
  if (Platform.OS !== 'android' || !wifiLib) {
    if (Platform.OS === 'ios' && __DEV__) {
      console.warn('[wifiScanner] iOS cannot scan WiFi networks (OS restriction).');
    }
    return [];
  }

  let list: ScanRecord[] = [];
  try {
    // Some forks rename this; alias both.
    list = await (wifiLib as any).reScanAndLoadWifiList?.()
      ?? await (wifiLib as any).loadWifiList?.()
      ?? [];
  } catch (err) {
    if (__DEV__) console.warn('[wifiScanner] scan failed', err);
    return [];
  }

  return list
    .filter((r): r is ScanRecord & { BSSID: string } => !!r && isUsableBssid(r.BSSID))
    .map((r) => ({
      bssid: r.BSSID.toLowerCase(),
      ssid:  r.SSID ?? null,
      level: typeof r.level === 'number' ? r.level : 0,
    }));
}

// ── Public: location injection ─────────────────────────────────────────────

/**
 * The hook's location watcher calls this whenever the device has moved
 * meaningfully. The scan loop tags each observation with whatever the
 * latest location was at scan time; a scan without a known location is
 * dropped (better than tagging with stale data).
 */
export function setCurrentLocation(loc: AppLocation | null): void {
  currentLocation = loc;
}

// ── POST with retry ────────────────────────────────────────────────────────

async function postWithRetry(observations: WifiObservation[]): Promise<number> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await postObservations(observations);
      return Number(result?.points_earned) || 0;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        if (__DEV__) {
          console.warn(`[wifiScanner] POST failed after ${MAX_RETRIES} attempts; discarding batch.`, err);
        }
        return 0;
      }
      // Linear backoff is fine for a 3-try ceiling.
      await new Promise((r) => setTimeout(r, 1_000 * attempt));
    }
  }
  return 0;
}

// ── One scan cycle ─────────────────────────────────────────────────────────

async function runOneCycle(): Promise<void> {
  if (cycleInFlight) return;     // never overlap a slow POST with a fresh scan
  if (!foreground) return;        // background → silent
  if (!currentLocation) return;   // need a location to tag

  cycleInFlight = true;
  try {
    const scans = await scanNetworks();
    if (scans.length === 0) return;

    const capturedAt = new Date().toISOString();
    const loc = currentLocation;
    const observations: WifiObservation[] = scans
      .slice(0, MAX_BATCH)
      .map((s) => ({
        bssid:           s.bssid,
        ssid:            s.ssid,
        signal_strength: s.level,
        latitude:        loc.latitude,
        longitude:       loc.longitude,
        accuracy_metres: loc.accuracy != null ? Math.round(loc.accuracy) : undefined,
        captured_at:     capturedAt,
      }));

    const earned = await postWithRetry(observations);
    await bumpPendingPoints(earned);
  } finally {
    cycleInFlight = false;
  }
}

// ── Public: start / stop the loop ──────────────────────────────────────────

/**
 * Start the scan loop. Safe to call multiple times — re-calls are no-ops
 * while a loop is already running. Returns false on iOS or if the native
 * module isn't bundled (Expo Go); true once the loop is armed.
 */
export async function startBackgroundScanning(initialLocation?: AppLocation): Promise<boolean> {
  if (running) return true;
  if (Platform.OS !== 'android' || !wifiLib) {
    if (Platform.OS === 'ios' && __DEV__) {
      console.warn('[wifiScanner] iOS cannot scan WiFi — background scanning disabled.');
    }
    return false;
  }

  if (initialLocation) currentLocation = initialLocation;

  appStateSub = AppState.addEventListener('change', onAppStateChange);
  foreground = AppState.currentState === 'active';
  running = true;

  // Kick off the first scan immediately (don't wait 30s for first data).
  void runOneCycle();
  timer = setInterval(() => { void runOneCycle(); }, SCAN_INTERVAL_MS);
  return true;
}

export function stopBackgroundScanning(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (appStateSub) { try { appStateSub.remove(); } catch {} }
  appStateSub = null;
  running = false;
}
