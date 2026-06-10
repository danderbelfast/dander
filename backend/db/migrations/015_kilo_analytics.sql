-- 015_kilo_analytics.sql
-- Kilo IoT analytics: zone configs, people counting data, and device status.

-- 1. Zone configurations per device
CREATE TABLE IF NOT EXISTS kilo_zone_configs (
  id              SERIAL        PRIMARY KEY,
  business_id     INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  device_sn       VARCHAR(255)  NOT NULL,
  zone_number     SMALLINT      NOT NULL,
  zone_name       VARCHAR(100),
  zone_type       VARCHAR(50)   DEFAULT 'counting',
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (device_sn, zone_number)
);

CREATE INDEX IF NOT EXISTS idx_kilo_zone_configs_biz
  ON kilo_zone_configs (business_id);

-- 2. People counting data (per-zone, per-interval)
CREATE TABLE IF NOT EXISTS kilo_people_counting (
  id                    SERIAL        PRIMARY KEY,
  business_id           INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  device_sn             VARCHAR(255)  NOT NULL,
  zone_number           SMALLINT      NOT NULL DEFAULT 1,
  timestamp             TIMESTAMPTZ   NOT NULL,
  interval_seconds      INTEGER       NOT NULL DEFAULT 900,
  entries               INTEGER       NOT NULL DEFAULT 0,
  exits                 INTEGER       NOT NULL DEFAULT 0,
  occupancy             INTEGER       NOT NULL DEFAULT 0,
  male_count            INTEGER       DEFAULT 0,
  female_count          INTEGER       DEFAULT 0,
  adult_count           INTEGER       DEFAULT 0,
  child_count           INTEGER       DEFAULT 0,
  passersby             INTEGER       DEFAULT 0,
  staff_count           INTEGER       DEFAULT 0,
  staff_avg_dwell_time  NUMERIC(10,2) DEFAULT 0,
  effective_audience    INTEGER       DEFAULT 0,
  avg_attention_time    NUMERIC(10,2) DEFAULT 0,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, device_sn, timestamp, zone_number)
);

CREATE INDEX IF NOT EXISTS idx_kilo_people_counting_biz_time
  ON kilo_people_counting (business_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_kilo_people_counting_device
  ON kilo_people_counting (device_sn, timestamp DESC);

-- 3. Device status and health
CREATE TABLE IF NOT EXISTS kilo_device_status (
  id                SERIAL        PRIMARY KEY,
  business_id       INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  device_sn         VARCHAR(255)  NOT NULL UNIQUE,
  device_name       VARCHAR(100),
  device_mac        VARCHAR(20),
  firmware_version  VARCHAR(50),
  hardware_version  VARCHAR(50),
  ip_address        VARCHAR(45),
  last_seen         TIMESTAMPTZ,
  running_time_hours NUMERIC(10,1) DEFAULT 0,
  network_status    VARCHAR(20)   DEFAULT 'unknown',
  iccid             VARCHAR(25),
  imei              VARCHAR(20),
  cell_id           VARCHAR(20),
  lac               VARCHAR(20),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kilo_device_status_biz
  ON kilo_device_status (business_id);
