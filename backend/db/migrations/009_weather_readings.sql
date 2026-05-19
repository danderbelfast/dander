-- 009_weather_readings.sql
-- Weather data captured per business location for footfall correlation.

CREATE TABLE IF NOT EXISTS weather_readings (
  id              SERIAL        PRIMARY KEY,
  business_id     INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  temperature_c   NUMERIC(5,1),
  wind_speed_kmh  NUMERIC(5,1),
  rainfall_mm     NUMERIC(6,2)  DEFAULT 0,
  weather_code    INTEGER,
  condition       VARCHAR(50),
  recorded_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weather_readings_biz_time
  ON weather_readings (business_id, recorded_at DESC);
