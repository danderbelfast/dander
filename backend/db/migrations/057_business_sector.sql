-- 057_business_sector.sql
-- Move the rewards-pack's `sector` column for businesses into the
-- auto-runner's path. Originally filed at backend/migrations/
-- 002_business_sector.sql (outside db/migrations/) and applied
-- manually on production, which left fresh databases (staging) without
-- the column. Keeping only the operative ALTER — the orphan file's
-- CREATE TABLE statement was a no-op against the real businesses
-- table shape (id SERIAL PRIMARY KEY, not business_id TEXT PRIMARY KEY)
-- and is dropped here for clarity.
--
-- Safe to replay against prod (the column already exists; ADD COLUMN
-- IF NOT EXISTS is a no-op).
--
-- Valid sector values match the rewards page's themed payload:
-- tyres | dogpark | cafe | garage | skate | carparts | retail

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT 'retail';
