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

import { nfcCheckin, NfcCheckinResponse } from '../api/proximity';

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
 * Called by useTapLinkHandler when a tap URL arrives. POSTs the
 * check-in and emits the result. Throws nothing — any failure is
 * surfaced through the onNfcError listener so the UI can show a
 * lightweight retry toast.
 */
export async function handleTapUrl(url: string): Promise<void> {
  const parsed = parseTapUrl(url);
  if (!parsed) return;
  try {
    const result = await nfcCheckin({
      node_device_id: parsed.node,
      business_id: parsed.business,
    });
    emitSuccess(result);
  } catch (err) {
    emitError(err as Error);
  }
}
