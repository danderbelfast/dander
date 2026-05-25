-- 026_smart_specials_v2.sql
-- Smart Specials v2: Claude Vision-driven offer copy.
--
-- 1. Extend photo_assessments to record the chosen offer type/value and the
--    suggested copy. Old JSONB columns are left in place — existing rows
--    remain readable, new rows just leave them empty.
-- 2. Add per-business Smart Specials defaults so the photo flow can
--    pre-fill step 1 every time the owner runs it.
--
-- All ALTERs are idempotent.

-- ── photo_assessments ──────────────────────────────────────────────────────
ALTER TABLE photo_assessments ADD COLUMN IF NOT EXISTS offer_type             VARCHAR(20);
ALTER TABLE photo_assessments ADD COLUMN IF NOT EXISTS offer_value            VARCHAR(100);
ALTER TABLE photo_assessments ADD COLUMN IF NOT EXISTS suggested_title        VARCHAR(120);
ALTER TABLE photo_assessments ADD COLUMN IF NOT EXISTS suggested_description  TEXT;
ALTER TABLE photo_assessments ADD COLUMN IF NOT EXISTS photo_summary          TEXT;
ALTER TABLE photo_assessments ADD COLUMN IF NOT EXISTS owner_edited           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE photo_assessments ADD COLUMN IF NOT EXISTS approved_at            TIMESTAMPTZ;
ALTER TABLE photo_assessments ADD COLUMN IF NOT EXISTS approved_by            INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- ── businesses: Smart Specials defaults ────────────────────────────────────
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ss_setup_complete       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ss_default_offer_type   VARCHAR(20) NOT NULL DEFAULT 'discount';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ss_default_discount_pct INTEGER NOT NULL DEFAULT 15
  CHECK (ss_default_discount_pct BETWEEN 1 AND 100);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ss_default_duration_hours INTEGER NOT NULL DEFAULT 24
  CHECK (ss_default_duration_hours BETWEEN 1 AND 168);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ss_active_hours_start   TIME NOT NULL DEFAULT '08:00';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ss_active_hours_end     TIME NOT NULL DEFAULT '20:00';
