-- 003_discount_label.sql
-- Add discount_label column for custom offer type display text.

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS discount_label VARCHAR(40);
