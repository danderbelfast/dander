-- 036_phone_counter_bt_brands.sql
-- Per-brand BLE counts derived on the device by classifying each
-- scanned address's OUI (first three bytes). The phone has already
-- short-circuited locally-administered (randomised) MACs to "unknown"
-- before this rolls up, so the per-brand columns only count devices
-- that *could* be classified.
--
-- "unknown" isn't a column on purpose — it's the residual and can be
-- derived as bluetooth_count - SUM(brand columns) when needed.

ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS bt_apple         INTEGER;
ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS bt_samsung       INTEGER;
ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS bt_google        INTEGER;
ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS bt_huawei        INTEGER;
ALTER TABLE phone_counter_readings ADD COLUMN IF NOT EXISTS bt_other_android INTEGER;
