const { test } = require('node:test');
const assert = require('node:assert');
const { isValidChannel, normalizeChannel, VALID_CHANNELS, normalizeSource, channelFromSource } = require('./offerChannel');

test('VALID_CHANNELS are app/web/sticker/social', () => {
  assert.deepStrictEqual([...VALID_CHANNELS].sort(), ['app', 'social', 'sticker', 'web']);
});

test('isValidChannel accepts the three channels', () => {
  assert.strictEqual(isValidChannel('app'), true);
  assert.strictEqual(isValidChannel('web'), true);
  assert.strictEqual(isValidChannel('sticker'), true);
});

test('isValidChannel rejects unknown / empty / non-string', () => {
  assert.strictEqual(isValidChannel('email'), false);
  assert.strictEqual(isValidChannel(''), false);
  assert.strictEqual(isValidChannel(null), false);
  assert.strictEqual(isValidChannel(42), false);
});

test('normalizeChannel maps the sticker ?src and lowercases, else null', () => {
  assert.strictEqual(normalizeChannel('STICKER'), 'sticker');
  assert.strictEqual(normalizeChannel('Web'), 'web');
  assert.strictEqual(normalizeChannel('nonsense'), null);
  assert.strictEqual(normalizeChannel(undefined), null);
});

test('normalizeSource lowercases, strips to [a-z0-9_], caps 32, else null', () => {
  assert.strictEqual(normalizeSource('Sticker_Window'), 'sticker_window');
  assert.strictEqual(normalizeSource('sticker-door!!'), 'stickerdoor');
  assert.strictEqual(normalizeSource('web'), 'web');
  assert.strictEqual(normalizeSource('x'.repeat(40)), 'x'.repeat(32));
  assert.strictEqual(normalizeSource('   '), null);
  assert.strictEqual(normalizeSource(''), null);
  assert.strictEqual(normalizeSource(undefined), null);
});

test('channelFromSource derives the coarse bucket (server-authoritative)', () => {
  assert.strictEqual(channelFromSource('sticker_window'), 'sticker');
  assert.strictEqual(channelFromSource('sticker'), 'sticker');
  assert.strictEqual(channelFromSource('app'), 'app');
  assert.strictEqual(channelFromSource('web'), 'web');
  assert.strictEqual(channelFromSource('promo_email'), 'web'); // unknown → web
  assert.strictEqual(channelFromSource(null), null);
  assert.strictEqual(channelFromSource(''), null);
});

test('VALID_CHANNELS includes social', () => {
  assert.strictEqual(VALID_CHANNELS.has('social'), true);
});

test('channelFromSource maps social_* to social', () => {
  assert.strictEqual(channelFromSource('social_facebook'), 'social');
  assert.strictEqual(channelFromSource('social_instagram'), 'social');
  assert.strictEqual(channelFromSource('social_other'), 'social');
  assert.strictEqual(channelFromSource('social'), 'social');
});
