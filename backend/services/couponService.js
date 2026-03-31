'use strict';

/**
 * couponService.js
 *
 * Handles the full coupon lifecycle:
 *   generateCoupon   — issue a coupon to a user for an active offer
 *   redeemCoupon     — staff-verified in-store redemption
 *   getUserCoupons   — fetch all coupons for a user, grouped by status
 *   expireCoupons    — cron job (every 30 min) to expire stale coupons
 *
 * Race-condition safety: generateCoupon and redeemCoupon both use
 * SELECT … FOR UPDATE inside a transaction to prevent double-redemptions
 * under concurrent requests.
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const cron   = require('node-cron');
const pool   = require('../db/pool');
const { checkUserInOfferRadius } = require('./geoService');

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------
// Unambiguous characters only (no 0/O, 1/I/L) for easy staff readability.

const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH  = 4; // suffix length after "DAN-"

function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  const suffix = Array.from(bytes)
    .map((b) => CODE_CHARSET[b % CODE_CHARSET.length])
    .join('');
  return `DAN-${suffix}`;
}

/**
 * Tries to generate a code that does not already exist in the coupons table.
 * Retries up to `maxAttempts` times before giving up.
 */
async function generateUniqueCode(client, maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateCode();
    const { rowCount } = await client.query(
      'SELECT 1 FROM coupons WHERE code = $1',
      [code]
    );
    if (rowCount === 0) return code;
  }
  throw new Error('Failed to generate a unique coupon code. Please retry.');
}

// ---------------------------------------------------------------------------
// 1. generateCoupon
// ---------------------------------------------------------------------------

/**
 * Issues a coupon for `offerId` to `userId`.
 *
 * @param {number}  userId
 * @param {number}  offerId
 * @param {object}  [options]
 * @param {number}  [options.userLat]   — if provided, radius check is enforced
 * @param {number}  [options.userLng]
 *
 * @returns {{
 *   coupon:   object,   — the new coupon row
 *   offer:    object,   — offer details
 *   business: object,   — business name, address, logo
 * }}
 */
async function generateCoupon(userId, offerId, options = {}) {
  const { userLat, userLng } = options;

  // --- Optional radius check (before we open a transaction) ---
  if (userLat != null && userLng != null) {
    const { inRadius, offerRadius } = await checkUserInOfferRadius(userLat, userLng, offerId);
    if (!inRadius) {
      const radiusLabel = offerRadius != null
        ? (offerRadius >= 1000 ? `${(offerRadius / 1000).toFixed(1)}km` : `${Math.round(offerRadius)}m`)
        : 'the required range';
      const err        = new Error(`This offer is only available within ${radiusLabel} of the business.`);
      err.code         = 'OUT_OF_RADIUS';
      err.status       = 403;
      err.offerRadius  = offerRadius;
      throw err;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the offer row to serialise concurrent redemption attempts
    const offerResult = await client.query(
      `SELECT
         o.id, o.title, o.is_active, o.expires_at,
         o.max_redemptions, o.current_redemptions,
         o.offer_price, o.original_price, o.discount_percent,
         o.image_url, o.offer_type, o.category, o.description,
         o.business_id,
         b.name        AS business_name,
         b.address     AS business_address,
         b.city        AS business_city,
         b.logo_url    AS business_logo_url
       FROM  offers     o
       JOIN  businesses b ON b.id = o.business_id
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [offerId]
    );

    if (offerResult.rows.length === 0) {
      const err  = new Error('Offer not found.');
      err.status = 404;
      throw err;
    }

    const offer = offerResult.rows[0];

    // --- Guard: offer must be active and not expired ---
    if (!offer.is_active) {
      const err  = new Error('This offer is no longer active.');
      err.code   = 'OFFER_INACTIVE';
      err.status = 409;
      throw err;
    }
    if (offer.expires_at && new Date(offer.expires_at) <= new Date()) {
      const err  = new Error('This offer has expired.');
      err.code   = 'OFFER_EXPIRED';
      err.status = 409;
      throw err;
    }

    // --- Guard: redemption cap ---
    if (
      offer.max_redemptions != null &&
      offer.current_redemptions >= offer.max_redemptions
    ) {
      const err  = new Error('This offer has reached its maximum number of redemptions.');
      err.code   = 'REDEMPTION_CAP_REACHED';
      err.status = 409;
      throw err;
    }

    // --- Guard: one coupon per user per offer ---
    const existingCoupon = await client.query(
      `SELECT id, status FROM coupons
       WHERE user_id = $1 AND offer_id = $2`,
      [userId, offerId]
    );
    if (existingCoupon.rowCount > 0) {
      const existing = existingCoupon.rows[0];
      const err      = new Error(
        existing.status === 'redeemed'
          ? 'You have already redeemed this offer.'
          : 'You already have a coupon for this offer.'
      );
      err.code   = 'COUPON_EXISTS';
      err.status = 409;
      throw err;
    }

    // --- Generate a unique code ---
    const code = await generateUniqueCode(client);

    // --- Insert the coupon ---
    const couponResult = await client.query(
      `INSERT INTO coupons (offer_id, user_id, code, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING *`,
      [offerId, userId, code]
    );
    const coupon = couponResult.rows[0];

    // --- Increment redemptions counter on the offer ---
    await client.query(
      `UPDATE offers
       SET    current_redemptions = current_redemptions + 1,
              updated_at          = NOW()
       WHERE  id = $1`,
      [offerId]
    );

    // --- Record an offer view ---
    await client.query(
      `INSERT INTO offer_views (offer_id, user_id, viewed_at)
       VALUES ($1, $2, NOW())`,
      [offerId, userId]
    );

    await client.query('COMMIT');

    return {
      coupon,
      offer: {
        id:               offer.id,
        title:            offer.title,
        description:      offer.description,
        category:         offer.category,
        offer_type:       offer.offer_type,
        offer_price:      offer.offer_price,
        original_price:   offer.original_price,
        discount_percent: offer.discount_percent,
        image_url:        offer.image_url,
        expires_at:       offer.expires_at,
      },
      business: {
        id:       offer.business_id,
        name:     offer.business_name,
        address:  offer.business_address,
        city:     offer.business_city,
        logo_url: offer.business_logo_url,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// 2. redeemCoupon
// ---------------------------------------------------------------------------

/**
 * Validates and redeems a coupon at point-of-sale.
 *
 * @param {string} code         — the 8-char coupon code
 * @param {string} staffPin     — raw PIN entered by staff
 * @param {number} businessId   — the business processing the redemption
 *
 * @returns {{
 *   success:     true,
 *   redeemedAt:  string (ISO),
 *   couponId:    number,
 *   staffName:   string,
 *   user:        { id, firstName, lastName, email },
 *   offer:       { id, title, offer_type, offer_price },
 * }}
 */
async function redeemCoupon(code, staffPin, businessId) {
  // --- Look up the coupon with offer + user details ---
  const couponResult = await pool.query(
    `SELECT
       c.id          AS coupon_id,
       c.status,
       c.offer_id,
       c.user_id,
       o.title       AS offer_title,
       o.offer_type,
       o.offer_price,
       o.business_id,
       u.first_name,
       u.last_name,
       u.email
     FROM  coupons c
     JOIN  offers  o ON o.id = c.offer_id
     JOIN  users   u ON u.id = c.user_id
     WHERE c.code = $1`,
    [code.toUpperCase().trim()]
  );

  if (couponResult.rows.length === 0) {
    const err  = new Error('Coupon code not found.');
    err.code   = 'COUPON_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const row = couponResult.rows[0];

  // --- Verify this coupon belongs to the redeeming business ---
  if (row.business_id !== businessId) {
    const err  = new Error('This coupon is not valid for your business.');
    err.code   = 'WRONG_BUSINESS';
    err.status = 403;
    throw err;
  }

  // --- Verify coupon status ---
  if (row.status === 'redeemed') {
    const err  = new Error('This coupon has already been redeemed.');
    err.code   = 'ALREADY_REDEEMED';
    err.status = 409;
    throw err;
  }
  if (row.status === 'expired') {
    const err  = new Error('This coupon has expired.');
    err.code   = 'COUPON_EXPIRED';
    err.status = 409;
    throw err;
  }

  // --- Verify staff PIN against all active staff for this business ---
  // Fetch all active staff; bcrypt.compare each until one matches.
  // Typical businesses have ≤ 20 staff, so this is acceptable.
  const staffResult = await pool.query(
    `SELECT id, name, pin_hash
     FROM   business_staff
     WHERE  business_id = $1 AND is_active = true`,
    [businessId]
  );

  if (staffResult.rows.length === 0) {
    const err  = new Error('No active staff found for this business.');
    err.code   = 'NO_STAFF';
    err.status = 403;
    throw err;
  }

  // Run all PIN comparisons in parallel — first resolved truthy wins
  const staffMatchResult = await Promise.all(
    staffResult.rows.map(async (staff) => {
      const match = await bcrypt.compare(staffPin, staff.pin_hash);
      return match ? staff : null;
    })
  );
  const matchedStaff = staffMatchResult.find(Boolean) ?? null;

  if (!matchedStaff) {
    const err  = new Error('Invalid staff PIN.');
    err.code   = 'INVALID_PIN';
    err.status = 401;
    throw err;
  }

  // --- Mark the coupon as redeemed inside a transaction ---
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Re-check status with a row lock to prevent double-redemption
    const locked = await client.query(
      `SELECT status FROM coupons WHERE id = $1 FOR UPDATE`,
      [row.coupon_id]
    );
    if (locked.rows[0].status !== 'active') {
      await client.query('ROLLBACK');
      const err  = new Error('This coupon is no longer active.');
      err.code   = 'COUPON_NOT_ACTIVE';
      err.status = 409;
      throw err;
    }

    const now = new Date();
    await client.query(
      `UPDATE coupons
       SET    status              = 'redeemed',
              redeemed_at         = $1,
              redeemed_by_staff   = $2
       WHERE  id = $3`,
      [now, matchedStaff.id, row.coupon_id]
    );

    await client.query('COMMIT');

    return {
      success:    true,
      redeemedAt: now.toISOString(),
      couponId:   row.coupon_id,
      staffName:  matchedStaff.name,
      user: {
        id:        row.user_id,
        firstName: row.first_name,
        lastName:  row.last_name,
        email:     row.email,
      },
      offer: {
        id:         row.offer_id,
        title:      row.offer_title,
        offer_type: row.offer_type,
        offer_price: row.offer_price,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// 3. getUserCoupons
// ---------------------------------------------------------------------------

/**
 * Returns all coupons for a user, with offer and business details,
 * grouped by status.
 *
 * @param {number} userId
 * @returns {{
 *   active:   Array<object>,
 *   redeemed: Array<object>,
 *   expired:  Array<object>,
 * }}
 */
async function getUserCoupons(userId) {
  const { rows } = await pool.query(
    `SELECT
       c.id,
       c.code,
       c.status,
       c.created_at,
       c.redeemed_at,
       o.id              AS offer_id,
       o.title           AS offer_title,
       o.description     AS offer_description,
       o.offer_type,
       o.offer_price,
       o.original_price,
       o.discount_percent,
       o.image_url       AS offer_image_url,
       o.expires_at,
       o.category        AS offer_category,
       b.id              AS business_id,
       b.name            AS business_name,
       b.address         AS business_address,
       b.city            AS business_city,
       b.logo_url        AS business_logo_url,
       b.phone           AS business_phone,
       s.name            AS redeemed_by_staff_name
     FROM  coupons        c
     JOIN  offers         o ON o.id = c.offer_id
     JOIN  businesses     b ON b.id = o.business_id
     LEFT JOIN business_staff s ON s.id = c.redeemed_by_staff
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC`,
    [userId]
  );

  // Group in-process (avoids a second DB round-trip)
  const grouped = { active: [], redeemed: [], expired: [] };
  for (const row of rows) {
    const status = row.status in grouped ? row.status : 'expired';
    grouped[status].push(row);
  }

  return grouped;
}

// ---------------------------------------------------------------------------
// 4. expireCoupons  (cron job)
// ---------------------------------------------------------------------------

/**
 * Runs every 30 minutes. Marks active coupons as 'expired' when the
 * underlying offer is no longer active or has passed its expiry date.
 *
 * This is a belt-and-suspenders complement to offerService.scheduleOfferExpiry,
 * catching any coupons that slipped through between offer-expiry ticks.
 *
 * @returns {cron.ScheduledTask}
 */
function expireCoupons() {
  const task = cron.schedule('*/30 * * * *', async () => {
    const startedAt = new Date().toISOString();
    try {
      const result = await pool.query(
        `UPDATE coupons c
         SET    status = 'expired'
         FROM   offers o
         WHERE  c.offer_id = o.id
           AND  c.status   = 'active'
           AND  (
                  o.is_active  = false
                  OR (o.expires_at IS NOT NULL AND o.expires_at <= NOW())
                )
         RETURNING c.id`
      );

      if (result.rowCount > 0) {
        console.info(
          `[couponExpiry] ${startedAt} — expired ${result.rowCount} coupon(s).`
        );
      } else {
        console.info(`[couponExpiry] ${startedAt} — nothing to expire.`);
      }
    } catch (err) {
      console.error('[couponExpiry] Job failed:', err.message);
    }
  });

  console.info('[couponExpiry] Scheduler started — runs every 30 minutes.');
  return task;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  generateCoupon,
  redeemCoupon,
  getUserCoupons,
  expireCoupons,
};
