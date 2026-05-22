-- 004_webhook_deliveries.sql
-- Webhook delivery log for inbound webhook verification and debugging.

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              SERIAL        PRIMARY KEY,
  webhook_id      VARCHAR(255),
  event_type      VARCHAR(100)  NOT NULL,
  payload_json    JSONB         NOT NULL,
  response_status INTEGER,
  response_body   TEXT,
  attempt_number  INTEGER       NOT NULL DEFAULT 1,
  delivered_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event
  ON webhook_deliveries (event_type, delivered_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id
  ON webhook_deliveries (webhook_id) WHERE webhook_id IS NOT NULL;

-- Add shared_secret column to api_keys for HMAC webhook verification.
-- NOTE: no migration in this repo creates the api_keys table, so on databases
-- that don't already have it this ALTER would abort the whole migration run.
-- `ALTER TABLE IF EXISTS` skips with a notice instead of erroring, so startup
-- is not blocked. On databases that DO have api_keys, the column is still added.
ALTER TABLE IF EXISTS api_keys
  ADD COLUMN IF NOT EXISTS shared_secret VARCHAR(64);
