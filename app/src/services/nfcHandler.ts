/**
 * nfcHandler.ts — central handler for incoming NFC App Link URLs.
 *
 * The Dander Node phone emulates an NDEF tag whose URL is
 * https://dander.io/tap?node=<id>&business=<id>. When this app is the
 * default handler for that URL (App Links / Universal Links), Expo
 * Router delivers the URL to us here via Linking. We parse the params,
 * fire POST /api/proximity/nfc-checkin, and emit the result to whichever
 * screen wants to render the coins animation.
 */

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '../env';
import { NfcCheckinResponse } from '../api/proximity';

// Mirrors the storage key used by api/client.ts. We read it directly
// from AsyncStorage so a cold-start NFC tap works even before
// AuthContext has restored the in-memory token (the api/client
// instance's request interceptor reads from in-memory state, which is
// null at that point).
const TOKEN_KEY = 'dander_access_token';

type Listener = (result: NfcCheckinResponse) => void;
type ErrorListener = (err: Error) => void;

const successListeners = new Set<Listener>();
const errorListeners = new Set<ErrorListener>();

export function onNfcCheckin(cb: Listener): () => void {
  successListeners.add(cb);
  return () => successListeners.delete(cb);
}

export function onNfcError(cb: ErrorListener): () => void {
  errorListeners.add(cb);
  return () => errorListeners.delete(cb);
}

function emitSuccess(result: NfcCheckinResponse) {
  for (const cb of successListeners) {
    try { cb(result); } catch { /* swallow */ }
  }
}

function emitError(err: Error) {
  for (const cb of errorListeners) {
    try { cb(err); } catch { /* swallow */ }
  }
}

/**
 * Parse a Dander tap URL and extract the (node, business) pair.
 *   https://dander.io/tap?node=<id>&business=<id>
 * Returns null if the URL doesn't match the expected shape.
 */
export function parseTapUrl(url: string | null | undefined): { node: string; business: number } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.pathname !== '/tap' && u.pathname !== '/tap/') return null;
    const node = u.searchParams.get('node');
    const business = parseInt(u.searchParams.get('business') || '', 10);
    if (!node || !Number.isFinite(business)) return null;
    return { node, business };
  } catch {
    return null;
  }
}

/**
 * Called by app/tap.tsx when expo-router routes the tap URL to it.
 * POSTs the check-in and emits the result. Throws nothing — any
 * failure is surfaced through the onNfcError listener so the UI can
 * show a lightweight retry toast.
 */
/**
 * Public re-entry point for screens/services that didn't come through
 * an NFC tap themselves but still want to trigger the coins overlay —
 * e.g. the user socket hook converts a points_awarded WebSocket event
 * into a synthesised NfcCheckinResponse and pumps it through here so
 * NfcCheckInScreen plays the same animation it does for a real tap.
 */
export function triggerCheckInOverlay(result: NfcCheckinResponse): void {
  emitSuccess(result);
}

/**
 * Parse a Dander till URL.
 *   https://dander.io/till?business=<id>
 * Returns null if it doesn't match.
 */
export function parseTillUrl(url: string | null | undefined): { business: number } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.pathname !== '/till' && u.pathname !== '/till/') return null;
    const business = parseInt(u.searchParams.get('business') || '', 10);
    if (!Number.isFinite(business)) return null;
    return { business };
  } catch {
    return null;
  }
}

/**
 * Called by app/till.tsx when expo-router routes the till URL to it.
 * POSTs the arrive event so the business dashboard sees the customer
 * profile. NO points are awarded by this call — the customer is shown
 * a "staff will process" toast and the coins overlay fires later when
 * the points_awarded WebSocket event arrives.
 */
export async function handleTillUrl(url: string): Promise<void> {
  console.log('[handleTillUrl] called with:', url);
  const parsed = parseTillUrl(url);
  if (!parsed) {
    console.warn('[handleTillUrl] url did not parse to business — skipping');
    return;
  }
  try {
    let token: string | null = null;
    try { token = await AsyncStorage.getItem(TOKEN_KEY); } catch { /* unauth still posts; backend will reject */ }
    if (!token) {
      console.warn('[handleTillUrl] no auth token — skipping till-arrive');
      return;
    }
    console.log('[handleTillUrl] posting to till-arrive');
    const response = await axios.post(
      `${env.API_URL}/api/proximity/till-arrive`,
      { business_id: parsed.business },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15_000,
      },
    );
    console.log('[handleTillUrl] response:', JSON.stringify(response.data));
  } catch (err) {
    console.error('[handleTillUrl] error:', err);
    emitError(err as Error);
  }
}

export async function handleTapUrl(url: string): Promise<void> {
  console.log('[handleTapUrl] called with:', url);
  const parsed = parseTapUrl(url);
  if (!parsed) {
    console.warn('[handleTapUrl] url did not parse to (node, business) — skipping');
    return;
  }
  try {
    // Bypass api/client and call axios directly. The shared client's
    // request interceptor reads an in-memory _accessToken that may not
    // be populated yet on a cold-start NFC tap (AuthContext restores
    // it asynchronously on boot). Pulling the JWT from AsyncStorage
    // here is robust against that race.
    let token: string | null = null;
    try { token = await AsyncStorage.getItem(TOKEN_KEY); } catch { /* unauth still posts */ }

    console.log('[handleTapUrl] posting to nfc-checkin');
    const response = await axios.post<NfcCheckinResponse>(
      `${env.API_URL}/api/proximity/nfc-checkin`,
      { node_device_id: parsed.node, business_id: parsed.business },
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 15_000,
      },
    );
    console.log('[handleTapUrl] response:', JSON.stringify(response.data));
    emitSuccess(response.data);
  } catch (err) {
    console.error('[handleTapUrl] error:', err);
    emitError(err as Error);
  }
}
