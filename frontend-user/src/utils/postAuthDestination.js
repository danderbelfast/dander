import { getPendingTap } from '../services/tapContext';
import { getReturnPath, clearReturnPath } from '../services/returnPath';

// Where to send a user the moment a session becomes real. Priority:
//  1. A pending NFC tap → replay it (the /tap route consumes it after award).
//  2. A stashed return path (e.g. an offer they tried to claim) → consumed here.
//  3. Otherwise the home screen.
export function postAuthDestination() {
  const pending = getPendingTap();
  if (pending) {
    const node = encodeURIComponent(pending.node);
    const business = encodeURIComponent(String(pending.business));
    return `/tap?node=${node}&business=${business}`;
  }
  const ret = getReturnPath();
  if (ret) { clearReturnPath(); return ret; }
  return '/home';
}
