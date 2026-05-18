-- 001_api_tables.sql
-- Extends offers table for API-created offers, tracking, and recovery.

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS api_created              BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_ref             VARCHAR(255),
  ADD COLUMN IF NOT EXISTS share_count              INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS og_image_url             TEXT,
  ADD COLUMN IF NOT EXISTS view_count               INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trigger_source           VARCHAR(50),
  ADD COLUMN IF NOT EXISTS trigger_device_id        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS auto_expire_on_recovery  BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_label           VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_offers_external_ref
  ON offers (external_ref) WHERE external_ref IS NOT NULL;
