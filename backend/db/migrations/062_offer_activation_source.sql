-- ============================================================
--  Fine-grained attribution source for offer activations.
--  channel stays the coarse rollup bucket (app/web/sticker);
--  source carries the finer tag (e.g. 'sticker_window') for the
--  later per-sticker view. Nullable — legacy rows roll up by
--  channel as before. See Plan 5 spec.
-- ============================================================
ALTER TABLE offer_activations ADD COLUMN IF NOT EXISTS source VARCHAR(32);
