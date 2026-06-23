import { getPendingTap, clearPendingTap } from '../services/tapContext';
import { getReturnPath, clearReturnPath } from '../services/returnPath';

// Where to send a user the moment a session becomes real. The two intents are
// mutually exclusive (see postAuthIntent), but we still consume whichever we
// return so nothing lingers to hijack a later signup. Priority is a belt-and-
// braces tiebreak only — in practice at most one intent is ever set.
export function postAuthDestination() {
  const pending = getPendingTap();
  if (pending) {
    clearPendingTap();
    const node = encodeURIComponent(pending.node);
    const business = encodeURIComponent(String(pending.business));
    return `/tap?node=${node}&business=${business}`;
  }
  const ret = getReturnPath();
  if (ret) { clearReturnPath(); return ret; }
  return '/home';
}
