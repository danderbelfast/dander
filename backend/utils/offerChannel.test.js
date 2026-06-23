const { test } = require('node:test');
const assert = require('node:assert');
const { isValidChannel, normalizeChannel, VALID_CHANNELS } = require('./offerChannel');

test('VALID_CHANNELS are app/web/sticker', () => {
  assert.deepStrictEqual([...VALID_CHANNELS].sort(), ['app', 'sticker', 'web']);
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
