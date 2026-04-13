-- =============================================================================
-- Dander Platform — Database Schema
-- PostgreSQL 14+
-- Table order respects foreign-key dependencies.
-- =============================================================================

-- Enable PostGIS if available (gracefully skipped if the extension is absent)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis;
  RAISE NOTICE 'PostGIS enabled.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PostGIS not available — plain lat/lng columns will be used.';
END;
$$;

-- ---------------------------------------------------------------------------
-- Trigger helper: keep updated_at current on every row update
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- USERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id                 SERIAL PRIMARY KEY,
  email              VARCHAR(255) NOT NULL UNIQUE,
  phone              VARCHAR(30),
  password_hash      TEXT        NOT NULL,

  -- Two-factor authentication
  totp_secret        TEXT,
  totp_enabled       BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Profile
  first_name         VARCHAR(100),
  last_name          VARCHAR(100),
  avatar_url         TEXT,

  -- Role-based access control
  role               VARCHAR(20) NOT NULL DEFAULT 'user'
                       CHECK (role IN ('user', 'business', 'admin')),

  -- Account state
  is_verified        BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active          BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Last known location
  last_location_lat  DOUBLE PRECISION,
  last_location_lng  DOUBLE PRECISION,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- =============================================================================
-- EMAIL OTPS
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_otps (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       VARCHAR(6)   NOT NULL,
  purpose    VARCHAR(20)  NOT NULL,
  expires_at TIMESTAMPTZ  NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_otps_user_purpose ON email_otps (user_id, purpose);

-- =============================================================================
-- BUSINESSES
-- =============================================================================

CREATE TABLE IF NOT EXISTS businesses (
  id               SERIAL PRIMARY KEY,
  owner_id         INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- Identity
  name             VARCHAR(255) NOT NULL,
  description      TEXT,
  category         VARCHAR(100),

  -- Location
  address          TEXT,
  city             VARCHAR(100),
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,

  -- Media
  logo_url         TEXT,
  cover_image_url  TEXT,

  -- Contact
  website          VARCHAR(255),
  phone            VARCHAR(30),

  -- Status
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'active', 'suspended')),
  is_verified      BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_businesses_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON businesses (owner_id);
CREATE INDEX IF NOT EXISTS idx_businesses_status   ON businesses (status);
CREATE INDEX IF NOT EXISTS idx_businesses_city     ON businesses (city);

-- =============================================================================
-- BUSINESS STAFF
-- Defined before offers/coupons so the FK in coupons resolves correctly.
-- =============================================================================

CREATE TABLE IF NOT EXISTS business_staff (
  id          SERIAL PRIMARY KEY,
  business_id INTEGER      NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,

  email       VARCHAR(255) NOT NULL,
  name        VARCHAR(150) NOT NULL,
  pin_hash    TEXT         NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,

  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_staff_email_per_business UNIQUE (business_id, email)
);

CREATE INDEX IF NOT EXISTS idx_business_staff_business_id ON business_staff (business_id);

-- =============================================================================
-- OFFERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS offers (
  id                   SERIAL PRIMARY KEY,
  business_id          INTEGER     NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,

  -- Content
  title                VARCHAR(255) NOT NULL,
  description          TEXT,
  terms                TEXT,
  category             VARCHAR(100),
  image_url            TEXT,
  offer_type           VARCHAR(20) NOT NULL DEFAULT 'deal'
                         CHECK (offer_type IN ('deal', 'promotion', 'clearance', 'percentage', 'fixed', 'bogo', 'free_item', 'custom')),

  -- Pricing
  original_price       NUMERIC(10, 2),
  offer_price          NUMERIC(10, 2),
  discount_percent     NUMERIC(5, 2),
  cost_price           NUMERIC(10, 2),     -- business cost to provide the item
  selling_price        NUMERIC(10, 2),     -- normal full price of the item

  -- Geographic targeting
  lat                  DOUBLE PRECISION,
  lng                  DOUBLE PRECISION,
  radius_meters        INTEGER     NOT NULL DEFAULT 1000,

  -- Redemption limits
  max_redemptions      INTEGER,
  current_redemptions  INTEGER     NOT NULL DEFAULT 0,

  -- Scheduling
  starts_at            TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ,
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  icon_color           VARCHAR(20)          DEFAULT '#000000',

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_offers_business_id    ON offers (business_id);
CREATE INDEX IF NOT EXISTS idx_offers_active_expires ON offers (is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_offers_offer_type     ON offers (offer_type);
CREATE INDEX IF NOT EXISTS idx_offers_lat_lng        ON offers (lat, lng);

-- PostGIS geography column + GIST index (only when PostGIS is present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS location GEOGRAPHY(POINT, 4326);
    CREATE INDEX IF NOT EXISTS idx_offers_location_gist ON offers USING GIST (location);
    RAISE NOTICE 'PostGIS GEOGRAPHY column and GIST index added to offers.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add PostGIS column to offers: %', SQLERRM;
END;
$$;

-- =============================================================================
-- COUPONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS coupons (
  id                  SERIAL PRIMARY KEY,
  offer_id            INTEGER     NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  user_id             INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  code                VARCHAR(32) NOT NULL UNIQUE,
  status              VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'redeemed', 'expired')),

  redeemed_at         TIMESTAMPTZ,
  redeemed_by_staff   INTEGER REFERENCES business_staff (id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code     ON coupons (code);
CREATE INDEX IF NOT EXISTS idx_coupons_user_id  ON coupons (user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_offer_id ON coupons (offer_id);
CREATE INDEX IF NOT EXISTS idx_coupons_status   ON coupons (status);

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  offer_id   INTEGER REFERENCES offers (id) ON DELETE SET NULL,

  type       VARCHAR(30) NOT NULL
               CHECK (type IN ('proximity', 'new_offer', 'expiring')),
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id       ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read  ON notifications (user_id, is_read);

-- =============================================================================
-- SAVED OFFERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS saved_offers (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  offer_id   INTEGER     NOT NULL REFERENCES offers (id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_saved_offers UNIQUE (user_id, offer_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_offers_user_id  ON saved_offers (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_offers_offer_id ON saved_offers (offer_id);

-- =============================================================================
-- OFFER VIEWS
-- =============================================================================

CREATE TABLE IF NOT EXISTS offer_views (
  id        SERIAL PRIMARY KEY,
  offer_id  INTEGER     NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
  user_id   INTEGER REFERENCES users (id) ON DELETE SET NULL,

  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_views_offer_id ON offer_views (offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_views_user_id  ON offer_views (user_id);

-- =============================================================================
-- PLATFORM SETTINGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- PUSH SUBSCRIPTIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint     TEXT        NOT NULL,
  p256dh       TEXT        NOT NULL,
  auth         TEXT        NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_push_endpoint UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON push_subscriptions (user_id);

-- =============================================================================
-- NOTIFICATION PREFERENCES
-- Per-user, per-category radius and enabled settings for proximity alerts.
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      VARCHAR(100) NOT NULL,
  enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
  radius_meters INTEGER      NOT NULL DEFAULT 1000,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_notif_pref UNIQUE (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_user_id ON user_notification_preferences (user_id);

CREATE TRIGGER trg_user_notif_prefs_updated_at
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- PROFIT TRACKING — idempotent column additions + computed view
-- =============================================================================

ALTER TABLE offers ADD COLUMN IF NOT EXISTS cost_price    NUMERIC(10, 2);
ALTER TABLE offers ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10, 2);
ALTER TABLE users  ADD COLUMN IF NOT EXISTS fcm_token     TEXT;

CREATE OR REPLACE VIEW offer_profit_summary AS
SELECT
  o.id                  AS offer_id,
  o.business_id,
  o.title,
  o.cost_price,
  o.selling_price,
  o.offer_price,
  o.original_price,
  o.current_redemptions AS total_redemptions,
  -- Revenue = offer_price × redemptions
  COALESCE(o.offer_price, 0) * o.current_redemptions                        AS revenue_generated,
  -- Cost    = cost_price  × redemptions
  COALESCE(o.cost_price, 0)  * o.current_redemptions                        AS cost_of_offer,
  -- Gross profit = revenue − cost
  (COALESCE(o.offer_price, 0) - COALESCE(o.cost_price, 0)) * o.current_redemptions AS gross_profit,
  -- Additional profit vs not running the deal
  (COALESCE(o.offer_price, 0) - COALESCE(o.cost_price, 0)) * o.current_redemptions AS profit_vs_no_offer
FROM offers o
WHERE o.cost_price IS NOT NULL AND o.offer_price IS NOT NULL;

-- =============================================================================
-- PLATFORM SETTINGS
-- =============================================================================

-- Seed default platform settings
INSERT INTO platform_settings (key, value) VALUES
  ('proximity_radius_default_meters', '500'),
  ('max_coupons_per_user_per_offer',  '1'),
  ('offer_expiry_warning_hours',      '24'),
  ('platform_name',                   'Dander'),
  ('support_email',                   'support@dander.app')
ON CONFLICT (key) DO NOTHING;
