-- 005_webhooks.sql
-- Outbound webhook registrations for businesses.

CREATE TABLE IF NOT EXISTS webhooks (
  id            SERIAL        PRIMARY KEY,
  business_id   INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  url           TEXT          NOT NULL,
  events        TEXT[]        NOT NULL DEFAULT '{}',
  secret_hash   VARCHAR(64)   NOT NULL,
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_business_active
  ON webhooks (business_id) WHERE is_active = true;
