// Carries the NFC tap context (node + business) across the login/register
// detour so a logged-out or brand-new user still earns at the end of the flow.
// sessionStorage survives page reload and same-tab SPA navigation; a 30-minute
// TTL and clear-on-consume stop a stale or abandoned tap replaying later.

const KEY = 'tapprove_pending_tap';
export const PENDING_TAP_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function setPendingTap({ node, business }) {
  const businessId = Number(business);
  if (!node || !Number.isFinite(businessId)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ node, business: businessId, ts: Date.now() }));
  } catch { /* storage unavailable — ignore */ }
}

export function getPendingTap() {
  let raw;
  try { raw = sessionStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;

  let parsed;
  try { parsed = JSON.parse(raw); } catch { clearPendingTap(); return null; }

  const businessId = Number(parsed?.business);
  const fresh = typeof parsed?.ts === 'number' && (Date.now() - parsed.ts) <= PENDING_TAP_TTL_MS;
  if (!parsed?.node || !Number.isFinite(businessId) || !fresh) {
    clearPendingTap();
    return null;
  }
  return { node: parsed.node, business: businessId };
}

export function clearPendingTap() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
