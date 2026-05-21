-- 007_kilo_people_counting.sql
-- People counting and zone-based analytics data.

CREATE TABLE IF NOT EXISTS kilo_people_counting (
  id                      SERIAL        PRIMARY KEY,
  business_id             INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  device_sn               VARCHAR(255)  NOT NULL REFERENCES kilo_devices(device_id) ON DELETE CASCADE,
  zone_number             SMALLINT      NOT NULL,
  timestamp               TIMESTAMPTZ   NOT NULL,
  interval_seconds        INTEGER       DEFAULT 3600,
  entries                 INTEGER       DEFAULT 0,
  exits                   INTEGER       DEFAULT 0,
  occupancy               INTEGER       DEFAULT 0,
  male_count              INTEGER       DEFAULT 0,
  female_count            INTEGER       DEFAULT 0,
  adult_count             INTEGER       DEFAULT 0,
  child_count             INTEGER       DEFAULT 0,
  passersby               INTEGER       DEFAULT 0,
  staff_count             INTEGER       DEFAULT 0,
  staff_avg_dwell_time    NUMERIC(10,2) DEFAULT 0,
  effective_audience      INTEGER       DEFAULT 0,
  avg_attention_time      NUMERIC(10,2) DEFAULT 0,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, device_sn, timestamp, zone_number)
);

CREATE INDEX IF NOT EXISTS idx_kilo_people_counting_business_device
  ON kilo_people_counting (business_id, device_sn, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_kilo_people_counting_business_zone
  ON kilo_people_counting (business_id, zone_number, timestamp DESC);

CREATE TABLE IF NOT EXISTS kilo_zone_configs (
  id              SERIAL        PRIMARY KEY,
  business_id     INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  device_sn       VARCHAR(255)  NOT NULL REFERENCES kilo_devices(device_id) ON DELETE CASCADE,
  zone_number     SMALLINT      NOT NULL,
  zone_name       VARCHAR(100),
  zone_type       VARCHAR(50)   DEFAULT 'counting',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (device_sn, zone_number)
);

CREATE INDEX IF NOT EXISTS idx_kilo_zone_configs_business
  ON kilo_zone_configs (business_id);

CREATE TABLE IF NOT EXISTS kilo_device_status (
  id                    SERIAL        PRIMARY KEY,
  business_id           INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  device_sn             VARCHAR(255)  NOT NULL UNIQUE REFERENCES kilo_devices(device_id) ON DELETE CASCADE,
  device_name           VARCHAR(100),
  firmware_version      VARCHAR(20),
  hardware_version      VARCHAR(20),
  last_seen             TIMESTAMPTZ,
  network_status        VARCHAR(20)   DEFAULT 'unknown',
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kilo_device_status_business
  ON kilo_device_status (business_id);
