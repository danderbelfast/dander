#!/usr/bin/env node
/* eslint-disable no-console */

// ============================================================
//  scripts/clear-test-footfall-data.js
//
//  Delete footfall data created by the Analytics page's
//  "Generate Test Data" button so the dashboard stops mixing
//  fake "5,110 total visitors / 598% vs last week" rows with
//  real TapProve Node uploads.
//
//  USAGE  (run inside the staging-backend Railway shell — it
//  uses whatever DATABASE_URL is set in the env)
//
//    node scripts/clear-test-footfall-data.js                 # dry-run, default mode=test
//    node scripts/clear-test-footfall-data.js --apply         # actually delete kilo_test_* rows only
//    node scripts/clear-test-footfall-data.js --mode=all      # dry-run all kilo footfall data
//    node scripts/clear-test-footfall-data.js --mode=all --apply
//    node scripts/clear-test-footfall-data.js --business=2 --apply
//    node scripts/clear-test-footfall-data.js --force-prod --apply   # OVERRIDE prod guard (don't)
//
//  WHAT IT DELETES
//
//    mode=test  (surgical, default)
//      Only rows where device_sn / device_id starts with 'kilo_test_'.
//      This is the exact signature generatePlaceholderData() writes —
//      see backend/services/analyticsService.js:379 where the SN is
//      built as `kilo_test_${Date.now()}`. Anything real won't match.
//      Tables: kilo_people_counting, kilo_zone_configs, kilo_devices.
//
//    mode=all  (nuclear — kilo only)
//      All rows from the kilo_* footfall tables, regardless of source.
//      Use this when you want the Overview tab fully clean and you
//      have no real FootfallCam cameras paired to the environment.
//      Does NOT touch phone_counter_readings or node_commands — those
//      are the real TapProve Node tables and are never test data.
//
//    --business=N
//      Scope all deletes to a single business_id. Defaults to ALL
//      businesses (which is fine because test data is rare).
//
//  SAFETY
//
//    Aborts if SELECT COUNT(*) FROM users > 50, which makes it
//    impossible to run accidentally against production
//    (staging has <50 users; prod has thousands). Override with
//    --force-prod if you genuinely need to clean prod, in which
//    case you should also be very awake.
//
//    Dry-runs by default: shows the row counts that would be
//    deleted but doesn't delete anything until you add --apply.
//
//    Never touches real node tables (phone_counter_readings,
//    node_commands) regardless of mode.
// ============================================================

'use strict';

const { Pool } = require('pg');

const USER_COUNT_GUARD = 50;

const args = process.argv.slice(2).reduce((acc, raw) => {
  const m = raw.match(/^--([^=]+)(?:=(.+))?$/);
  if (!m) return acc;
  acc[m[1]] = m[2] === undefined ? true : m[2];
  return acc;
}, {});

const mode      = args.mode === 'all' ? 'all' : 'test';
const apply     = !!args.apply;
const forceProd = !!args['force-prod'];
const businessId = args.business ? parseInt(args.business, 10) : null;

if (args.business && !Number.isFinite(businessId)) {
  console.error(`error: --business expects a numeric id, got "${args.business}"`);
  process.exit(2);
}

if (!process.env.DATABASE_URL) {
  console.error('error: DATABASE_URL is not set in the environment');
  process.exit(2);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : undefined,
});

(async () => {
  console.log('clear-test-footfall-data');
  console.log('  mode        :', mode);
  console.log('  business    :', businessId ?? 'all businesses');
  console.log('  apply       :', apply ? 'YES — deletes will run' : 'no (dry-run)');
  console.log('');

  // Safety: refuse to run against an environment that looks like prod
  // unless the operator explicitly overrides.
  const { rows: userCountRows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  const userCount = userCountRows[0].n;
  console.log(`  user count  : ${userCount}`);

  if (userCount > USER_COUNT_GUARD && !forceProd) {
    console.error('');
    console.error(`refusing to run: user count (${userCount}) > guard (${USER_COUNT_GUARD}).`);
    console.error('this database looks like production. re-run with --force-prod if you really mean it.');
    process.exit(3);
  }
  console.log('');

  const bizFilterKilo = businessId ? `AND business_id = ${businessId}` : '';
  const bizFilterDevices = businessId ? `AND business_id = ${businessId}` : '';

  // Build the per-mode WHERE clauses. We always restrict to kilo_test_*
  // for mode=test, regardless of business filter.
  const whereByMode = {
    test: {
      kilo_people_counting: `device_sn LIKE 'kilo_test_%' ${bizFilterKilo}`,
      kilo_zone_configs:    `device_sn LIKE 'kilo_test_%' ${bizFilterKilo}`,
      kilo_devices:         `device_id LIKE 'kilo_test_%' ${bizFilterDevices}`,
    },
    all: {
      kilo_people_counting: `TRUE ${bizFilterKilo}`,
      kilo_zone_configs:    `TRUE ${bizFilterKilo}`,
      kilo_devices:         `TRUE ${bizFilterDevices}`,
    },
  };
  const where = whereByMode[mode];

  // Show counts first so the operator can sanity-check before applying.
  const counts = {};
  for (const [table, predicate] of Object.entries(where)) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${predicate}`);
    counts[table] = rows[0].n;
  }
  console.log('  rows that match:');
  for (const [t, n] of Object.entries(counts)) console.log(`    ${t.padEnd(24)} ${n}`);
  console.log('');

  if (!apply) {
    console.log('dry-run complete. add --apply to actually delete.');
    await pool.end();
    return;
  }

  // Order matters: people_counting → zone_configs → devices, so FK
  // references stay valid even if cascades aren't set.
  let totalDeleted = 0;
  for (const table of ['kilo_people_counting', 'kilo_zone_configs', 'kilo_devices']) {
    const res = await pool.query(`DELETE FROM ${table} WHERE ${where[table]}`);
    console.log(`  deleted ${res.rowCount.toString().padStart(6)} from ${table}`);
    totalDeleted += res.rowCount;
  }
  console.log('');
  console.log(`  total rows deleted: ${totalDeleted}`);

  await pool.end();
})().catch(async (err) => {
  console.error('failed:', err.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
