-- 020_plan_management.sql
-- Admin plan management support.
--
-- 1. is_test_account flag on businesses — lets admins mark a business as
--    billing-exempt (gets a paid tier without a Stripe subscription).
-- 2. plan_changes column repair. Migration 018 creates plan_changes with
--    CREATE TABLE IF NOT EXISTS — on any database where a plan_changes table
--    already existed (created incomplete, before 018), 018 silently skips it
--    and the audit columns never appear. The ALTERs below backfill whatever
--    is missing. All statements are idempotent and safe to re-run.

-- ── Test-account flag ──────────────────────────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT false;

-- ── plan_changes: guarantee the table and its full column set ──────────────
CREATE TABLE IF NOT EXISTS plan_changes (
  id              SERIAL        PRIMARY KEY,
  business_id     INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  old_tier        VARCHAR(20),
  new_tier        VARCHAR(20),
  old_status      VARCHAR(20),
  new_status      VARCHAR(20),
  reason          TEXT,
  changed_by      INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE plan_changes ADD COLUMN IF NOT EXISTS old_tier   VARCHAR(20);
ALTER TABLE plan_changes ADD COLUMN IF NOT EXISTS new_tier   VARCHAR(20);
ALTER TABLE plan_changes ADD COLUMN IF NOT EXISTS old_status VARCHAR(20);
ALTER TABLE plan_changes ADD COLUMN IF NOT EXISTS new_status VARCHAR(20);
ALTER TABLE plan_changes ADD COLUMN IF NOT EXISTS reason     TEXT;
ALTER TABLE plan_changes ADD COLUMN IF NOT EXISTS changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE plan_changes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_plan_changes_biz
  ON plan_changes (business_id, created_at DESC);
