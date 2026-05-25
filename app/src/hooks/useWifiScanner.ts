/**
 * useWifiScanner — starts the WiFi scan loop and the location watcher
 * that feeds it. Mounted in <SideEffects /> at the root of the app.
 *
 * Flow on each auth flip → true:
 *   1. Request foreground location permission.
 *   2. Read an initial position (so the scanner has a location for its
 *      first cycle without waiting for the watcher to fire).
 *   3. Start the scan loop with that initial position.
 *   4. Subscribe to watchPositionAsync with a 50 m / 30 s threshold and
 *      push every meaningful update into setCurrentLocation().
 *
 * Cleanup tears down both the location subscription and the scan loop.
 * Silent no-op when permission is denied or location is unavailable
 * (the scan loop self-disables when currentLocation is null).
 */

import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';

import {
  setCurrentLocation,
  startBackgroundScanning,
  stopBackgroundScanning,
} from '../services/wifiScanner';
import { useAuth } from '../context/AuthContext';

const MIN_MOVE_M = 50;     // ignore location updates inside this radius
const POLL_MS    = 30_000; // hint to expo-location; the threshold below dominates

// Haversine, metres. Same formula as the backend's fraudChecks.haversineMetres.
function metresBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function useWifiScanner() {
  const { isAuth } = useAuth();
  const lastPushed = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!isAuth) return;
    let cancelled = false;
    let watcher: Location.LocationSubscription | null = null;

    (async () => {
      try {
        // ── 1. Permission ────────────────────────────────────────────
        const existing = await Location.getForegroundPermissionsAsync();
        const perm = existing.granted
          ? existing
          : await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          console.warn('[useWifiScanner] Location permission not granted — scanning disabled.');
          return;
        }

        // ── 2. Initial position ─────────────────────────────────────
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).catch(() => null);
        if (cancelled) return;

        let initLoc: { latitude: number; longitude: number; accuracy?: number } | undefined;
        if (initial) {
          initLoc = {
            latitude:  initial.coords.latitude,
            longitude: initial.coords.longitude,
            accuracy:  initial.coords.accuracy ?? undefined,
          };
          lastPushed.current = { latitude: initLoc.latitude, longitude: initLoc.longitude };
        }

        // ── 3. Start scanner with initial location ──────────────────
        const started = await startBackgroundScanning(initLoc);
        if (!started) return;

        // ── 4. Watch for movement ───────────────────────────────────
        watcher = await Location.watchPositionAsync(
          {
            accuracy:         Location.Accuracy.Balanced,
            distanceInterval: MIN_MOVE_M,
            timeInterval:     POLL_MS,
          },
          (loc) => {
            const here = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            // Belt + braces — expo-location's distanceInterval isn't always
            // honoured exactly. Apply our own 50 m gate too.
            if (
              lastPushed.current &&
              metresBetween(lastPushed.current, here) < MIN_MOVE_M
            ) {
              return;
            }
            lastPushed.current = here;
            setCurrentLocation({
              ...here,
              accuracy: loc.coords.accuracy ?? undefined,
            });
          }
        );
      } catch (err) {
        if (__DEV__) console.warn('[useWifiScanner] start failed', err);
      }
    })();

    return () => {
      cancelled = true;
      if (watcher) { try { watcher.remove(); } catch {} }
      stopBackgroundScanning();
      setCurrentLocation(null);
    };
  }, [isAuth]);
}
