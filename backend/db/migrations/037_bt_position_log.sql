-- 037_bt_position_log.sql
-- Foundation for BT trilateration / position heatmap.
--
-- bt_position_log    — per-sighting rows: which anonymous_id was seen
--                      by which zone, at which signal strength, when.
--                      Source data for the 5-min trilateration job.
--                      Pruned to a 24-hour rolling window.
--
-- position_heatmap   — hourly 10x10 grid aggregates: density of devices
--                      per cell + an avg dwell estimate. Persistent.
--                      Never stores individual positions — only the
--                      anonymous count per cell per hour.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS bt_position_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   INTEGER NOT NULL,
  zone_name     VARCHAR(100) NOT NULL,
  anonymous_id  VARCHAR(16)  NOT NULL,
  rssi          INTEGER,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Main query is "last 5 min for this business" → composite covers it
-- and the prune scan ("everything older than 24h") uses recorded_at.
CREATE INDEX IF NOT EXISTS idx_bt_position_log_business_time
  ON bt_position_log (business_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_bt_position_log_recorded_at
  ON bt_position_log (recorded_at);

CREATE TABLE IF NOT EXISTS position_heatmap (
  business_id       INTEGER     NOT NULL,
  hour_bucket       TIMESTAMPTZ NOT NULL,
  grid_x            INTEGER     NOT NULL CHECK (grid_x BETWEEN 0 AND 9),
  grid_y            INTEGER     NOT NULL CHECK (grid_y BETWEEN 0 AND 9),
  density           INTEGER     NOT NULL DEFAULT 0,
  avg_dwell_seconds DOUBLE PRECISION,
  PRIMARY KEY (business_id, hour_bucket, grid_x, grid_y)
);

CREATE INDEX IF NOT EXISTS idx_position_heatmap_business_hour
  ON position_heatmap (business_id, hour_bucket DESC);
