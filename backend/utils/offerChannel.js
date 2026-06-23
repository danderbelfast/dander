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

module.exports = { VALID_CHANNELS, isValidChannel, normalizeChannel };
