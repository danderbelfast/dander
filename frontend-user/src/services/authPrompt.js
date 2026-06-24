// Offer-context for the auth screen when a logged-out user activates an offer.
// Drives the value-framed banner ("save this offer"). sessionStorage, 30-min TTL.
const KEY = 'tapprove_auth_prompt';
const TTL_MS = 30 * 60 * 1000;

export function setAuthPrompt({ offerTitle } = {}) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ offerTitle: offerTitle ?? null, ts: Date.now() }));
  } catch { /* ignore */ }
}

export function getAuthPrompt() {
  let raw;
  try { raw = sessionStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  let p;
  try { p = JSON.parse(raw); } catch { clearAuthPrompt(); return null; }
  const fresh = typeof p?.ts === 'number' && (Date.now() - p.ts) <= TTL_MS;
  if (!fresh) { clearAuthPrompt(); return null; }
  return { offerTitle: p.offerTitle ?? null };
}

export function clearAuthPrompt() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
