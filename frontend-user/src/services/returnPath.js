// Stashes a safe internal return path so the post-auth chokepoint can send a
// user back where they were (e.g. an offer they tried to claim) after login.
// Mirrors tapContext: sessionStorage, 30-min TTL. Only same-origin internal
// paths are accepted (must start with a single '/').

const KEY = 'tapprove_return_path';
export const RETURN_PATH_TTL_MS = 30 * 60 * 1000; // 30 minutes

function isSafeInternalPath(p) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');
}

export function setReturnPath(path) {
  if (!isSafeInternalPath(path)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path, ts: Date.now() }));
  } catch { /* storage unavailable — ignore */ }
}

export function getReturnPath() {
  let raw;
  try { raw = sessionStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;

  let parsed;
  try { parsed = JSON.parse(raw); } catch { clearReturnPath(); return null; }

  const fresh = typeof parsed?.ts === 'number' && (Date.now() - parsed.ts) <= RETURN_PATH_TTL_MS;
  if (!isSafeInternalPath(parsed?.path) || !fresh) {
    clearReturnPath();
    return null;
  }
  return parsed.path;
}

export function clearReturnPath() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
