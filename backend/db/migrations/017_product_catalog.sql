-- 017_product_catalog.sql
-- Extend inventory_items into a full product catalog.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS sku            VARCHAR(50),
  ADD COLUMN IF NOT EXISTS barcode        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS price          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS cost_price     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS stock_level    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS image_url      TEXT,
  ADD COLUMN IF NOT EXISTS description    TEXT,
  ADD COLUMN IF NOT EXISTS tags           TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sku
  ON inventory_items (business_id, sku) WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_barcode
  ON inventory_items (barcode) WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_stock
  ON inventory_items (business_id, stock_level) WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_inventory_updated_at ON inventory_items;
CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
