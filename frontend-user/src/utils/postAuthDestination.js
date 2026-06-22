import { getPendingTap } from '../services/tapContext';

// Where to send a user the moment a session becomes real. If they arrived via an
// NFC tap before authenticating, replay that tap so earning happens; otherwise
// fall through to the normal home screen. Does NOT clear the pending tap — the
// /tap route consumes it after a successful award.
export function postAuthDestination() {
  const pending = getPendingTap();
  if (!pending) return '/home';
  const node = encodeURIComponent(pending.node);
  const business = encodeURIComponent(String(pending.business));
  return `/tap?node=${node}&business=${business}`;
}
