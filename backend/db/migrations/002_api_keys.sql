-- 002_api_keys.sql
-- API key table for external integrations.

CREATE TABLE IF NOT EXISTS api_keys (
  id            SERIAL        PRIMARY KEY,
  business_id   INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  key_hash      VARCHAR(64)   NOT NULL UNIQUE,
  key_prefix    VARCHAR(12)   NOT NULL,
  label         VARCHAR(100)  NOT NULL DEFAULT 'default',
  scopes        TEXT[]        NOT NULL DEFAULT '{}',
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash       ON api_keys (key_hash) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_api_keys_business_id ON api_keys (business_id);
