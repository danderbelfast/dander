-- 019_analyticsservice_column_sync.sql
-- Ensure all columns used by analyticsService.js exist

-- kilo_people_counting
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS entries INTEGER DEFAULT 0;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS exits INTEGER DEFAULT 0;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS occupancy INTEGER DEFAULT 0;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS passersby INTEGER DEFAULT 0;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS avg_attention_time NUMERIC(10,2) DEFAULT 0;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS zone_number SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS male_count INTEGER DEFAULT 0;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS female_count INTEGER DEFAULT 0;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS adult_count INTEGER DEFAULT 0;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS child_count INTEGER DEFAULT 0;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS staff_count INTEGER DEFAULT 0;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS effective_audience INTEGER DEFAULT 0;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS staff_avg_dwell_time NUMERIC(10,2) DEFAULT 0;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS device_sn VARCHAR(255);
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS interval_seconds INTEGER DEFAULT 3600;
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE kilo_people_counting ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- kilo_zone_configs
ALTER TABLE kilo_zone_configs ADD COLUMN IF NOT EXISTS zone_number SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE kilo_zone_configs ADD COLUMN IF NOT EXISTS zone_name VARCHAR(100);
ALTER TABLE kilo_zone_configs ADD COLUMN IF NOT EXISTS zone_type VARCHAR(50) DEFAULT 'counting';
ALTER TABLE kilo_zone_configs ADD COLUMN IF NOT EXISTS business_id INTEGER;
ALTER TABLE kilo_zone_configs ADD COLUMN IF NOT EXISTS device_sn VARCHAR(255);
ALTER TABLE kilo_zone_configs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE kilo_zone_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- kilo_device_status
ALTER TABLE kilo_device_status ADD COLUMN IF NOT EXISTS device_sn VARCHAR(255);
ALTER TABLE kilo_device_status ADD COLUMN IF NOT EXISTS device_name VARCHAR(100);
ALTER TABLE kilo_device_status ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
ALTER TABLE kilo_device_status ADD COLUMN IF NOT EXISTS network_status VARCHAR(20) DEFAULT 'unknown';
ALTER TABLE kilo_device_status ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(20);
ALTER TABLE kilo_device_status ADD COLUMN IF NOT EXISTS business_id INTEGER;

-- footfall_baselines (for getCurrentStatus)
ALTER TABLE footfall_baselines ADD COLUMN IF NOT EXISTS avg_footfall NUMERIC(10,2) DEFAULT 0;
ALTER TABLE footfall_baselines ADD COLUMN IF NOT EXISTS day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6);
ALTER TABLE footfall_baselines ADD COLUMN IF NOT EXISTS hour_slot SMALLINT CHECK (hour_slot BETWEEN 0 AND 23);
ALTER TABLE footfall_baselines ADD COLUMN IF NOT EXISTS business_id INTEGER;

-- End of migration