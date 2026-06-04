'use strict';

/**
 * appVersion.js — single source of truth for "what's the latest
 * Dander Node app version" and "what's the floor we still support".
 *
 * Set via Railway env vars at runtime; both default to 1.0.0 so a fresh
 * deploy without env never returns null and the comparison below stays
 * sane.
 *
 * The semver comparison is patch-level (X.Y.Z); anything weirder than
 * that we treat as 0.
 */

const NODE_APP_VERSION  = process.env.NODE_APP_VERSION  || '1.0.0';
const NODE_MIN_SUPPORTED = process.env.NODE_MIN_SUPPORTED || '1.0.0';
const RELEASE_NOTES = process.env.NODE_RELEASE_NOTES
  || 'GIF caching, faster greetings, NFC check-in';

function toParts(v) {
  if (typeof v !== 'string') return [0, 0, 0];
  const [a, b, c] = v.split('.').map((n) => parseInt(n, 10));
  return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0, Number.isFinite(c) ? c : 0];
}

function compare(a, b) {
  const A = toParts(a), B = toParts(b);
  for (let i = 0; i < 3; i++) {
    if (A[i] > B[i]) return  1;
    if (A[i] < B[i]) return -1;
  }
  return 0;
}

function isBehind(current, latest = NODE_APP_VERSION) {
  if (!current) return true;
  return compare(current, latest) < 0;
}

module.exports = {
  nodeAppVersion: NODE_APP_VERSION,
  nodeMinSupported: NODE_MIN_SUPPORTED,
  releaseNotes: RELEASE_NOTES,
  compare,
  isBehind,
};
