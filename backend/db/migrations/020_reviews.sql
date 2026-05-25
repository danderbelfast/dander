-- 020_reviews.sql
-- Business reviews from verified customers (redeemed coupon required).

CREATE TABLE IF NOT EXISTS business_reviews (
  id              SERIAL        PRIMARY KEY,
  business_id     INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id         INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coupon_id       INTEGER       REFERENCES coupons(id) ON DELETE SET NULL,
  rating          SMALLINT      NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         VARCHAR(500),
  is_public       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, coupon_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_business
  ON business_reviews (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_user
  ON business_reviews (user_id);

-- Cached average rating on businesses table
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS avg_rating       NUMERIC(2,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS review_count     INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_visible   BOOLEAN      NOT NULL DEFAULT false;
