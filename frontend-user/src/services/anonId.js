// Stable per-device anonymous id for pre-login offer activations.
// GDPR: this is a device identifier — privacy-flagged. Consent/erasure is
// handled by the GDPR pass; do not ship to real users before that lands.
const KEY = 'tapprove_anon_id';

export function getAnonId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage unavailable — return an ephemeral id (won't persist/stitch).
    return crypto?.randomUUID?.() ?? `anon-${Date.now()}`;
  }
}
