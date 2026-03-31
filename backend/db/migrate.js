'use strict';

/**
 * migrate.js — Simple idempotent schema migration runner.
 *
 * Executes backend/db/schema.sql against the DATABASE_URL if any of the
 * core tables don't exist yet.  Safe to call on every startup:
 *   - Uses IF NOT EXISTS throughout schema.sql, so re-runs are no-ops.
 *   - Wraps execution in a transaction; rolls back on any failure.
 *   - Exits with code 1 on failure so Docker / process managers restart.
 *
 * Usage (standalone):
 *   node backend/db/migrate.js
 *
 * Usage (programmatic — called from server startup):
 *   const runMigrations = require('./db/migrate');
 *   await runMigrations();
 */

require('dotenv').config();

const { Client } = require('pg');
const path = require('path');
const fs   = require('fs');

const SCHEMA_FILE = path.resolve(__dirname, 'schema.sql');

/**
 * Check whether a table exists in the public schema.
 *
 * @param {Client} client
 * @param {string} tableName
 * @returns {Promise<boolean>}
 */
async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return rows.length > 0;
}

/**
 * Run the migration.
 *
 * @returns {Promise<{ ran: boolean, tables: string[] }>}
 *   ran    — true if schema.sql was executed, false if already up to date
 *   tables — list of core tables checked
 */
async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set. Set it in .env or the environment.');
  }

  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    console.log('[migrate] Connected to database.');

    // Check a representative set of tables
    const CORE_TABLES = ['users', 'businesses', 'offers', 'coupons', 'platform_settings', 'push_subscriptions'];

    const missing = [];
    for (const table of CORE_TABLES) {
      if (!(await tableExists(client, table))) missing.push(table);
    }

    if (missing.length === 0) {
      console.log('[migrate] All tables present — nothing to do.');
      return { ran: false, tables: CORE_TABLES };
    }

    console.log(`[migrate] Missing tables: ${missing.join(', ')}. Running schema.sql…`);

    // Read schema
    const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');

    // Execute inside a transaction
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log('[migrate] schema.sql applied successfully.');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    // Verify all core tables now exist
    const stillMissing = [];
    for (const table of CORE_TABLES) {
      if (!(await tableExists(client, table))) stillMissing.push(table);
    }

    if (stillMissing.length > 0) {
      throw new Error(`Migration ran but tables still missing: ${stillMissing.join(', ')}`);
    }

    console.log('[migrate] All tables verified. Migration complete.');
    return { ran: true, tables: CORE_TABLES };

  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Standalone execution: node db/migrate.js
// ---------------------------------------------------------------------------

if (require.main === module) {
  runMigrations()
    .then(({ ran }) => {
      console.log(ran ? '[migrate] Done.' : '[migrate] Already up to date.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrate] FAILED:', err.message);
      process.exit(1);
    });
}

module.exports = runMigrations;
