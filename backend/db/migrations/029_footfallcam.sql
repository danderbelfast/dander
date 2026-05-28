-- 029_footfallcam.sql
-- FootfallCam Pro2 footfall-sensor integration.
--   footfallcam_devices  — registry linking a device serial to a business
--   footfallcam_readings — periodic counts / occupancy / wifi / heatmap pushed
--                          to the webhook. raw_payload keeps the untouched body
--                          so nothing is lost even if our parsing is wrong.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS footfallcam_readings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial VARCHAR(50) NOT NULL,
  business_id   INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
  timestamp     TIMESTAMPTZ NOT NULL,
  count_in      INTEGER DEFAULT 0,
  count_out     INTEGER DEFAULT 0,
  occupancy     INTEGER DEFAULT 0,
  wifi_devices  INTEGER DEFAULT 0,
  heatmap_data  JSONB,
  queue_data    JSONB,
  raw_payload   JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_footfallcam_device
  ON footfallcam_readings(device_serial, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_footfallcam_business
  ON footfallcam_readings(business_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS footfallcam_devices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial    VARCHAR(50) UNIQUE NOT NULL,
  business_id      INTEGER REFERENCES businesses(id) ON DELETE SET NULL,
  device_name      VARCHAR(100),
  firmware_version VARCHAR(50),
  last_seen        TIMESTAMPTZ,
  ip_address       VARCHAR(50),
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
