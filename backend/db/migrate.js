'use strict';

/**
 * migrate.js — Schema migration runner.
 *
 * 1. Runs schema.sql if any core table is missing (initial setup).
 * 2. Runs numbered migrations from db/migrations/ in order, tracking
 *    which have already been applied in a `schema_migrations` table.
 */

require('dotenv').config();

const { Client } = require('pg');
const path = require('path');
const fs   = require('fs');

const SCHEMA_FILE     = path.resolve(__dirname, 'schema.sql');
const MIGRATIONS_DIR  = path.resolve(__dirname, 'migrations');

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return rows.length > 0;
}

async function runMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not set. Set it in .env or the environment.');
  }

  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    console.log('[migrate] Connected to database.');

    // ── Step 1: Run schema.sql if core tables are missing ──────
    const CORE_TABLES = [
      'users', 'businesses', 'offers', 'coupons',
      'platform_settings', 'push_subscriptions', 'business_stories',
    ];

    const missing = [];
    for (const table of CORE_TABLES) {
      if (!(await tableExists(client, table))) missing.push(table);
    }

    if (missing.length > 0) {
      console.log(`[migrate] Missing tables: ${missing.join(', ')}. Running schema.sql…`);
      const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log('[migrate] schema.sql applied successfully.');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    } else {
      console.log('[migrate] All core tables present.');
    }

    // ── Step 2: Run numbered migrations from db/migrations/ ────
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    VARCHAR(255) PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.log('[migrate] No migrations/ directory — skipping.');
      return { ran: missing.length > 0, tables: CORE_TABLES };
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('[migrate] No migration files found.');
      return { ran: missing.length > 0, tables: CORE_TABLES };
    }

    const { rows: applied } = await client.query(
      'SELECT filename FROM schema_migrations'
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    let migrated = 0;
    for (const file of files) {
      if (appliedSet.has(file)) continue;

      console.log(`[migrate] Applying ${file}…`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`[migrate] ✓ ${file}`);
        migrated++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] ✗ ${file} failed:`, err.message);
        throw err;
      }
    }

    if (migrated === 0) {
      console.log('[migrate] All migrations already applied.');
    } else {
      console.log(`[migrate] Applied ${migrated} migration(s).`);
    }

    return { ran: missing.length > 0 || migrated > 0, tables: CORE_TABLES };

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
