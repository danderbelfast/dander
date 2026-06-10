#!/usr/bin/env node
/* eslint-disable no-console */

// ============================================================
//  scripts/smoke-test.js — money-path smoke test.
//
//  USAGE
//    npm run smoke -- http://localhost:4000
//    BASE_URL=https://api.dander.io npm run smoke
//
//  REQUIRED ENV  (the script will NOT make up tokens — pre-mint
//  them once per smoke-target environment and pass them in)
//    SMOKE_USER_TOKEN       JWT for the test customer user
//    SMOKE_USER_ID          numeric user.id matching SMOKE_USER_TOKEN
//    SMOKE_BUSINESS_TOKEN   JWT for the test business owner
//    SMOKE_BUSINESS_ID      numeric businesses.id owned by the token holder
//
//  OPTIONAL ENV
//    SMOKE_NODE_DEVICE_ID   defaults to 'smoke-test-node'
//    SMOKE_AMOUNT           till spend amount; default 12.34
//    SMOKE_TIMEOUT_MS       per-request timeout; default 15000
//
//  SEEDING (one-time, manual — keeps this script dep-light per
//  the brief "node fetch + socket.io-client only")
//    Create a dedicated test user and a dedicated test business
//    in the target environment, then mint JWTs for each:
//      INSERT INTO users (...)  -- email like 'smoke+user@dander.io'
//      INSERT INTO businesses (owner_id=<owner>, name='SMOKE TEST — Dander QA', ...)
//    A helper for signing JWTs from a user_id is in
//    services/authService.js (signAccessToken). The simplest way to
//    mint smoke tokens locally is to log in once via the normal OTP
//    flow and capture the access tokens.
//
//  EXIT CODES
//    0  all 5 tests passed
//    1  one or more failures (summary printed)
//    2  missing required configuration / pre-flight failure
// ============================================================

const { io: ioClient } = require('socket.io-client');

const args = process.argv.slice(2);
const BASE_URL = (args[0] || process.env.BASE_URL || '').replace(/\/+$/, '');
const TIMEOUT_MS = parseInt(process.env.SMOKE_TIMEOUT_MS || '15000', 10);
const NODE_DEVICE_ID = process.env.SMOKE_NODE_DEVICE_ID || 'smoke-test-node';
const SPEND = Number(process.env.SMOKE_AMOUNT || '12.34');

const USER_TOKEN     = process.env.SMOKE_USER_TOKEN;
const USER_ID        = parseInt(process.env.SMOKE_USER_ID || '', 10);
const BUSINESS_TOKEN = process.env.SMOKE_BUSINESS_TOKEN;
const BUSINESS_ID    = parseInt(process.env.SMOKE_BUSINESS_ID || '', 10);
// Optional: expected IANA timezone the test business is configured for.
// When set, smoke test 6 asserts the rewards endpoint returns it,
// proving the businesses.timezone column → SELECT → response chain is
// live end-to-end. Skipped if unset.
const EXPECTED_TIMEZONE = process.env.SMOKE_BUSINESS_TIMEZONE || null;

// ── Pre-flight ──────────────────────────────────────────────

function bail(message) {
  console.error(`[smoke] FATAL: ${message}`);
  process.exit(2);
}

if (!BASE_URL)                      bail('Pass a base URL: `npm run smoke -- http://localhost:4000` or set BASE_URL.');
if (!/^https?:\/\//.test(BASE_URL)) bail(`BASE_URL must start with http(s):// — got "${BASE_URL}".`);
if (!USER_TOKEN)                    bail('SMOKE_USER_TOKEN env var is required (JWT for the test customer).');
if (!Number.isFinite(USER_ID))      bail('SMOKE_USER_ID env var must be the numeric user.id matching the token.');
if (!BUSINESS_TOKEN)                bail('SMOKE_BUSINESS_TOKEN env var is required (JWT for the test business owner).');
if (!Number.isFinite(BUSINESS_ID))  bail('SMOKE_BUSINESS_ID env var must be the numeric businesses.id owned by the business token.');

// ── HTTP helper ─────────────────────────────────────────────

async function request(method, path, { token, body, query } = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`network error on ${method} ${path}: ${err.message}`);
  }
  clearTimeout(timer);

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* leave json null */ }
  return { status: res.status, body: json, raw: text };
}

// ── Test harness ────────────────────────────────────────────

const results = []; // { name, passed, detail }
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  const tag = passed ? '✔' : '✘';
  console.log(`${tag} ${name}${detail ? ' — ' + detail : ''}`);
}

class AssertionError extends Error { constructor(msg) { super(msg); this.name = 'AssertionError'; } }
function assert(cond, msg) { if (!cond) throw new AssertionError(msg); }

async function run(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail || '');
  } catch (err) {
    record(name, false, err.message || String(err));
  }
}

// ── Tests ───────────────────────────────────────────────────

let firstCheckinVisitNumber = null;

async function testNfcCheckIn() {
  const { status, body } = await request('POST', '/api/proximity/nfc-checkin', {
    token: USER_TOKEN,
    body: { node_device_id: NODE_DEVICE_ID, business_id: BUSINESS_ID },
  });
  assert(status === 200, `expected 200, got ${status} (${JSON.stringify(body)})`);
  assert(body && body.success === true,                  `body.success !== true (got ${body && body.success})`);
  assert(typeof body.points_awarded === 'number',         'points_awarded missing or not a number');
  assert(typeof body.total_points === 'number',           'total_points missing or not a number');
  assert(typeof body.visit_number === 'number',           'visit_number missing or not a number');
  assert(typeof body.tier === 'string',                   'tier missing or not a string');
  assert(typeof body.business_name === 'string',          'business_name missing or not a string');
  // reward_tier is optional per shape but present on every modern
  // backend; flag if missing so future drift surfaces here.
  assert(
    body.reward_tier === undefined || ['standard','bronze','silver','gold'].includes(body.reward_tier),
    `reward_tier invalid value "${body.reward_tier}"`,
  );
  firstCheckinVisitNumber = body.visit_number;
  return `+${body.points_awarded} pts (visit #${body.visit_number}, tier=${body.tier}, reward=${body.reward_tier || 'n/a'})`;
}

async function testNfcSameDayDedup() {
  assert(firstCheckinVisitNumber != null, 'first check-in must succeed before dedup test');
  const { status, body } = await request('POST', '/api/proximity/nfc-checkin', {
    token: USER_TOKEN,
    body: { node_device_id: NODE_DEVICE_ID, business_id: BUSINESS_ID },
  });
  assert(status === 200,                                       `expected 200, got ${status} (${JSON.stringify(body)})`);
  assert(body && body.success === true,                        'body.success !== true');
  assert(body.points_awarded === 0,                            `dedup did not fire — got points_awarded=${body.points_awarded}`);
  assert(body.visit_number === firstCheckinVisitNumber,        `visit_number incremented on same-day repeat (was ${firstCheckinVisitNumber}, now ${body.visit_number})`);
  return `dedup fired (points=0, visit still #${body.visit_number})`;
}

async function testTillFlow() {
  const expectedPoints = Math.floor(SPEND * 10);

  // Snapshot the most-recent transaction id before we award so we can
  // confirm a NEW row landed (rather than a stale match from a prior
  // run with the same amount).
  const before = await request('GET', '/api/till/sales', {
    token: BUSINESS_TOKEN, query: { limit: '1' },
  });
  assert(before.status === 200, `pre-award /sales failed: ${before.status}`);
  const beforeTopId = before.body?.transactions?.[0]?.id || null;

  // 1) till-arrive
  const arrive = await request('POST', '/api/proximity/till-arrive', {
    token: USER_TOKEN,
    body: { business_id: BUSINESS_ID },
  });
  assert(arrive.status === 200,         `till-arrive expected 200, got ${arrive.status} (${JSON.stringify(arrive.body)})`);
  assert(arrive.body?.success === true, 'till-arrive body.success !== true');

  // 2) till award-points
  const award = await request('POST', '/api/till/award-points', {
    token: BUSINESS_TOKEN,
    body: {
      user_id:          USER_ID,
      amount_spent:     SPEND,
      category:         'Coffee',
      item_description: `smoke-test ${new Date().toISOString()}`,
    },
  });
  assert(award.status === 200,                  `award-points expected 200, got ${award.status} (${JSON.stringify(award.body)})`);
  assert(award.body?.success === true,          'award-points body.success !== true');
  assert(award.body.points_awarded === expectedPoints,
    `points_awarded mismatch — expected ${expectedPoints} (=floor(${SPEND}*10)), got ${award.body.points_awarded}`);
  assert(typeof award.body.new_total === 'number', 'new_total missing or not a number');

  // 3) verify the row is in till_transactions via /sales
  const after = await request('GET', '/api/till/sales', {
    token: BUSINESS_TOKEN, query: { limit: '5' },
  });
  assert(after.status === 200, `post-award /sales failed: ${after.status}`);
  const rows = after.body?.transactions || [];
  const newRow = rows.find((r) =>
    r.id !== beforeTopId
    && Number(r.amount_spent) === Number(SPEND)
    && Number(r.points_awarded) === expectedPoints
  );
  assert(newRow,
    `new till transaction not found via /sales (expected amount=${SPEND}, points=${expectedPoints}; saw ${rows.length} rows)`);
  return `awarded ${award.body.points_awarded} pts (new_total=${award.body.new_total}, txn=${newRow.id})`;
}

async function testRewardsThemed() {
  const { status, body } = await request('GET', `/api/business/${BUSINESS_ID}/rewards`);
  assert(status === 200,                       `expected 200, got ${status} (${JSON.stringify(body)})`);
  assert(typeof body?.name === 'string',       'rewards body.name missing or not a string');
  assert(typeof body?.sector === 'string',     `rewards body.sector missing or not a string (got ${body?.sector})`);
  assert(body.displayOnly === true,            `rewards displayOnly !== true (got ${body.displayOnly})`);
  assert(body.level === 1,                     `display-only rewards level expected 1, got ${body.level}`);
  assert(body.fill === 0,                      `display-only rewards fill expected 0, got ${body.fill}`);
  assert(body.add === 0,                       `display-only rewards add expected 0, got ${body.add}`);
  return `name="${body.name}", sector="${body.sector}"`;
}

async function testBusinessTimezone() {
  if (!EXPECTED_TIMEZONE) {
    return 'skipped (SMOKE_BUSINESS_TIMEZONE not set)';
  }
  const { status, body } = await request('GET', `/api/business/${BUSINESS_ID}/rewards`);
  assert(status === 200,                  `expected 200, got ${status}`);
  assert(typeof body?.timezone === 'string', 'rewards body.timezone missing or not a string');
  assert(body.timezone === EXPECTED_TIMEZONE,
    `business-local-day boundary uses the wrong timezone — expected "${EXPECTED_TIMEZONE}", API reported "${body.timezone}"`);
  return `timezone="${body.timezone}"`;
}

async function testSocketIo() {
  return new Promise((resolve, reject) => {
    const socket = ioClient(BASE_URL, {
      transports: ['polling', 'websocket'],   // polling-first per perMessageDeflate:false config
      reconnection: false,
      timeout:      TIMEOUT_MS,
      forceNew:     true,
    });
    const timer = setTimeout(() => {
      try { socket.disconnect(); } catch { /* ignore */ }
      reject(new AssertionError(`Socket.IO connect timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    socket.on('connect', () => {
      clearTimeout(timer);
      const transport = socket.io?.engine?.transport?.name || 'unknown';
      try { socket.disconnect(); } catch { /* ignore */ }
      resolve(`connected (transport=${transport}, id=${socket.id})`);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      try { socket.disconnect(); } catch { /* ignore */ }
      reject(new AssertionError(`Socket.IO connect_error: ${err.message}`));
    });
  });
}

// ── Main ────────────────────────────────────────────────────

(async () => {
  console.log(`[smoke] target=${BASE_URL}`);
  console.log(`[smoke] test user_id=${USER_ID}  test business_id=${BUSINESS_ID}`);
  console.log('');

  await run('1. NFC check-in awards points',          testNfcCheckIn);
  await run('2. Same-day dedup fires (points=0)',      testNfcSameDayDedup);
  await run('3. Till arrive + award + transaction row',testTillFlow);
  await run('4. Rewards GET returns themed payload',   testRewardsThemed);
  await run('5. Socket.IO connects (polling-first)',   testSocketIo);
  await run('6. Business-local-day timezone configured', testBusinessTimezone);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log('');
  console.log(`[smoke] ${passed}/${results.length} passed`);
  if (failed > 0) {
    console.log('[smoke] FAILURES:');
    for (const r of results) if (!r.passed) console.log(`  ✘ ${r.name}: ${r.detail}`);
    process.exit(1);
  }
  process.exit(0);
})().catch((err) => {
  console.error(`[smoke] uncaught: ${err && err.stack || err}`);
  process.exit(1);
});
