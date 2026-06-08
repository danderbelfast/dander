-- ============================================================
--  Attach country to users and businesses.
--
--  Default 'GB' so existing rows resolve to the home market on
--  migration. New signups can override via the registration form.
--  FK is to countries(code) — countries.code carries the UNIQUE
--  constraint from 054 so this works without any explicit unique
--  reference index.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS country_code CHAR(2)
    NOT NULL DEFAULT 'GB'
    REFERENCES countries(code) ON UPDATE CASCADE;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS country_code CHAR(2)
    NOT NULL DEFAULT 'GB'
    REFERENCES countries(code) ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_users_country_code      ON users      (country_code);
CREATE INDEX IF NOT EXISTS idx_businesses_country_code ON businesses (country_code);
