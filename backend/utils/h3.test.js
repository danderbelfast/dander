'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getH3Indexes, getNeighbourHexes, hexToLatLng, isValidH3Index } = require('./h3');

// Sample location: Belfast city centre.
const BELFAST = { lat: 54.5973, lng: -5.9301 };

// ── getH3Indexes ────────────────────────────────────────────────────────────

test('getH3Indexes returns r8/r10/r12 hex strings for a real location', () => {
  const i = getH3Indexes(BELFAST.lat, BELFAST.lng);
  assert.equal(typeof i.r8, 'string');
  assert.equal(typeof i.r10, 'string');
  assert.equal(typeof i.r12, 'string');
  assert.ok(isValidH3Index(i.r8));
  assert.ok(isValidH3Index(i.r10));
  assert.ok(isValidH3Index(i.r12));
  // Hexes at different resolutions for the same point differ.
  assert.notEqual(i.r8, i.r10);
  assert.notEqual(i.r10, i.r12);
});

test('getH3Indexes works at boundary values (poles, antimeridian, origin)', () => {
  for (const [lat, lng] of [[90, 0], [-90, 0], [0, 180], [0, -180], [0, 0]]) {
    const i = getH3Indexes(lat, lng);
    assert.ok(isValidH3Index(i.r10), `r10 should be valid at ${lat},${lng}`);
  }
});

test('getH3Indexes rejects out-of-range latitude', () => {
  assert.throws(() => getH3Indexes(91, 0), TypeError);
  assert.throws(() => getH3Indexes(-91, 0), TypeError);
  assert.throws(() => getH3Indexes(180, 0), TypeError);
});

test('getH3Indexes rejects out-of-range longitude', () => {
  assert.throws(() => getH3Indexes(0, 181), TypeError);
  assert.throws(() => getH3Indexes(0, -181), TypeError);
  assert.throws(() => getH3Indexes(0, 360), TypeError);
});

test('getH3Indexes rejects non-finite numbers', () => {
  assert.throws(() => getH3Indexes(NaN, 0), TypeError);
  assert.throws(() => getH3Indexes(0, NaN), TypeError);
  assert.throws(() => getH3Indexes(Infinity, 0), TypeError);
  assert.throws(() => getH3Indexes(0, -Infinity), TypeError);
});

test('getH3Indexes rejects null/undefined/non-numeric', () => {
  assert.throws(() => getH3Indexes(null, 0), TypeError);
  assert.throws(() => getH3Indexes(0, null), TypeError);
  assert.throws(() => getH3Indexes(undefined, 0), TypeError);
  assert.throws(() => getH3Indexes(0, undefined), TypeError);
  assert.throws(() => getH3Indexes('54', -5), TypeError);
  assert.throws(() => getH3Indexes(true, false), TypeError);
});

// ── getNeighbourHexes ───────────────────────────────────────────────────────

test('getNeighbourHexes(centre, 0) returns just the centre', () => {
  const { r10 } = getH3Indexes(BELFAST.lat, BELFAST.lng);
  assert.deepEqual(getNeighbourHexes(r10, 0), [r10]);
});

test('getNeighbourHexes(centre, 1) returns the centre + 6 neighbours', () => {
  const { r10 } = getH3Indexes(BELFAST.lat, BELFAST.lng);
  const ring1 = getNeighbourHexes(r10, 1);
  assert.equal(ring1.length, 7);
  assert.ok(ring1.includes(r10));
  // All members are valid H3 cells.
  for (const h of ring1) assert.ok(isValidH3Index(h));
});

test('getNeighbourHexes(centre, 2) returns 19 hexes (1 + 6 + 12)', () => {
  const { r10 } = getH3Indexes(BELFAST.lat, BELFAST.lng);
  assert.equal(getNeighbourHexes(r10, 2).length, 19);
});

test('getNeighbourHexes rejects invalid h3 indexes', () => {
  assert.throws(() => getNeighbourHexes('not-a-hex', 1), TypeError);
  assert.throws(() => getNeighbourHexes('', 1), TypeError);
  assert.throws(() => getNeighbourHexes(null, 1), TypeError);
  assert.throws(() => getNeighbourHexes(undefined, 1), TypeError);
  assert.throws(() => getNeighbourHexes(12345, 1), TypeError);
});

test('getNeighbourHexes rejects non-integer or negative radius', () => {
  const { r10 } = getH3Indexes(0, 0);
  assert.throws(() => getNeighbourHexes(r10, -1), TypeError);
  assert.throws(() => getNeighbourHexes(r10, 1.5), TypeError);
  assert.throws(() => getNeighbourHexes(r10, '1'), TypeError);
  assert.throws(() => getNeighbourHexes(r10, null), TypeError);
});

// ── hexToLatLng ─────────────────────────────────────────────────────────────

test('hexToLatLng returns centre close to the original point (within hex size)', () => {
  const { r10 } = getH3Indexes(BELFAST.lat, BELFAST.lng);
  const c = hexToLatLng(r10);
  assert.equal(typeof c.lat, 'number');
  assert.equal(typeof c.lng, 'number');
  // r10 hex spans roughly ~100m; centre should be within ~0.005° of the
  // original point.
  assert.ok(Math.abs(c.lat - BELFAST.lat) < 0.005);
  assert.ok(Math.abs(c.lng - BELFAST.lng) < 0.005);
});

test('hexToLatLng round-trip: hex → centre → same hex', () => {
  const { r10 } = getH3Indexes(BELFAST.lat, BELFAST.lng);
  const c = hexToLatLng(r10);
  const round = getH3Indexes(c.lat, c.lng);
  assert.equal(round.r10, r10);
});

test('hexToLatLng rejects invalid input', () => {
  assert.throws(() => hexToLatLng('garbage'), TypeError);
  assert.throws(() => hexToLatLng(''), TypeError);
  assert.throws(() => hexToLatLng(null), TypeError);
  assert.throws(() => hexToLatLng(undefined), TypeError);
  assert.throws(() => hexToLatLng(12345), TypeError);
});

// ── isValidH3Index ──────────────────────────────────────────────────────────

test('isValidH3Index returns true for real hexes from getH3Indexes', () => {
  const i = getH3Indexes(BELFAST.lat, BELFAST.lng);
  assert.equal(isValidH3Index(i.r8), true);
  assert.equal(isValidH3Index(i.r10), true);
  assert.equal(isValidH3Index(i.r12), true);
});

test('isValidH3Index returns false for non-cell input and never throws', () => {
  assert.equal(isValidH3Index('not-a-hex'), false);
  assert.equal(isValidH3Index(''), false);
  assert.equal(isValidH3Index('xyz123'), false);
  assert.equal(isValidH3Index(null), false);
  assert.equal(isValidH3Index(undefined), false);
  assert.equal(isValidH3Index(0), false);
  assert.equal(isValidH3Index(12345), false);
  assert.equal(isValidH3Index({}), false);
  assert.equal(isValidH3Index([]), false);
  assert.equal(isValidH3Index(true), false);
});
