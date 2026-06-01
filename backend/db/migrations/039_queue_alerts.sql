-- 039_queue_alerts.sql
-- Queue management + till-mode tracking.
--
-- phone_counter_readings gains four columns describing the device's
-- counting context: orientation (landscape/portrait), the till sub-mode
-- if applicable, the live queue depth and an alert flag. The flag is
-- derived on-device from queue_threshold; we just record what the
-- device decided so we don't have to re-derive across heterogeneous
-- threshold settings per zone.
--
-- queue_alerts is the dashboard-facing notification stream. The
-- webhook handler is the only writer — it debounces by checking for
-- an unacknowledged alert in the trailing 10 minutes before inserting,
-- so a steady-state busy queue doesn't spam the operator. Operators
-- acknowledge from the dashboard, which sets acknowledged_at.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS queue_depth INTEGER;
ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS queue_alert BOOLEAN;
ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS orientation VARCHAR(10);
ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS till_mode   VARCHAR(20);

CREATE TABLE IF NOT EXISTS queue_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  zone_name       VARCHAR(100),
  device_id       VARCHAR(100),
  queue_depth     INTEGER NOT NULL,
  alerted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_queue_alerts_business_alerted
  ON queue_alerts (business_id, alerted_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_alerts_unacked
  ON queue_alerts (business_id, alerted_at DESC)
  WHERE acknowledged_at IS NULL;
