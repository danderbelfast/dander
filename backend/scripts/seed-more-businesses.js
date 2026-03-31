'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  // Reuse existing business owner
  const ownerRes = await pool.query(`SELECT id FROM users WHERE email = 'owner.test@dander.com'`);
  if (ownerRes.rowCount === 0) {
    console.error('Run seed-test-business.js first to create the owner account.');
    return;
  }
  const ownerId = ownerRes.rows[0].id;

  const businesses = [
    {
      name:        'SPAR Albertbridge Road',
      description: 'Convenient neighbourhood SPAR on Albertbridge Road — groceries, hot food, and daily essentials open late.',
      category:    'Convenience Store',
      address:     '310 Albertbridge Rd',
      city:        'Belfast',
      lat:         54.5897,
      lng:         -5.8987,
      phone:       '02890453337',
      website:     'https://www.spar-ni.co.uk',
      offers: [
        {
          title:            'Meal Deal — Sandwich, Snack & Drink £3.99',
          description:      'Any fridge sandwich, packet snack, and 500ml soft drink for £3.99.',
          terms:            'Available all day. Selected products only.',
          category:         'Food',
          offer_type:       'deal',
          original_price:   5.50,
          offer_price:      3.99,
          discount_percent: 27.45,
          radius_meters:    350,
          max_redemptions:  200,
          days:             21,
        },
        {
          title:            '20% Off Hot Food Counter',
          description:      'Hot pastries, sausage rolls, and chicken goujons — 20% off all day.',
          terms:            'Cannot be combined with meal deal. One redemption per visit.',
          category:         'Food',
          offer_type:       'promotion',
          original_price:   null,
          offer_price:      null,
          discount_percent: 20.00,
          radius_meters:    350,
          max_redemptions:  150,
          days:             14,
        },
        {
          title:            'End of Day Clearance — Bakery 50% Off',
          description:      'Freshly baked rolls, loaves, and pastries reduced by 50% after 8pm.',
          terms:            'Available from 8pm while stocks last.',
          category:         'Bakery',
          offer_type:       'clearance',
          original_price:   2.00,
          offer_price:      1.00,
          discount_percent: 50.00,
          radius_meters:    350,
          max_redemptions:  null,
          days:             7,
        },
      ],
    },
    {
      name:        'Lidl Connswater',
      description: 'Lidl supermarket at Connswater Link — great value groceries, fresh bakery, and weekly Specialbuys.',
      category:    'Supermarket',
      address:     'Connswater Link',
      city:        'Belfast',
      lat:         54.5875,
      lng:         -5.8913,
      phone:       null,
      website:     'https://www.lidl-ni.co.uk',
      offers: [
        {
          title:            'Fresh Bakery — Any 3 Items £1',
          description:      'Pick any 3 items from the in-store bakery for just £1.',
          terms:            'In-store bakery only. While stocks last.',
          category:         'Bakery',
          offer_type:       'deal',
          original_price:   2.10,
          offer_price:      1.00,
          discount_percent: 52.38,
          radius_meters:    500,
          max_redemptions:  300,
          days:             7,
        },
        {
          title:            '£5 Off When You Spend £40',
          description:      '£5 off your total shop when you spend £40 or more in-store.',
          terms:            'Single transaction only. Excludes alcohol and tobacco.',
          category:         'Grocery',
          offer_type:       'promotion',
          original_price:   null,
          offer_price:      null,
          discount_percent: null,
          radius_meters:    500,
          max_redemptions:  100,
          days:             14,
        },
        {
          title:            'Reduced to Clear — Chilled & Fresh',
          description:      'End-of-day reductions on chilled and fresh produce — up to 75% off.',
          terms:            'Available from 7pm. Products vary daily.',
          category:         'Grocery',
          offer_type:       'clearance',
          original_price:   null,
          offer_price:      null,
          discount_percent: 75.00,
          radius_meters:    500,
          max_redemptions:  null,
          days:             3,
        },
      ],
    },
    {
      name:        'Creggs',
      description: 'Local spot at 65 Station Road — your neighbourhood go-to for food, drinks, and great value.',
      category:    'Café & Bar',
      address:     '65 Station Road',
      city:        'Belfast',
      lat:         54.6042,
      lng:         -5.8765,
      phone:       null,
      website:     null,
      offers: [
        {
          title:            'Coffee & Cake — £3.50',
          description:      'Any regular hot drink plus a slice of homemade cake for £3.50.',
          terms:            'Dine-in only. Available all day.',
          category:         'Food',
          offer_type:       'deal',
          original_price:   5.50,
          offer_price:      3.50,
          discount_percent: 36.36,
          radius_meters:    300,
          max_redemptions:  80,
          days:             30,
        },
        {
          title:            'Happy Hour — Half Price Drinks',
          description:      'All draught drinks half price every weekday 4–6pm.',
          terms:            'Weekdays only. One redemption per person per visit.',
          category:         'Drinks',
          offer_type:       'promotion',
          original_price:   null,
          offer_price:      null,
          discount_percent: 50.00,
          radius_meters:    300,
          max_redemptions:  60,
          days:             14,
        },
        {
          title:            'Tuesday Night Quiz — Free Entry + Chips',
          description:      'Join our weekly quiz night and get free entry plus a bowl of chips on us.',
          terms:            'Tuesdays from 8pm. Teams of up to 6. One coupon per team.',
          category:         'Food',
          offer_type:       'promotion',
          original_price:   8.00,
          offer_price:      0.00,
          discount_percent: 100.00,
          radius_meters:    400,
          max_redemptions:  20,
          days:             60,
        },
      ],
    },
  ];

  for (const biz of businesses) {
    const bizRes = await pool.query(`
      INSERT INTO businesses
        (owner_id, name, description, category, address, city, lat, lng, website, phone, status, is_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', true)
      RETURNING id
    `, [ownerId, biz.name, biz.description, biz.category, biz.address, biz.city, biz.lat, biz.lng, biz.website, biz.phone]);

    const bizId = bizRes.rows[0].id;
    console.log(`Created: ${biz.name} (ID ${bizId})`);

    for (const offer of biz.offers) {
      await pool.query(`
        INSERT INTO offers
          (business_id, title, description, terms, category, offer_type,
           original_price, offer_price, discount_percent,
           lat, lng, radius_meters,
           max_redemptions, starts_at, expires_at, is_active)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           NOW(), NOW() + ($14 || ' days')::INTERVAL, true)
      `, [
        bizId, offer.title, offer.description, offer.terms, offer.category, offer.offer_type,
        offer.original_price, offer.offer_price, offer.discount_percent,
        biz.lat, biz.lng, offer.radius_meters,
        offer.max_redemptions, offer.days,
      ]);
      console.log(`  + ${offer.title}`);
    }
  }

  console.log('\nAll done! Businesses and offers are live.');
})()
  .catch((err) => console.error('Error:', err.message))
  .finally(() => pool.end());
