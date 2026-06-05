-- Dander · business name + sector
CREATE TABLE IF NOT EXISTS businesses (
  business_id TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sector      TEXT NOT NULL DEFAULT 'retail',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT 'retail';
-- Valid sector keys: tyres | dogpark | cafe | garage | skate | carparts | retail
