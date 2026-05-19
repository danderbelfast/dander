-- 012_rota_and_biz_notif_prefs.sql
-- Staff rota storage and business notification preferences.

CREATE TABLE IF NOT EXISTS business_rota (
  id            SERIAL        PRIMARY KEY,
  business_id   INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  rota_data     JSONB         NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_rota_biz
  ON business_rota (business_id);

CREATE TABLE IF NOT EXISTS business_notification_preferences (
  id            SERIAL        PRIMARY KEY,
  business_id   INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  prefs         JSONB         NOT NULL DEFAULT '{"coupon_redeemed":true,"daily_summary":true,"footfall_alert":true}',
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_biz_notif_prefs_biz
  ON business_notification_preferences (business_id);
