-- ============================================================
--  offer_activations — the offer attribution funnel.
--
--  One row per (offer, identity). "activate" is the deterministic
--  intent event (channel-stamped). Status cycles:
--    'activated' -> 'entry_conversion' (on check-in)
--                -> 'qualified_sale'   (on till purchase, staff-tagged)
--                -> 'expired'          (offer expiry / window)
--  Mirrors ad_clicks (see 052_dander_ads_conversion_tracking.sql).
--
--  GDPR: anon_id is a device identifier (privacy-flagged). Erasure /
--  retention must cover this table — handle with the GDPR pass. NOT
--  production-ready until consent + erasure are wired in.
-- ============================================================

CREATE TABLE IF NOT EXISTS offer_activations (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id             INTEGER      NOT NULL REFERENCES offers(id)      ON DELETE CASCADE,
  business_id          INTEGER      NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id              INTEGER      REFERENCES users(id)               ON DELETE CASCADE,
  anon_id              TEXT,
  channel              VARCHAR(16)  NOT NULL
                          CHECK (channel IN ('app', 'web', 'sticker')),
  status               VARCHAR(20)  NOT NULL DEFAULT 'activated'
                          CHECK (status IN ('activated', 'entry_conversion', 'qualified_sale', 'expired')),
  activated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  entry_conversion_at  TIMESTAMPTZ,
  sale_conversion_at   TIMESTAMPTZ,
  sale_amount          NUMERIC(10,2),
  commission_rate      NUMERIC(5,4) NOT NULL DEFAULT 0.0000,
  commission_amount    NUMERIC(10,2),
  offer_expires_at     TIMESTAMPTZ,
  CONSTRAINT chk_offer_activations_identity CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_activations_offer_user
  ON offer_activations (offer_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_activations_offer_anon
  ON offer_activations (offer_id, anon_id) WHERE anon_id IS NOT NULL AND user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_offer_activations_user_business_status
  ON offer_activations (user_id, business_id, status);
CREATE INDEX IF NOT EXISTS idx_offer_activations_offer_channel_status
  ON offer_activations (offer_id, channel, status);
CREATE INDEX IF NOT EXISTS idx_offer_activations_anon
  ON offer_activations (anon_id) WHERE anon_id IS NOT NULL;
