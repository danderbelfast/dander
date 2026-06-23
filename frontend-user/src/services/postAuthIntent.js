// Single source of truth for "what to do after auth". The two intents —
// a pending NFC tap (check-in) and a return path (offer/window) — are
// MUTUALLY EXCLUSIVE: setting one clears the other (most-recent-intent wins).
// This guarantees a check-in only ever originates from a real /tap, and an
// offer-link signup can never inherit a stale check-in.
import { setPendingTap, clearPendingTap } from './tapContext';
import { setReturnPath, clearReturnPath } from './returnPath';

export function setTapIntent({ node, business }) {
  clearReturnPath();
  setPendingTap({ node, business });
}

export function setReturnIntent(path) {
  clearPendingTap();
  setReturnPath(path);
}

export function clearAllIntents() {
  clearPendingTap();
  clearReturnPath();
}
