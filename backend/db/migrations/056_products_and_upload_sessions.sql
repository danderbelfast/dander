-- 056_products_and_upload_sessions.sql
--
-- products and product_upload_sessions exist in the production DB
-- but no tracked source defines them — they were created out of
-- band. This migration captures their actual prod definitions
-- (verified read-only via information_schema on 2026-06-10) so a
-- fresh DB builds cleanly. Replaying against prod is a no-op because
-- both tables already exist (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS products (
  id           SERIAL        PRIMARY KEY,
  business_id  INTEGER       NOT NULL,
  name         VARCHAR(200)  NOT NULL,
  description  TEXT,
  category     VARCHAR(100),
  sku          VARCHAR(50),
  price        NUMERIC,
  stock_level  INTEGER       DEFAULT 0,
  image_url    TEXT,
  is_active    BOOLEAN       DEFAULT TRUE,
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_upload_sessions (
  id                 SERIAL        PRIMARY KEY,
  business_id        INTEGER       NOT NULL,
  upload_type        VARCHAR(50),
  status             VARCHAR(50),
  products_processed INTEGER       DEFAULT 0,
  products_added     INTEGER       DEFAULT 0,
  created_at         TIMESTAMPTZ   DEFAULT NOW()
);
