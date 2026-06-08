-- ============================================================
--  Dander Ads — conversion tracking foundation.
--
--  Three tables:
--    ads                 — minimal advertiser-side surface so the FK
--                          from ad_clicks resolves and the dashboard
--                          can list ads to attach metrics to.
--                          (Full advertiser flow lands later.)
--    ad_clicks           — one row per click. Cycles through statuses
--                          'clicked' → 'entry_conversion' → 'qualified_sale'
--                          as the customer flows through nfc-checkin
--                          and the till award. 'expired' once outside
--                          the 7-day attribution window.
--    ad_conversion_rates — billing dial. Pre-seeded with default 0%
--                          entry rate and 5% sale rate. Nothing is
--                          actually charged yet; commission_amount on
--                          ad_clicks is calculated and stored for
--                          forecasting only.
-- ============================================================

-- ---------------------------------------------------------------------------
-- ads
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ads (
  id            SERIAL       PRIMARY KEY,
  business_id   INTEGER      NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  image_url     TEXT,
  cta_text      VARCHAR(60),
  destination   TEXT,                                  -- where the click resolves to (URL or in-app route)
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  starts_at     TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_business_active
  ON ads (business_id) WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- ad_clicks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_clicks (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id                 INTEGER       NOT NULL REFERENCES ads(id)        ON DELETE CASCADE,
  user_id               INTEGER       NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  business_id           INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  clicked_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  entry_conversion_at   TIMESTAMPTZ,
  sale_conversion_at    TIMESTAMPTZ,
  sale_amount           NUMERIC(10,2),
  commission_rate       NUMERIC(5,4)  NOT NULL DEFAULT 0.0500,
  commission_amount     NUMERIC(10,2),
  status                VARCHAR(20)   NOT NULL DEFAULT 'clicked'
                           CHECK (status IN ('clicked', 'entry_conversion', 'qualified_sale', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_ad_clicks_user_business_time
  ON ad_clicks (user_id, business_id, clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_clicks_ad_status
  ON ad_clicks (ad_id, status);

-- ---------------------------------------------------------------------------
-- ad_conversion_rates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ad_conversion_rates (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  INTEGER      NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  entry_rate   NUMERIC(5,4) NOT NULL DEFAULT 0.0000,   -- 0% — entry conversion is free for now
  sale_rate    NUMERIC(5,4) NOT NULL DEFAULT 0.0500,   -- 5% of sale value
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
