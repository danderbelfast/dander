-- 006_kilo_devices.sql
-- Kilo IoT device registration and lifecycle tracking.

CREATE TABLE IF NOT EXISTS kilo_devices (
  id              SERIAL        PRIMARY KEY,
  business_id     INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  device_id       VARCHAR(255)  NOT NULL UNIQUE,
  label           VARCHAR(100),
  status          VARCHAR(20)   NOT NULL DEFAULT 'assigned'
                    CHECK (status IN ('assigned', 'active', 'offline', 'decommissioned')),
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  last_reading_at TIMESTAMPTZ,
  first_reading_at TIMESTAMPTZ,
  meta            JSONB         DEFAULT '{}',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kilo_devices_business
  ON kilo_devices (business_id) WHERE status != 'decommissioned';

CREATE INDEX IF NOT EXISTS idx_kilo_devices_device_id
  ON kilo_devices (device_id);

DROP TRIGGER IF EXISTS trg_kilo_devices_updated_at ON kilo_devices;
CREATE TRIGGER trg_kilo_devices_updated_at
  BEFORE UPDATE ON kilo_devices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
