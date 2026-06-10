-- 007_inventory.sql
-- Inventory tracking — baseline shape, before 017 extends it into a
-- product catalog.
--
-- Column shapes mirror what's actually in production (verified via a
-- read-only information_schema lookup against the prod DB on
-- 2026-06-10). Notable deltas vs the previous on-disk version of this
-- file: name is VARCHAR(200) (not TEXT), is_perishable defaults to
-- false (not true), business_id has no FK to businesses(id), and
-- the category / sort_order columns are gone — they were never in
-- production. Replaying this migration against prod is a no-op
-- because schema_migrations already records it as applied.

CREATE TABLE IF NOT EXISTS inventory_items (
  id              SERIAL        PRIMARY KEY,
  business_id     INTEGER       NOT NULL,
  name            VARCHAR(200)  NOT NULL,
  is_active       BOOLEAN       DEFAULT TRUE,
  is_perishable   BOOLEAN       DEFAULT FALSE,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_business
  ON inventory_items (business_id) WHERE is_active = TRUE;
