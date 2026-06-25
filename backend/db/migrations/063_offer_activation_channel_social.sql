-- ============================================================
--  Add 'social' as a coarse attribution channel (per-platform
--  social shares roll up here; fine source = social_<platform>).
--  Inline CHECK from 061 auto-named offer_activations_channel_check.
-- ============================================================
ALTER TABLE offer_activations DROP CONSTRAINT IF EXISTS offer_activations_channel_check;
ALTER TABLE offer_activations ADD CONSTRAINT offer_activations_channel_check
  CHECK (channel IN ('app', 'web', 'sticker', 'social'));
