-- 035_phone_counter_dwell.sql
-- Dwell-time statistics from the Dander Node phone counter. Each upload
-- window (60s by default) carries:
--   avg_dwell_seconds / max_dwell_seconds — float seconds across the
--   tracking IDs that finalised in this window
--   dwell_under_30s / dwell_30_to_2min / dwell_2_to_5min / dwell_over_5min
--   — distribution buckets so dashboards can show histograms without
--   per-visitor rows.
-- All fields are NULL-tolerant: a heartbeat (closed-hours) ping sends
-- zeros, but legacy rows from before 035 also need to read as NULL.

ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS avg_dwell_seconds  DOUBLE PRECISION;
ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS max_dwell_seconds  DOUBLE PRECISION;
ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS dwell_under_30s    INTEGER;
ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS dwell_30_to_2min   INTEGER;
ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS dwell_2_to_5min    INTEGER;
ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS dwell_over_5min    INTEGER;
