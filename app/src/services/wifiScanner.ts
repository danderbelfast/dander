/**
 * wifiScanner.ts — Android-only WiFi scan loop that posts batches to
 * POST /api/wifi/observations.
 *
 * ── Platform support ──────────────────────────────────────────
 *   Android  →  full scan via react-native-wifi-reborn (requires
 *               ACCESS_FINE_LOCATION + ACCESS_WIFI_STATE).
 *   iOS      →  no public API for scanning nearby networks; this
 *               module no-ops (start() returns immediately).
 *
 * ── Runtime requirements ──────────────────────────────────────
 *   react-native-wifi-reborn ships native code, so this must run in
 *   an EAS dev-client / production build — Expo Go will crash on
 *   require. See README.
 */

import { Platform } from 'react-native';
import * as Location from 'expo-location';

import { postObservations, WifiObservation } from '../api/wifi';

// Dynamic import to avoid throwing in Expo Go on first render (the
// native module isn't bundled there). On iOS we don't import it at all.
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

const SCAN_INTERVAL_MS = 60_000; // every minute when running
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

interface ScanRecord {
  BSSID:           string;
  SSID?:           string;
  level?:          number; // dBm
  capabilities?:   string;
  frequency?:      number;
  timestamp?:      number;
}

/**
 * Ask for foreground location permission. WiFi scanning on Android 6+
 * is gated behind location, even though it's not a GPS API call.
 */
async function ensureLocationPermission(): Promise<boolean> {
  const cur = await Location.getForegroundPermissionsAsync();
  if (cur.granted) return true;
  const req = await Location.requestForegroundPermissionsAsync();
  return req.granted;
}

/**
 * Start the scan loop. Safe to call multiple times — second + Nth
 * calls are no-ops while a loop is already running.
 *
 * Returns false on platforms where scanning isn't possible (iOS or
 * native module missing) or when permissions aren't granted.
 */
export async function startWifiScanner(): Promise<boolean> {
  if (running) return true;
  if (Platform.OS !== 'android' || !wifiLib) return false;

  const granted = await ensureLocationPermission();
  if (!granted) return false;

  running = true;
  // Run one scan immediately, then on an interval.
  void runOneScan();
  timer = setInterval(() => { void runOneScan(); }, SCAN_INTERVAL_MS);
  return true;
}

export function stopWifiScanner(): void {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
}

async function runOneScan(): Promise<void> {
  if (!wifiLib) return;
  try {
    // Reload nearby networks. Some forks rename this — alias both.
    const list: ScanRecord[] = await (wifiLib as any).reScanAndLoadWifiList?.()
      ?? await (wifiLib as any).loadWifiList?.()
      ?? [];

    if (list.length === 0) return;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }).catch(() => null);
    if (!loc) return;

    const capturedAt = new Date().toISOString();
    const observations: WifiObservation[] = list
      .filter((r) => r && typeof r.BSSID === 'string')
      .map((r) => ({
        bssid:           r.BSSID,
        ssid:            r.SSID ?? null,
        signal_strength: typeof r.level === 'number' ? r.level : undefined,
        latitude:        loc.coords.latitude,
        longitude:       loc.coords.longitude,
        accuracy_metres: loc.coords.accuracy != null
          ? Math.round(loc.coords.accuracy)
          : undefined,
        captured_at:     capturedAt,
      }));

    if (observations.length === 0) return;
    await postObservations(observations);
  } catch (err) {
    // Swallow — scanner runs silently in the background; surfacing
    // errors to the user is intentionally not done here.
    if (__DEV__) console.warn('[wifiScanner] scan failed', err);
  }
}
