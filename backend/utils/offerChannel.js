'use strict';

// The three attribution channels an offer can be activated from.
const VALID_CHANNELS = new Set(['app', 'web', 'sticker']);

function isValidChannel(c) {
  return typeof c === 'string' && VALID_CHANNELS.has(c);
}

// Lowercase + validate; returns the canonical channel or null. Used to
// coerce a client-supplied channel (and the sticker ?src param).
function normalizeChannel(c) {
  if (typeof c !== 'string') return null;
  const v = c.toLowerCase();
  return VALID_CHANNELS.has(v) ? v : null;
}

// Fine attribution source (e.g. 'sticker_window'): lowercase, [a-z0-9_], <=32.
function normalizeSource(raw) {
  if (typeof raw !== 'string') return null;
  const v = raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
  return v.length ? v : null;
}

// Coarse channel derived from the fine source — server-authoritative, so a
// client can't mis-file a sticker activation under web/app. Returns null for
// an empty/non-string source (caller falls back to the client channel).
function channelFromSource(source) {
  if (typeof source !== 'string' || source.length === 0) return null;
  if (source.startsWith('sticker')) return 'sticker';
  if (source === 'app') return 'app';
  return 'web';
}

module.exports = { VALID_CHANNELS, isValidChannel, normalizeChannel, normalizeSource, channelFromSource };
