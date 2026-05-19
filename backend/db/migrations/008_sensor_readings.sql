-- 008_sensor_readings.sql
-- Sensor readings storage and footfall baseline calculations.

-- Add device_type to kilo_devices
ALTER TABLE kilo_devices
  ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) DEFAULT 'people_counter';

-- Raw sensor readings
CREATE TABLE IF NOT EXISTS sensor_readings (
  id              SERIAL        PRIMARY KEY,
  device_id       INTEGER       NOT NULL REFERENCES kilo_devices(id) ON DELETE CASCADE,
  business_id     INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  device_type     VARCHAR(50)   NOT NULL DEFAULT 'people_counter',
  reading_value   NUMERIC(12,2) NOT NULL,
  unit            VARCHAR(20)   DEFAULT 'count',
  meta            JSONB         DEFAULT '{}',
  recorded_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_device
  ON sensor_readings (device_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_business_type
  ON sensor_readings (business_id, device_type, recorded_at DESC);

-- Footfall baselines: average by day-of-week + hour slot
CREATE TABLE IF NOT EXISTS footfall_baselines (
  id              SERIAL        PRIMARY KEY,
  business_id     INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day_of_week     SMALLINT      NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour_slot       SMALLINT      NOT NULL CHECK (hour_slot BETWEEN 0 AND 23),
  avg_footfall    NUMERIC(10,2) NOT NULL DEFAULT 0,
  sample_count    INTEGER       NOT NULL DEFAULT 0,
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, day_of_week, hour_slot)
);

CREATE INDEX IF NOT EXISTS idx_footfall_baselines_business
  ON footfall_baselines (business_id);
