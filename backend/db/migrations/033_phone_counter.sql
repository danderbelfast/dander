-- 033_phone_counter.sql
-- Readings from the Dander Node Android proof-of-concept (phone mounted over
-- a doorway). One row per 60s summary POST to /api/webhooks/phone-counter.
-- Counts-only — no images ever reach the server. Nullable sensor columns
-- mean "sensor unavailable" on the reporting device.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS phone_counter_readings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        VARCHAR(100),
  timestamp        TIMESTAMPTZ,
  count_in         INTEGER,
  count_out        INTEGER,
  noise_db         DOUBLE PRECISION,
  noise_label      VARCHAR(20),
  wifi_count       INTEGER,
  bluetooth_count  INTEGER,
  light_lux        DOUBLE PRECISION,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_counter_device
  ON phone_counter_readings(device_id, timestamp DESC);
