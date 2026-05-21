-- 018_plan_changes.sql
-- Audit trail for subscription plan changes made by admins.

CREATE TABLE IF NOT EXISTS plan_changes (
  id              SERIAL        PRIMARY KEY,
  business_id     INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  old_tier        VARCHAR(20),
  new_tier        VARCHAR(20)   NOT NULL,
  old_status      VARCHAR(20),
  new_status      VARCHAR(20),
  reason          TEXT          NOT NULL,
  changed_by      INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_changes_biz
  ON plan_changes (business_id, created_at DESC);
