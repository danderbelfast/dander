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
import { fetchKnownNodes, notifyDetected, KnownNode } from '../api/proximity';

// Fixed Dander service UUID — must match BleBroadcaster.kt in dander-node.
export const DANDER_SERVICE_UUID = '6e646564-616e-6465-7200-000000000001';

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
 * Decode the BLE service data payload. The Node-side encoding is:
 *   bytes 0..3: business_id (int32 LE)
 *   bytes 4..11: device_id prefix (8 ASCII chars)
 *
 * `data` is base64 in ble-plx's manufacturerData / serviceData fields,
 * so we decode → DataView for the int and then ASCII for the prefix.
 */
function decodePayload(base64: string): { businessId: number; prefix: string } | null {
  try {
    // Cross-platform base64 → byte array.
    const binary = typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
    if (binary.length < 12) return null;

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const view = new DataView(bytes.buffer);
    const businessId = view.getInt32(0, true);
    const prefix = String.fromCharCode(...Array.from(bytes.slice(4, 12)));
    return { businessId, prefix };
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

  try {
    if (!state.manager) state.manager = new BleManager();

    // Preload the known-nodes map (no await — happy path keeps scanning
    // even on first cold start with no cache yet).
    void loadKnownNodes(false);

    // Filter by service UUID so we don't process every BLE advert on the
    // street. legacyScan: false enables extended advertising on supported
    // chipsets; harmless fallback otherwise.
    state.subscription = state.manager.startDeviceScan(
      [DANDER_SERVICE_UUID],
      { allowDuplicates: true },
      async (err: any, device: any) => {
        if (err) {
          if (__DEV__) console.warn('[beaconScanner] scan error', err?.message);
          return;
        }
        if (!device) return;
        const rssi = typeof device.rssi === 'number' ? device.rssi : null;
        if (rssi == null || rssi < RSSI_THRESHOLD) return;

        const sd = device.serviceData?.[DANDER_SERVICE_UUID];
        if (!sd) return;
        const decoded = decodePayload(sd);
        if (!decoded) return;

        // Match the prefix back to a known node — discards strays from any
        // unrelated device that happens to advertise the same UUID.
        const known = state.knownByPrefix.get(decoded.prefix);
        if (!known) return;

        // Per-node cooldown.
        const last = state.recent.get(decoded.prefix) || 0;
        if (Date.now() - last < PER_NODE_COOLDOWN_MS) return;
        state.recent.set(decoded.prefix, Date.now());

        try {
          const res = await notifyDetected({
            node_device_id: known.device_id,
            business_id: decoded.businessId,
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
