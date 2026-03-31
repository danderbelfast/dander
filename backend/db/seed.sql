-- =============================================================================
-- Dander Platform — Seed Data
-- Belfast, Northern Ireland sample data
--
-- Passwords below are bcrypt hashes of the plaintext shown in the comment.
-- Generate fresh hashes with: node -e "const b=require('bcrypt');b.hash('Password123!',10).then(console.log)"
--
-- Run AFTER schema.sql:
--   psql $DATABASE_URL -f backend/db/schema.sql
--   psql $DATABASE_URL -f backend/db/seed.sql
-- =============================================================================

-- =============================================================================
-- TEST USERS
-- plaintext: Password123!
-- =============================================================================

INSERT INTO users (
  email, phone, password_hash,
  first_name, last_name,
  is_verified, is_active,
  last_location_lat, last_location_lng
) VALUES
  (
    'alice@example.com',
    '+447700900001',
    '$2b$10$K7Lp3Qe8vXmN5uJwYrTz6OdGhFiMnBsRcAeWqPlUjVkItXoZyS4Gy',
    'Alice', 'Maguire',
    TRUE, TRUE,
    54.5973, -5.9301   -- Belfast city centre
  ),
  (
    'bob@example.com',
    '+447700900002',
    '$2b$10$K7Lp3Qe8vXmN5uJwYrTz6OdGhFiMnBsRcAeWqPlUjVkItXoZyS4Gy',
    'Bob', 'Donnelly',
    TRUE, TRUE,
    54.6012, -5.9245   -- near Cathedral Quarter
  )
ON CONFLICT (email) DO NOTHING;

-- Business owner accounts
INSERT INTO users (
  email, phone, password_hash,
  first_name, last_name,
  role, is_verified, is_active
) VALUES
  (
    'owner.kellys@example.com',
    '+442890320000',
    '$2b$10$K7Lp3Qe8vXmN5uJwYrTz6OdGhFiMnBsRcAeWqPlUjVkItXoZyS4Gy',
    'Kieran', 'Kelly',
    'business', TRUE, TRUE
  ),
  (
    'owner.beatrice@example.com',
    '+442890550000',
    '$2b$10$K7Lp3Qe8vXmN5uJwYrTz6OdGhFiMnBsRcAeWqPlUjVkItXoZyS4Gy',
    'Beatrice', 'Walsh',
    'business', TRUE, TRUE
  ),
  (
    'owner.slattery@example.com',
    '+442890880000',
    '$2b$10$K7Lp3Qe8vXmN5uJwYrTz6OdGhFiMnBsRcAeWqPlUjVkItXoZyS4Gy',
    'Declan', 'Slattery',
    'business', TRUE, TRUE
  )
ON CONFLICT (email) DO NOTHING;

-- =============================================================================
-- BUSINESSES  (3 Belfast venues)
-- =============================================================================

INSERT INTO businesses (
  owner_id, name, description, category,
  address, city, lat, lng,
  website, phone,
  status, is_verified
)
SELECT
  u.id,
  b.name, b.description, b.category,
  b.address, b.city, b.lat, b.lng,
  b.website, b.phone,
  'active', TRUE
FROM (VALUES
  (
    'owner.kellys@example.com',
    'Kelly''s Cellar',
    'One of Belfast''s oldest pubs, tucked away on Bank Street. Traditional Irish music sessions every weekend.',
    'Bar & Pub',
    '30 Bank St', 'Belfast', 54.5998, -5.9338,
    'https://kellyscellar.co.uk', '+442890324835'
  ),
  (
    'owner.beatrice@example.com',
    'Beatrice Kennedy',
    'Award-winning restaurant in the heart of the University Quarter, serving modern Irish cuisine.',
    'Restaurant',
    '44 University Rd', 'Belfast', 54.5840, -5.9360,
    'https://beatricekennedy.co.uk', '+442890202290'
  ),
  (
    'owner.slattery@example.com',
    'Slattery''s Deli & Café',
    'Artisan deli and coffee shop in Botanic Avenue, known for sourdough toasties and specialty roasts.',
    'Café & Deli',
    '18 Botanic Ave', 'Belfast', 54.5848, -5.9329,
    NULL, '+442890881234'
  )
) AS b(owner_email, name, description, category, address, city, lat, lng, website, phone)
JOIN users u ON u.email = b.owner_email
ON CONFLICT DO NOTHING;

-- =============================================================================
-- BUSINESS STAFF  (one member per business)
-- PIN plaintext: 1234  →  bcrypt hash below
-- =============================================================================

INSERT INTO business_staff (business_id, email, name, pin_hash, is_active)
SELECT
  biz.id,
  s.email,
  s.name,
  '$2b$10$K7Lp3Qe8vXmN5uJwYrTz6OdGhFiMnBsRcAeWqPlUjVkItXoZyS4Gy',
  TRUE
FROM (VALUES
  ('Kelly''s Cellar',        'staff.kellys@example.com',    'Siobhan Byrne'),
  ('Beatrice Kennedy',       'staff.beatrice@example.com',  'Liam Fitzpatrick'),
  ('Slattery''s Deli & Café','staff.slattery@example.com',  'Orla Sloane')
) AS s(biz_name, email, name)
JOIN businesses biz ON biz.name = s.biz_name
ON CONFLICT (business_id, email) DO NOTHING;

-- =============================================================================
-- OFFERS  (5 sample offers across the 3 businesses)
-- =============================================================================

INSERT INTO offers (
  business_id, title, description, terms, category,
  offer_type, original_price, offer_price, discount_percent,
  lat, lng, radius_meters,
  max_redemptions, starts_at, expires_at, is_active
)
SELECT
  biz.id,
  o.title, o.description, o.terms, o.category,
  o.offer_type,
  o.original_price, o.offer_price, o.discount_percent,
  biz.lat, biz.lng,
  o.radius_meters,
  o.max_redemptions,
  NOW(),
  NOW() + o.duration,
  TRUE
FROM (VALUES
  -- Kelly's Cellar
  (
    'Kelly''s Cellar',
    'Happy Hour — 2-for-1 Pints',
    'Two pints of Guinness or Harp for the price of one every weekday 5–7 pm.',
    'One redemption per customer per visit. Not valid on bank holidays.',
    'Drinks',
    'promotion',
    7.00, 3.50, 50.00,
    500,
    50,
    INTERVAL '30 days'
  ),
  (
    'Kelly''s Cellar',
    '20% Off Traditional Tasting Platter',
    'Our famous platter of soda bread, champ, and house-cured meats — 20% off this month.',
    'Cannot be combined with other offers.',
    'Food',
    'deal',
    14.00, 11.20, 20.00,
    750,
    30,
    INTERVAL '14 days'
  ),
  -- Beatrice Kennedy
  (
    'Beatrice Kennedy',
    'Sunday Roast for Two — £35',
    'Two-course Sunday roast with a glass of house wine each. Normally £50 for two.',
    'Booking required. Available 12–4 pm on Sundays only.',
    'Food',
    'deal',
    50.00, 35.00, 30.00,
    800,
    20,
    INTERVAL '60 days'
  ),
  (
    'Beatrice Kennedy',
    'Free Dessert with Any Main',
    'Choose any dessert from our menu, on us, when you order a main course.',
    'Valid Mon–Thu only. Dine-in only.',
    'Food',
    'promotion',
    NULL, NULL, NULL,
    600,
    40,
    INTERVAL '21 days'
  ),
  -- Slattery's Deli
  (
    'Slattery''s Deli & Café',
    'Clearance — Day-Old Sourdough Loaves £1',
    'Freshly baked sourdough loaves from yesterday''s batch, still delicious — only £1 each.',
    'Available from 3 pm daily while stocks last. One loaf per customer.',
    'Bakery',
    'clearance',
    4.50, 1.00, 77.78,
    300,
    NULL,
    INTERVAL '7 days'
  )
) AS o(
  biz_name, title, description, terms, category,
  offer_type, original_price, offer_price, discount_percent,
  radius_meters, max_redemptions, duration
)
JOIN businesses biz ON biz.name = o.biz_name
ON CONFLICT DO NOTHING;

-- =============================================================================
-- COUPONS  (one coupon per test user for the first two offers)
-- =============================================================================

INSERT INTO coupons (offer_id, user_id, code, status)
SELECT
  o.id,
  u.id,
  c.code,
  'active'
FROM (VALUES
  ('Kelly''s Cellar', 'Happy Hour — 2-for-1 Pints', 'alice@example.com', 'DND-ALICE-KHOUR1'),
  ('Kelly''s Cellar', 'Happy Hour — 2-for-1 Pints', 'bob@example.com',   'DND-BOB-KHOUR1'),
  ('Beatrice Kennedy','Sunday Roast for Two — £35', 'alice@example.com', 'DND-ALICE-BKSUN1')
) AS c(biz_name, offer_title, user_email, code)
JOIN businesses biz ON biz.name = c.biz_name
JOIN offers o       ON o.business_id = biz.id AND o.title = c.offer_title
JOIN users u        ON u.email = c.user_email
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SAVED OFFERS  (Alice saves the deli clearance; Bob saves the dessert deal)
-- =============================================================================

INSERT INTO saved_offers (user_id, offer_id)
SELECT u.id, o.id
FROM (VALUES
  ('alice@example.com', 'Clearance — Day-Old Sourdough Loaves £1'),
  ('bob@example.com',   'Free Dessert with Any Main')
) AS s(user_email, offer_title)
JOIN users u  ON u.email = s.user_email
JOIN offers o ON o.title = s.offer_title
ON CONFLICT ON CONSTRAINT uq_saved_offers DO NOTHING;

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================

INSERT INTO notifications (user_id, offer_id, type, is_read)
SELECT u.id, o.id, n.type, FALSE
FROM (VALUES
  ('alice@example.com', 'Happy Hour — 2-for-1 Pints',           'proximity'),
  ('alice@example.com', 'Clearance — Day-Old Sourdough Loaves £1','new_offer'),
  ('bob@example.com',   'Sunday Roast for Two — £35',            'proximity'),
  ('bob@example.com',   'Happy Hour — 2-for-1 Pints',           'expiring')
) AS n(user_email, offer_title, type)
JOIN users u  ON u.email = n.user_email
JOIN offers o ON o.title = n.offer_title;
