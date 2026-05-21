-- 016_analytics_annotations.sql
-- Business event annotations for analytics correlation.

CREATE TABLE IF NOT EXISTS analytics_annotations (
  id            SERIAL        PRIMARY KEY,
  business_id   INTEGER       NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_date    DATE          NOT NULL,
  title         VARCHAR(120)  NOT NULL,
  description   TEXT,
  category      VARCHAR(30)   NOT NULL DEFAULT 'store_change'
    CHECK (category IN ('product_launch', 'marketing', 'store_change', 'external_event', 'offer')),
  created_by    INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annotations_biz_date
  ON analytics_annotations (business_id, event_date DESC);

DROP TRIGGER IF EXISTS trg_annotations_updated_at ON analytics_annotations;
CREATE TRIGGER trg_annotations_updated_at
  BEFORE UPDATE ON analytics_annotations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
