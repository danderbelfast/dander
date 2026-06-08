-- ============================================================
--  Countries — supported markets, currencies, and local pricing.
--
--  One row per market we sell into. `code` is ISO 3166-1 alpha-2,
--  `currency_code` is ISO 4217. `monthly_price` is the local-currency
--  retail price for the business subscription; the matching Stripe
--  Price ID is filled in once each market's Stripe Product is wired.
--  is_active gates which countries appear in registration dropdowns
--  without affecting existing businesses already attached to them.
-- ============================================================

CREATE TABLE IF NOT EXISTS countries (
  id              SERIAL        PRIMARY KEY,
  name            VARCHAR(100)  NOT NULL,
  code            CHAR(2)       NOT NULL UNIQUE,   -- ISO 3166-1 alpha-2 (GB, US, …)
  currency_code   CHAR(3)       NOT NULL,           -- ISO 4217 (GBP, USD, EUR, …)
  currency_symbol VARCHAR(5)    NOT NULL,           -- £ / $ / € / …
  monthly_price   NUMERIC(10,2) NOT NULL,
  stripe_price_id VARCHAR(100),                     -- set later when Stripe Products land
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Launch markets. ON CONFLICT lets re-runs of this migration in dev
-- environments stay idempotent without changing the pricing on rows
-- that were already seeded.
INSERT INTO countries (name, code, currency_code, currency_symbol, monthly_price) VALUES
  ('United Kingdom', 'GB', 'GBP', '£', 20.00),
  ('Ireland',        'IE', 'EUR', '€', 24.00),
  ('United States',  'US', 'USD', '$', 25.00),
  ('Canada',         'CA', 'CAD', '$', 32.00),
  ('Australia',      'AU', 'AUD', '$', 38.00),
  ('New Zealand',    'NZ', 'NZD', '$', 42.00)
ON CONFLICT (code) DO NOTHING;
