-- 048_node_app_version.sql
-- Track which version of the Dander Node app produced each reading
-- so the dashboard can surface "X nodes need updating" without us
-- having to keep a separate manifest.

ALTER TABLE phone_counter_readings
  ADD COLUMN IF NOT EXISTS app_version VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_phone_counter_readings_device_time
  ON phone_counter_readings (device_id, timestamp DESC);
