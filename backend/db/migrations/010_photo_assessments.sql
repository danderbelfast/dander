-- 010_photo_assessments.sql
-- Smart Specials: photo-based inventory assessment and offer suggestions.

CREATE TABLE IF NOT EXISTS photo_assessments (
  id                SERIAL        PRIMARY KEY,
  business_id       INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  photo_url         TEXT          NOT NULL,
  items_detected    JSONB         NOT NULL DEFAULT '[]',
  freshness_flags   JSONB         NOT NULL DEFAULT '[]',
  suggested_offers  JSONB         NOT NULL DEFAULT '[]',
  offers_approved   INTEGER       NOT NULL DEFAULT 0,
  assessed_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_assessments_biz_time
  ON photo_assessments (business_id, assessed_at DESC);
