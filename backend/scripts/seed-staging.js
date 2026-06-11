#!/usr/bin/env node
/* eslint-disable no-console */

// ============================================================
//  scripts/seed-staging.js — minimum data the smoke test needs.
//
//  Idempotent: safe to re-run against any fresh-or-stale staging
//  DB. Creates (or updates) a dedicated test user and a dedicated
//  test business owner, plus a single test business owned by the
//  owner. The business carries is_test_account=true so any future
//  prod safety guard can skip it.
//
//  Then mints access tokens for both users using JWT_SECRET (must
//  match the running backend's secret) and prints the env-var block
//  ready to paste into `npm run smoke`.
//
//  Required env:
//    DATABASE_URL   staging Postgres URL (PUBLIC proxy URL, not
//                   .railway.internal — must be reachable from the
//                   host running the seed).
//    JWT_SECRET     the staging backend's JWT_SECRET. Tokens minted
//                   with the wrong secret will be rejected by the
//                   API with 401 INVALID_TOKEN.
//
//  Refuses to run when the target DB has > 50 user rows — a cheap
//  guard against accidentally pointing this at production.
//
//  Usage:
//    DATABASE_URL=postgres://…@…proxy.rlwy.net:NNNN/railway \
//    JWT_SECRET=<staging-secret>                            \
//    node scripts/seed-staging.js
// ============================================================

const { Client } = require('pg');
const jwt        = require('jsonwebtoken');

const TEST_BUSINESS_NAME       = 'SMOKE TEST — Dander QA';
const CUSTOMER_EMAIL           = 'smoke+customer@tapprove.io';
const OWNER_EMAIL              = 'smoke+owner@tapprove.io';
const PLACEHOLDER_PASSWORD_HASH = '$2b$10$smoke.placeholder.never.used.for.login';
const SAFETY_USER_LIMIT        = 50;
// Non-default IANA timezone so smoke test 6 has something to verify
// end-to-end (column → SELECT → response payload). Pacific/Auckland
// is far enough from UTC that any silent fall-back to a server
// default would surface immediately.
const TEST_BUSINESS_TIMEZONE   = 'Pacific/Auckland';

function bail(msg) { console.error('[seed-staging] FATAL: ' + msg); process.exit(2); }

const DB     = process.env.DATABASE_URL;
const SECRET = process.env.JWT_SECRET;
if (!DB)     bail('DATABASE_URL env var is required.');
if (!SECRET) bail('JWT_SECRET env var is required (must match the running backend).');

(async () => {
  const c = new Client({ connectionString: DB });
  await c.connect();

  // ── Safety guard ───────────────────────────────────────────
  const info = await c.query(
    'SELECT current_database() db, inet_server_addr() host'
  );
  const { rows: [uCount] } = await c.query('SELECT COUNT(*)::int n FROM users');
  console.log(`[seed-staging] target: ${info.rows[0].host} / ${info.rows[0].db} — ${uCount.n} existing users`);
  if (uCount.n > SAFETY_USER_LIMIT) {
    await c.end();
    bail(
      `target DB has ${uCount.n} users (> ${SAFETY_USER_LIMIT}). Refusing to seed — this looks like production. ` +
      'Double-check DATABASE_URL points at staging.'
    );
  }

  // ── Seed users (idempotent via ON CONFLICT (email)) ────────
  const seedUser = async (email, firstName, role) => {
    const { rows } = await c.query(
      `INSERT INTO users (email, password_hash, first_name, role, is_verified, is_active)
            VALUES ($1, $2, $3, $4, TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE
         SET first_name  = EXCLUDED.first_name,
             role        = EXCLUDED.role,
             is_verified = TRUE,
             is_active   = TRUE,
             updated_at  = NOW()
       RETURNING id, email, role`,
      [email, PLACEHOLDER_PASSWORD_HASH, firstName, role]
    );
    return rows[0];
  };

  const customer = await seedUser(CUSTOMER_EMAIL, 'Smoke',  'user');
  const owner    = await seedUser(OWNER_EMAIL,    'Owner',  'business');
  console.log(`[seed-staging] users: customer=${customer.id} (${customer.email}), owner=${owner.id} (${owner.email})`);

  // ── Seed business (find-or-create, scoped by owner + name + is_test) ──
  let businessId;
  const existing = await c.query(
    `SELECT id FROM businesses
      WHERE owner_id = $1 AND name = $2 AND is_test_account = TRUE
      LIMIT 1`,
    [owner.id, TEST_BUSINESS_NAME]
  );
  if (existing.rowCount > 0) {
    businessId = existing.rows[0].id;
    await c.query(
      `UPDATE businesses
          SET status     = 'active',
              is_verified = TRUE,
              sector     = COALESCE(sector, 'retail'),
              timezone   = $2,
              updated_at = NOW()
        WHERE id = $1`,
      [businessId, TEST_BUSINESS_TIMEZONE]
    );
    console.log(`[seed-staging] business: reused id=${businessId} (${TEST_BUSINESS_NAME}), tz=${TEST_BUSINESS_TIMEZONE}`);
  } else {
    const { rows } = await c.query(
      `INSERT INTO businesses (owner_id, name, status, is_verified, is_test_account, sector, timezone)
            VALUES ($1, $2, 'active', TRUE, TRUE, 'retail', $3)
       RETURNING id`,
      [owner.id, TEST_BUSINESS_NAME, TEST_BUSINESS_TIMEZONE]
    );
    businessId = rows[0].id;
    console.log(`[seed-staging] business: created id=${businessId} (${TEST_BUSINESS_NAME}), tz=${TEST_BUSINESS_TIMEZONE}`);
  }

  // ── Upsert loyalty settings ────────────────────────────────
  await c.query(
    `INSERT INTO business_loyalty_settings (business_id, points_per_visit, greeting_tone)
          VALUES ($1, 30, 'friendly')
     ON CONFLICT (business_id) DO UPDATE
       SET updated_at = NOW()`,
    [businessId]
  );

  // ── Upsert reward tiers (defaults match the column defaults) ──
  await c.query(
    `INSERT INTO reward_tiers (business_id) VALUES ($1)
     ON CONFLICT (business_id) DO NOTHING`,
    [businessId]
  );

  console.log('[seed-staging] loyalty settings + reward tiers ensured.');

  // ── Mint JWTs ──────────────────────────────────────────────
  const sign = (u) => jwt.sign(
    { sub: u.id, email: u.email, role: u.role || 'user' },
    SECRET,
    { expiresIn: '24h' }
  );
  const customerToken = sign(customer);
  const ownerToken    = sign(owner);

  // ── Output env-var block ───────────────────────────────────
  console.log('');
  console.log('═════════════════════════════════════════════════════════════');
  console.log(' Seed complete. Run the smoke test with:');
  console.log('═════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`SMOKE_USER_TOKEN=${customerToken} \\`);
  console.log(`SMOKE_USER_ID=${customer.id} \\`);
  console.log(`SMOKE_BUSINESS_TOKEN=${ownerToken} \\`);
  console.log(`SMOKE_BUSINESS_ID=${businessId} \\`);
  console.log(`SMOKE_BUSINESS_TIMEZONE=${TEST_BUSINESS_TIMEZONE} \\`);
  console.log('npm run smoke -- https://staging-api.tapprove.io');
  console.log('');
  console.log('Tokens expire 24h from now. Re-run seed-staging to mint fresh ones.');
  console.log('');

  await c.end();
})().catch((err) => {
  console.error('[seed-staging] uncaught:', err && err.stack || err);
  process.exit(1);
});
