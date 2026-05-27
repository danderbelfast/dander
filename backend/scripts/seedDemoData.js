'use strict';

/**
 * seedDemoData.js — populate 5 Ballyhackamore (Belfast) businesses and
 * their offers for app demos / local testing.
 *
 * Idempotent: if "The Dock Café" already exists, the script logs and exits
 * without touching the DB. The demo owner user is inserted with
 * `ON CONFLICT (email) DO UPDATE` so re-running after a partial seed is
 * safe.
 *
 * Run with:    npm run seed:demo
 * (or)         node scripts/seedDemoData.js
 */

require('dotenv').config();

const bcrypt   = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---------------------------------------------------------------------------
// Demo owner — one user owns all five businesses.
// ---------------------------------------------------------------------------

const DEMO_OWNER = {
  email:     'demo-owner@dander.app',
  password:  'DemoOwner123!',
  firstName: 'Demo',
  lastName:  'Owner',
};

// Used as the "already seeded?" canary.
const SEED_MARKER_NAME = 'The Dock Café';

// ---------------------------------------------------------------------------
// Business + offer fixture
//
// `offer_type` values are mapped to the DB's CHECK constraint
// (deal | promotion | clearance | percentage | fixed | bogo | free_item |
//  custom). "Urgency" isn't an enum value — we map it to 'promotion'.
// ---------------------------------------------------------------------------

const BUSINESSES = [
  {
    name:        'The Dock Café',
    description: 'Belmont Road favourite — barista coffee and home-baked pastries.',
    category:    'café',
    address:     '1 Belmont Road, Belfast, BT4 2AA',
    lat:         54.5889,
    lng:         -5.8921,
    phone:       '028 9065 0001',
    offers: [
      { title: '15% off all hot drinks',           offer_type: 'percentage', discount_percent: 15 },
      { title: 'Free pastry with any large coffee', offer_type: 'free_item' },
    ],
  },
  {
    name:        'Ballyhack Kitchen',
    description: 'Neighbourhood bistro with a daily-changing seasonal menu.',
    category:    'restaurant',
    address:     '45 Ballyhackamore, Belfast, BT4 2DR',
    lat:         54.5895,
    lng:         -5.8935,
    phone:       '028 9065 0002',
    offers: [
      { title: 'Lunch special — 20% off',                offer_type: 'percentage', discount_percent: 20 },
      { title: 'Free dessert with any main course',       offer_type: 'free_item' },
      { title: 'Tables available now — walk ins welcome', offer_type: 'promotion' },
    ],
  },
  {
    name:        'The Belmont Wine Bar',
    description: 'Small-batch wines, charcuterie boards, and a sun-trap terrace.',
    category:    'bar',
    address:     '78 Belmont Road, Belfast, BT4 2AT',
    lat:         54.5901,
    lng:         -5.8918,
    phone:       '028 9065 0003',
    offers: [
      { title: 'Happy hour — 2 for 1 on house wine', offer_type: 'percentage', discount_percent: 50 },
      { title: 'Free charcuterie board with any bottle', offer_type: 'free_item' },
    ],
  },
  {
    name:        'East Deli',
    description: 'Made-to-order sandwiches and salads with local produce.',
    category:    'deli',
    address:     '12 Eastleigh Drive, Belfast, BT4 2GH',
    lat:         54.5883,
    lng:         -5.8928,
    phone:       '028 9065 0004',
    offers: [
      { title: '10% off your lunch order today',             offer_type: 'percentage', discount_percent: 10 },
      { title: 'Fresh sandwiches just made — limited stock', offer_type: 'promotion' },
    ],
  },
  {
    name:        'The Morning Roll',
    description: 'Belfast sourdough, traybakes, and proper breakfast coffee.',
    category:    'bakery',
    address:     '34 Belmont Road, Belfast, BT4 2AS',
    lat:         54.5878,
    lng:         -5.8942,
    phone:       '028 9065 0005',
    offers: [
      { title: 'Day old bread — 50% off',         offer_type: 'percentage', discount_percent: 50 },
      { title: 'Free coffee with any breakfast order', offer_type: 'free_item' },
      { title: 'Fresh batch just out of the oven',     offer_type: 'promotion' },
    ],
  },
];

const OFFER_MAX_REDEMPTIONS = 50;
const OFFER_TTL_DAYS        = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function alreadySeeded(client) {
  const { rows } = await client.query(
    'SELECT id FROM businesses WHERE name = $1 LIMIT 1',
    [SEED_MARKER_NAME]
  );
  return rows.length > 0;
}

async function upsertOwner(client) {
  const hash = await bcrypt.hash(DEMO_OWNER.password, 10);
  const { rows } = await client.query(
    `INSERT INTO users
       (email, password_hash, first_name, last_name, role, is_verified, is_active)
     VALUES ($1, $2, $3, $4, 'business', true, true)
     ON CONFLICT (email) DO UPDATE
       SET role        = 'business',
           is_active   = true,
           is_verified = true
     RETURNING id`,
    [DEMO_OWNER.email, hash, DEMO_OWNER.firstName, DEMO_OWNER.lastName]
  );
  return rows[0].id;
}

async function insertBusiness(client, ownerId, biz) {
  const { rows } = await client.query(
    `INSERT INTO businesses
       (owner_id, name, description, category, address, city, lat, lng, phone, status, is_verified)
     VALUES ($1, $2, $3, $4, $5, 'Belfast', $6, $7, $8, 'active', true)
     RETURNING id`,
    [ownerId, biz.name, biz.description, biz.category, biz.address, biz.lat, biz.lng, biz.phone]
  );
  return rows[0].id;
}

async function insertOffer(client, businessId, biz, offer) {
  await client.query(
    `INSERT INTO offers
       (business_id, title, offer_type, discount_percent,
        lat, lng,
        max_redemptions,
        starts_at, expires_at, is_active)
     VALUES
       ($1, $2, $3, $4,
        $5, $6,
        $7,
        NOW(), NOW() + ($8 || ' days')::interval, true)`,
    [
      businessId,
      offer.title,
      offer.offer_type,
      offer.discount_percent ?? null,
      biz.lat,
      biz.lng,
      OFFER_MAX_REDEMPTIONS,
      String(OFFER_TTL_DAYS),
    ]
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[seed:demo] DATABASE_URL is not set. Aborting.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    if (await alreadySeeded(client)) {
      console.log(`[seed:demo] "${SEED_MARKER_NAME}" already exists — already seeded, skipping.`);
      return;
    }

    await client.query('BEGIN');

    const ownerId = await upsertOwner(client);
    console.log(`[seed:demo] Demo owner ready (user_id=${ownerId}, email=${DEMO_OWNER.email}).`);

    let totalOffers = 0;
    for (const biz of BUSINESSES) {
      const bizId = await insertBusiness(client, ownerId, biz);
      for (const offer of biz.offers) {
        await insertOffer(client, bizId, biz, offer);
        totalOffers += 1;
      }
      console.log(`[seed:demo]   ${biz.name.padEnd(24)} (id=${bizId}, ${biz.offers.length} offers)`);
    }

    await client.query('COMMIT');
    console.log(`[seed:demo] Done. Inserted ${BUSINESSES.length} businesses, ${totalOffers} offers.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[seed:demo] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
