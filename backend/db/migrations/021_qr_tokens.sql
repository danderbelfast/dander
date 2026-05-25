-- 021_qr_tokens.sql
-- QR token for contactless coupon redemption.

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS qr_token VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_coupons_qr_token
  ON coupons (qr_token) WHERE qr_token IS NOT NULL;
