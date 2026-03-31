'use strict';

require('dotenv').config();
const { Pool }    = require('pg');
const bcrypt      = require('bcrypt');
const speakeasy   = require('speakeasy');
const QRCode      = require('qrcode');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const passwordHash = await bcrypt.hash('Password1!', 10);
  const secret = speakeasy.generateSecret({
    name:   'Dander (owner.test@dander.com)',
    issuer: 'Dander',
    length: 32,
  });

  // Create business owner user
  const userRes = await pool.query(`
    INSERT INTO users
      (email, password_hash, totp_secret, totp_enabled, first_name, last_name, role, is_verified, is_active)
    VALUES
      ('owner.test@dander.com', $1, $2, true, 'Test', 'Owner', 'business', true, true)
    ON CONFLICT (email) DO UPDATE
      SET role = 'business', is_active = true, totp_secret = $2, totp_enabled = true
    RETURNING id
  `, [passwordHash, secret.base32]);
  const ownerId = userRes.rows[0].id;
  console.log('Owner user ID:', ownerId);

  // Create business — Crown Bar, Belfast city centre
  const bizRes = await pool.query(`
    INSERT INTO businesses
      (owner_id, name, description, category, address, city, lat, lng, website, phone, status, is_verified)
    VALUES
      ($1,
       'The Crown Liquor Saloon',
       'Victorian-era gin palace on Great Victoria Street — one of Belfast''s most famous pubs.',
       'Bar & Pub',
       '46 Great Victoria St', 'Belfast',
       54.5956, -5.9342,
       'https://crownbar.com', '+442890249476',
       'active', true)
    RETURNING id
  `, [ownerId]);
  const bizId = bizRes.rows[0].id;
  console.log('Business ID:', bizId);

  // Create 3 offers with coordinates
  await pool.query(`
    INSERT INTO offers
      (business_id, title, description, terms, category, offer_type,
       original_price, offer_price, discount_percent,
       lat, lng, radius_meters,
       max_redemptions, starts_at, expires_at, is_active)
    VALUES
      ($1,
       'Lunch Deal — Pie & Pint £10',
       'Any hot pie from the menu plus a pint of your choice for just £10.',
       'Mon–Fri 12–3pm only. Dine-in only.',
       'Food', 'deal',
       15.00, 10.00, 33.33,
       54.5956, -5.9342, 400,
       50, NOW(), NOW() + INTERVAL '30 days', true),
      ($1,
       '2-for-1 Cocktails Happy Hour',
       'All cocktails two for one every evening 5–7pm.',
       'Not valid on Fri/Sat. One redemption per customer.',
       'Drinks', 'promotion',
       12.00, 6.00, 50.00,
       54.5956, -5.9342, 400,
       100, NOW(), NOW() + INTERVAL '14 days', true),
      ($1,
       'Leftover Pastries — 80% Off',
       'End-of-day pastries from our kitchen, going fast!',
       'Available after 4pm while stocks last.',
       'Food', 'clearance',
       3.50, 0.70, 80.00,
       54.5956, -5.9342, 300,
       NULL, NOW(), NOW() + INTERVAL '7 days', true)
  `, [bizId]);
  console.log('3 offers created.');

  await QRCode.toFile('C:/Users/shery/dander-test-business-qr.png', secret.otpauth_url, { width: 300 });
  console.log('\n--- Test Business Ready ---');
  console.log('Business panel login:  http://localhost:3001');
  console.log('Email:    owner.test@dander.com');
  console.log('Password: Password1!');
  console.log('TOTP key:', secret.base32);
  console.log('QR code:  C:\\Users\\shery\\dander-test-business-qr.png');
  console.log('Coords:   54.5956, -5.9342  (Crown Bar, Belfast)');
})()
  .catch((err) => console.error('Error:', err.message))
  .finally(() => pool.end());
