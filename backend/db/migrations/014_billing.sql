-- 014_billing.sql
-- Stripe billing: subscriptions, invoices, and hardware orders.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS stripe_customer_id   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subscription_tier    VARCHAR(20) DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'starter', 'growth', 'pro')),
  ADD COLUMN IF NOT EXISTS subscription_status  VARCHAR(20) DEFAULT 'inactive'
    CHECK (subscription_status IN ('inactive', 'active', 'past_due', 'cancelled')),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS trial_ends_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_email        VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_businesses_stripe_customer
  ON businesses (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_events (
  id              SERIAL        PRIMARY KEY,
  business_id     INTEGER       REFERENCES businesses(id) ON DELETE SET NULL,
  stripe_event_id VARCHAR(255)  UNIQUE NOT NULL,
  event_type      VARCHAR(100)  NOT NULL,
  payload         JSONB         NOT NULL DEFAULT '{}',
  processed_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_biz
  ON billing_events (business_id, processed_at DESC);

CREATE TABLE IF NOT EXISTS hardware_orders (
  id              SERIAL        PRIMARY KEY,
  business_id     INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  stripe_payment_intent_id VARCHAR(255),
  kit_type        VARCHAR(50)   NOT NULL DEFAULT 'kilo_starter',
  quantity        INTEGER       NOT NULL DEFAULT 1,
  status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  shipping_address JSONB,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hardware_orders_biz
  ON hardware_orders (business_id);
