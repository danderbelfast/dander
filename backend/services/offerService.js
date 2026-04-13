'use strict';

/**
 * offerService.js
 *
 * Business logic for offers:
 *   createOffer        — validates and inserts a new offer
 *   updateOffer        — partial update with ownership enforcement
 *   deactivateOffer    — soft-deactivate with ownership enforcement
 *   getOfferStats      — analytics (views, redemptions, peak hour, saved count)
 *   scheduleOfferExpiry — node-cron job that expires offers every 15 minutes
 */

const cron = require('node-cron');
const pool = require('../db/pool');

// ---------------------------------------------------------------------------
// Allowed fields for create / update (whitelist prevents mass-assignment)
// ---------------------------------------------------------------------------

const MUTABLE_FIELDS = [
  'title', 'description', 'terms', 'category', 'image_url', 'offer_type',
  'original_price', 'offer_price', 'discount_percent', 'cost_price', 'selling_price',
  'lat', 'lng', 'radius_meters',
  'max_redemptions', 'starts_at', 'expires_at', 'is_active', 'icon_color',
  'show_when_closed', 'show_countdown',
];

const REQUIRED_ON_CREATE = ['title', 'offer_type'];

const VALID_OFFER_TYPES = new Set(['deal', 'promotion', 'clearance', 'percentage', 'fixed', 'bogo', 'free_item', 'custom']);

// ---------------------------------------------------------------------------
// Internal — validation helper
// ---------------------------------------------------------------------------

function validateOfferData(data, { requireAll = false } = {}) {
  const errors = [];

  if (requireAll) {
    for (const field of REQUIRED_ON_CREATE) {
      if (data[field] == null || data[field] === '') {
        errors.push(`${field} is required.`);
      }
    }
  }

  if (data.offer_type != null && !VALID_OFFER_TYPES.has(data.offer_type)) {
    errors.push(`offer_type must be one of: ${[...VALID_OFFER_TYPES].join(', ')}.`);
  }

  if (data.original_price != null && Number(data.original_price) < 0) {
    errors.push('original_price must not be negative.');
  }

  if (data.offer_price != null && Number(data.offer_price) < 0) {
    errors.push('offer_price must not be negative.');
  }

  if (data.cost_price != null && Number(data.cost_price) < 0) {
    errors.push('cost_price must not be negative.');
  }

  if (data.selling_price != null && Number(data.selling_price) < 0) {
    errors.push('selling_price must not be negative.');
  }

  if (
    data.discount_percent != null &&
    (Number(data.discount_percent) < 0 || Number(data.discount_percent) > 100)
  ) {
    errors.push('discount_percent must be between 0 and 100.');
  }

  if (data.radius_meters != null && Number(data.radius_meters) <= 0) {
    errors.push('radius_meters must be a positive integer.');
  }

  if (data.max_redemptions != null && Number(data.max_redemptions) <= 0) {
    errors.push('max_redemptions must be a positive integer.');
  }

  if (data.starts_at && data.expires_at) {
    if (new Date(data.expires_at) <= new Date(data.starts_at)) {
      errors.push('expires_at must be after starts_at.');
    }
  }

  if (errors.length > 0) {
    const err    = new Error(errors.join(' '));
    err.code     = 'VALIDATION_ERROR';
    err.status   = 400;
    err.details  = errors;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 1. createOffer
// ---------------------------------------------------------------------------

/**
 * Validates and inserts a new offer for the given business.
 *
 * If lat/lng are not supplied, they are copied from the owning business so
 * the offer inherits the business location.
 *
 * @param {number} businessId
 * @param {object} offerData
 * @returns {object} The newly created offer row
 */
async function createOffer(businessId, offerData) {
  validateOfferData(offerData, { requireAll: true });

  // Resolve lat/lng: use explicit values or fall back to the business location
  let { lat, lng } = offerData;
  if (lat == null || lng == null) {
    const bizResult = await pool.query(
      'SELECT lat, lng FROM businesses WHERE id = $1',
      [businessId]
    );
    if (bizResult.rows.length === 0) {
      const err = new Error('Business not found.');
      err.status = 404;
      throw err;
    }
    lat = lat ?? bizResult.rows[0].lat;
    lng = lng ?? bizResult.rows[0].lng;
  }

  const { rows } = await pool.query(
    `INSERT INTO offers (
       business_id, title, description, terms, category, image_url, offer_type,
       original_price, offer_price, discount_percent, cost_price, selling_price,
       lat, lng, radius_meters,
       max_redemptions, starts_at, expires_at, is_active, icon_color
     ) VALUES (
       $1,  $2,  $3,  $4,  $5,  $6,  $7,
       $8,  $9,  $10, $11, $12,
       $13, $14, $15,
       $16, $17, $18, $19, $20
     )
     RETURNING *`,
    [
      businessId,
      offerData.title,
      offerData.description    ?? null,
      offerData.terms          ?? null,
      offerData.category       ?? null,
      offerData.image_url      ?? null,
      offerData.offer_type,
      offerData.original_price ?? null,
      offerData.offer_price    ?? null,
      offerData.discount_percent ?? null,
      offerData.cost_price     ?? null,
      offerData.selling_price  ?? null,
      lat,
      lng,
      offerData.radius_meters  ?? 1000,
      offerData.max_redemptions ?? null,
      offerData.starts_at      ?? null,
      offerData.expires_at     ?? null,
      offerData.is_active      ?? true,
      offerData.icon_color     ?? '#000000',
    ]
  );

  return rows[0];
}

// ---------------------------------------------------------------------------
// 2. updateOffer
// ---------------------------------------------------------------------------

/**
 * Partially updates an offer. Only whitelisted fields are accepted.
 * Enforces that the offer belongs to `businessId`.
 *
 * @param {number} offerId
 * @param {number} businessId
 * @param {object} updates    — any subset of MUTABLE_FIELDS
 * @returns {object}          — updated offer row
 */
async function updateOffer(offerId, businessId, updates) {
  validateOfferData(updates);

  // Strip any keys not in the whitelist
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([k]) => MUTABLE_FIELDS.includes(k))
  );

  if (Object.keys(safeUpdates).length === 0) {
    const err    = new Error('No valid fields provided for update.');
    err.status   = 400;
    throw err;
  }

  // Build SET clause dynamically: SET col = $3, col2 = $4, ...
  // $1 = offerId, $2 = businessId
  const setClauses = Object.keys(safeUpdates).map(
    (col, i) => `${col} = $${i + 3}`
  );
  const values = [offerId, businessId, ...Object.values(safeUpdates)];

  const sql = `
    UPDATE offers
    SET    ${setClauses.join(', ')}, updated_at = NOW()
    WHERE  id = $1 AND business_id = $2
    RETURNING *
  `;

  const { rows } = await pool.query(sql, values);

  if (rows.length === 0) {
    const err    = new Error('Offer not found or you do not own this offer.');
    err.status   = 404;
    throw err;
  }

  return rows[0];
}

// ---------------------------------------------------------------------------
// 3. deactivateOffer
// ---------------------------------------------------------------------------

/**
 * Soft-deactivates an offer (is_active = false). Ownership is enforced.
 *
 * @param {number} offerId
 * @param {number} businessId
 * @returns {{ id: number, is_active: false }}
 */
async function deactivateOffer(offerId, businessId) {
  const { rows } = await pool.query(
    `UPDATE offers
     SET    is_active = false, updated_at = NOW()
     WHERE  id = $1 AND business_id = $2
     RETURNING id, is_active`,
    [offerId, businessId]
  );

  if (rows.length === 0) {
    const err    = new Error('Offer not found or you do not own this offer.');
    err.status   = 404;
    throw err;
  }

  return rows[0];
}

// ---------------------------------------------------------------------------
// 4. getOfferStats
// ---------------------------------------------------------------------------

/**
 * Returns analytics for a single offer.
 * Ownership is enforced: the offer must belong to `businessId`.
 *
 * @returns {{
 *   offer_id:              number,
 *   views:                 number,
 *   redemptions:           number,
 *   redemption_rate:       string,   "12.50%" — based on views
 *   redemptions_by_day:    Array<{ date: string, count: number }>,
 *   peak_hour:             number | null,  0–23 UTC hour with most views
 *   total_saved:           number,
 * }}
 */
async function getOfferStats(offerId, businessId) {
  // Verify ownership first
  const ownerCheck = await pool.query(
    'SELECT * FROM offers WHERE id = $1 AND business_id = $2',
    [offerId, businessId]
  );
  if (ownerCheck.rows.length === 0) {
    const err    = new Error('Offer not found or you do not own this offer.');
    err.status   = 404;
    throw err;
  }
  const offerRow = ownerCheck.rows[0];
  const { current_redemptions } = offerRow;

  // Run all analytics queries in parallel
  const [viewsResult, couponCountsResult, viewsByDayResult, claimedByDayResult, redeemedByDayResult, peakHourResult, savedResult] =
    await Promise.all([
      // Total view count
      pool.query(
        'SELECT COUNT(*) AS total FROM offer_views WHERE offer_id = $1',
        [offerId]
      ),

      // Claimed vs redeemed coupon counts
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'active')   AS total_claimed,
           COUNT(*) FILTER (WHERE status = 'redeemed') AS total_redeemed
         FROM coupons
         WHERE offer_id = $1`,
        [offerId]
      ),

      // Views per day for the last 30 days
      pool.query(
        `SELECT
           TO_CHAR(viewed_at, 'YYYY-MM-DD') AS date,
           COUNT(*)::int                     AS count
         FROM   offer_views
         WHERE  offer_id = $1
           AND  viewed_at >= NOW() - INTERVAL '30 days'
         GROUP  BY date
         ORDER  BY date ASC`,
        [offerId]
      ),

      // Claimed (coupon issued) per day for the last 30 days
      pool.query(
        `SELECT
           TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
           COUNT(*)::int                      AS count
         FROM   coupons
         WHERE  offer_id = $1
           AND  created_at >= NOW() - INTERVAL '30 days'
         GROUP  BY date
         ORDER  BY date ASC`,
        [offerId]
      ),

      // Redeemed (used at counter) per day for the last 30 days
      pool.query(
        `SELECT
           TO_CHAR(redeemed_at, 'YYYY-MM-DD') AS date,
           COUNT(*)::int                        AS count
         FROM   coupons
         WHERE  offer_id = $1
           AND  status   = 'redeemed'
           AND  redeemed_at >= NOW() - INTERVAL '30 days'
         GROUP  BY date
         ORDER  BY date ASC`,
        [offerId]
      ),

      // Hour-of-day (UTC) with the most views
      pool.query(
        `SELECT
           EXTRACT(HOUR FROM viewed_at)::int AS hour,
           COUNT(*)::int                      AS view_count
         FROM   offer_views
         WHERE  offer_id = $1
         GROUP  BY hour
         ORDER  BY view_count DESC
         LIMIT  1`,
        [offerId]
      ),

      // Total saves
      pool.query(
        'SELECT COUNT(*) AS total FROM saved_offers WHERE offer_id = $1',
        [offerId]
      ),
    ]);

  const views         = parseInt(viewsResult.rows[0]?.total ?? 0, 10);
  const totalClaimed  = parseInt(couponCountsResult.rows[0]?.total_claimed  ?? 0, 10);
  const totalRedeemed = parseInt(couponCountsResult.rows[0]?.total_redeemed ?? 0, 10);
  const peakHourRow   = peakHourResult.rows[0];

  const redemptionRate =
    views > 0
      ? ((totalRedeemed / views) * 100).toFixed(2) + '%'
      : '0.00%';

  return {
    offer_id:           offerId,
    offer:              offerRow,
    views,
    total_claimed:      totalClaimed,
    total_redeemed:     totalRedeemed,
    redemption_rate:    redemptionRate,
    views_by_day:       viewsByDayResult.rows,
    claimed_by_day:     claimedByDayResult.rows,
    redeemed_by_day:    redeemedByDayResult.rows,
    peak_hour:          peakHourRow ? peakHourRow.hour : null,
    total_saved:        parseInt(savedResult.rows[0]?.total ?? 0, 10),
  };
}

// ---------------------------------------------------------------------------
// 5. scheduleOfferExpiry
// ---------------------------------------------------------------------------

/**
 * Starts a node-cron job that runs every 15 minutes and sets is_active = false
 * on any offer whose expires_at has passed.
 *
 * Also marks any linked active coupons as 'expired'.
 *
 * Call once at application startup (e.g. from src/index.js).
 *
 * @returns {cron.ScheduledTask} — call .stop() to cancel
 */
function scheduleOfferExpiry() {
  const task = cron.schedule('*/15 * * * *', async () => {
    const startedAt = new Date().toISOString();
    try {
      // 1. Deactivate expired offers
      const offerResult = await pool.query(
        `UPDATE offers
         SET    is_active  = false,
                updated_at = NOW()
         WHERE  is_active  = true
           AND  expires_at IS NOT NULL
           AND  expires_at <= NOW()
         RETURNING id`
      );

      const expiredIds = offerResult.rows.map((r) => r.id);

      if (expiredIds.length === 0) {
        console.info(`[offerExpiry] ${startedAt} — no offers expired.`);
        return;
      }

      console.info(
        `[offerExpiry] ${startedAt} — deactivated ${expiredIds.length} offer(s): [${expiredIds.join(', ')}]`
      );

      // 2. Expire any active coupons linked to those offers
      const couponResult = await pool.query(
        `UPDATE coupons
         SET    status = 'expired'
         WHERE  status  = 'active'
           AND  offer_id = ANY($1::int[])
         RETURNING id`,
        [expiredIds]
      );

      if (couponResult.rowCount > 0) {
        console.info(
          `[offerExpiry]   ↳ expired ${couponResult.rowCount} coupon(s).`
        );
      }
    } catch (err) {
      console.error('[offerExpiry] Job failed:', err.message);
    }
  });

  console.info('[offerExpiry] Scheduler started — runs every 15 minutes.');
  return task;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createOffer,
  updateOffer,
  deactivateOffer,
  getOfferStats,
  scheduleOfferExpiry,
};
