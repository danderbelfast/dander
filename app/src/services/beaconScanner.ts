/**
 * beaconScanner.ts — background BLE scanner for Dander Nodes.
 *
 * The Dander Node Android app advertises a fixed service UUID. The
 * service data payload encodes the business_id (4 bytes, little-endian
 * int32) and a device_id prefix (8 ASCII chars). When we see a strong
 * signal (RSSI > THRESHOLD) we POST /api/proximity/detected so the
 * backend can run the loyalty flow and enqueue a GIF display command
 * for the Node.
 *
 * The scanner is best-effort:
 *   - If react-native-ble-plx isn't installed (dev builds without it),
 *     start() no-ops and reports back via the callbacks.
 *   - If permissions are missing or Bluetooth is off, ditto.
 *   - Per-node 30-min cooldown so a single visit doesn't fire dozens of
 *     POSTs as the user walks around the store.
 *
 * `react-native-ble-plx` is a native dependency — the app needs a fresh
 * dev/preview EAS build for the scanner to actually scan. Until that
 * build ships, start() will log a one-line dev warning and return.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import { fetchKnownNodes, notifyDetected, KnownNode } from '../api/proximity';

// Fixed TapProve BLE service UUID — must match BleBroadcaster.kt in
// tapprove-node. Value is a stable wire-protocol identifier and does
// NOT change with the rebrand; only the constant name does.
export const TAPPROVE_SERVICE_UUID = '6e646564-616e-6465-7200-000000000001';

// Match the SAME threshold as the spec ("strong RSSI > -70 dBm").
const RSSI_THRESHOLD = -70;

// Per-node cooldown before we'll re-fire proximity detection.
const PER_NODE_COOLDOWN_MS = 30 * 60 * 1000;

// How long the cached known-nodes list is valid.
const KNOWN_CACHE_MS = 60 * 60 * 1000;
const KNOWN_CACHE_KEY = 'dander_known_nodes_v1';

type State = {
  manager: any | null;
  subscription: any | null;
  knownByPrefix: Map<string, KnownNode>;
  knownLoadedAt: number;
  recent: Map<string, number>;        // device_id_prefix -> ts
  onDetected?: (r: { businessName: string; pointsAwarded: number; alreadyVisited: boolean }) => void;
};

const state: State = {
  manager: null,
  subscription: null,
  knownByPrefix: new Map(),
  knownLoadedAt: 0,
  recent: new Map(),
};

function devicePrefix(deviceId: string): string {
  // Mirror the Node-side encoding: strip "node-" prefix, drop dashes,
  // first 8 chars. Stored in BLE service data as US-ASCII.
  return deviceId.replace(/^node-/, '').replace(/-/g, '').slice(0, 8);
}

async function loadKnownNodes(force: boolean) {
  if (!force && Date.now() - state.knownLoadedAt < KNOWN_CACHE_MS) return;

  // Try cache first so the scanner is operational even if the very first
  // network call fails.
  if (state.knownByPrefix.size === 0) {
    try {
      const raw = await AsyncStorage.getItem(KNOWN_CACHE_KEY);
      if (raw) {
        const cached: KnownNode[] = JSON.parse(raw);
        state.knownByPrefix = new Map(cached.map((n) => [devicePrefix(n.device_id), n]));
      }
    } catch { /* ignore */ }
  }

  try {
    const nodes = await fetchKnownNodes();
    state.knownByPrefix = new Map(nodes.map((n) => [devicePrefix(n.device_id), n]));
    state.knownLoadedAt = Date.now();
    try { await AsyncStorage.setItem(KNOWN_CACHE_KEY, JSON.stringify(nodes)); } catch { /* ignore */ }
  } catch {
    // Stay with whatever's already in the map.
  }
}

/**
 * Decode the BLE service data payload — 8 ASCII bytes of device_id
 * prefix. The Node used to also pack business_id into the same field
 * but that pushed the legacy adv packet over its 31-byte budget and
 * triggered ADVERTISE_FAILED_DATA_TOO_LARGE; we now look up
 * business_id from the locally-cached /api/nodes/known map keyed by
 * the same prefix.
 *
 * `data` is base64 in ble-plx's serviceData field.
 */
function decodePrefix(base64: string): string | null {
  try {
    const binary = typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
    if (binary.length < 8) return null;

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    return String.fromCharCode(...Array.from(bytes.slice(0, 8)));
  } catch {
    return null;
  }
}

/**
 * Best-effort module load so non-BLE dev builds don't crash on import.
 * Returns the BleManager constructor or null.
 */
function loadBlePlx(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-ble-plx');
    return mod?.BleManager ?? null;
  } catch {
    return null;
  }
}

/**
 * Request every permission BLE scanning needs on the current Android
 * SDK level. Returns true iff every required permission ended up
 * granted (already-granted counts). Always true on non-Android — iOS
 * surfaces the Bluetooth prompt automatically via the Info.plist
 * NSBluetoothAlwaysUsageDescription key.
 */
export async function ensureBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const sdk = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  // Pre-31 needs FINE_LOCATION for any BLE op. 31+ uses BLUETOOTH_SCAN
  // and BLUETOOTH_CONNECT as runtime perms.
  const needed: string[] = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  if (sdk >= 31) {
    needed.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
    needed.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  }

  try {
    const checks = await Promise.all(needed.map((p) => PermissionsAndroid.check(p as any)));
    if (checks.every(Boolean)) return true;

    const results = await PermissionsAndroid.requestMultiple(needed as any);
    return needed.every((p) => results[p as keyof typeof results] === PermissionsAndroid.RESULTS.GRANTED);
  } catch (e) {
    if (__DEV__) console.warn('[beaconScanner] permission check failed', (e as Error)?.message);
    return false;
  }
}

export async function startBeaconScanner(
  onDetected?: State['onDetected'],
): Promise<boolean> {
  if (state.subscription) return true;        // already scanning
  state.onDetected = onDetected;

  const BleManager = loadBlePlx();
  if (!BleManager) {
    if (__DEV__) console.warn('[beaconScanner] react-native-ble-plx not installed — scan disabled.');
    return false;
  }

  // Explicit permission request — react-native-ble-plx wraps the OS
  // prompts but doesn't tell us *why* a scan returns nothing. Doing it
  // ourselves lets the banner UI react to a clean denial signal.
  const permsOk = await ensureBlePermissions();
  if (!permsOk) {
    if (__DEV__) console.warn('[beaconScanner] required permissions not granted — scan disabled.');
    return false;
  }

  try {
    if (!state.manager) state.manager = new BleManager();

    // Preload the known-nodes map (no await — happy path keeps scanning
    // even on first cold start with no cache yet).
    void loadKnownNodes(false);

    // Filter by service UUID so we don't process every BLE advert on the
    // street. legacyScan: false enables extended advertising on supported
    // chipsets; harmless fallback otherwise.
    state.subscription = state.manager.startDeviceScan(
      [TAPPROVE_SERVICE_UUID],
      { allowDuplicates: true },
      async (err: any, device: any) => {
        if (err) {
          if (__DEV__) console.warn('[beaconScanner] scan error', err?.message);
          return;
        }
        if (!device) return;
        const rssi = typeof device.rssi === 'number' ? device.rssi : null;
        if (rssi == null || rssi < RSSI_THRESHOLD) return;

        const sd = device.serviceData?.[TAPPROVE_SERVICE_UUID];
        if (!sd) return;
        const prefix = decodePrefix(sd);
        if (!prefix) return;

        // Match the prefix back to a known node — discards strays from any
        // unrelated device that happens to advertise the same UUID.
        // business_id comes from the cached row (the BLE payload no longer
        // carries it; doing so blew the 31-byte adv budget).
        const known = state.knownByPrefix.get(prefix);
        if (!known) return;

        // Per-node cooldown.
        const last = state.recent.get(prefix) || 0;
        if (Date.now() - last < PER_NODE_COOLDOWN_MS) return;
        state.recent.set(prefix, Date.now());

        try {
          const res = await notifyDetected({
            node_device_id: known.device_id,
            business_id: known.business_id,
            rssi,
          });
          state.onDetected?.({
            businessName: res.business_name,
            pointsAwarded: res.points_awarded,
            alreadyVisited: res.already_visited,
          });
        } catch (e) {
          if (__DEV__) console.warn('[beaconScanner] notifyDetected failed', (e as Error)?.message);
        }
      },
    );
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[beaconScanner] start failed', (e as Error)?.message);
    return false;
  }
}

export function stopBeaconScanner(): void {
  try {
    if (state.manager?.stopDeviceScan) state.manager.stopDeviceScan();
  } catch { /* ignore */ }
  state.subscription = null;
  state.onDetected = undefined;
}

export function refreshKnownNodes(): Promise<void> {
  return loadKnownNodes(true);
}
