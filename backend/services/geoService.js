'use strict';

/**
 * geoService.js
 *
 * Geographic query helpers using the Haversine formula expressed directly
 * in SQL, so all distance filtering happens inside PostgreSQL with no
 * row-level iteration in Node.
 *
 * Earth radius constant: 6 371 000 m (metres).
 *
 * PostGIS note: if the PostGIS extension is present and the `location`
 * GEOGRAPHY column on `offers` is populated, swap the Haversine expression
 * for `ST_DWithin(o.location, ST_MakePoint($lng,$lat)::geography, $radius)`
 * for a significant performance improvement on large datasets.
 */

const pool = require('../db/pool');

// ---------------------------------------------------------------------------
// Internal — Haversine SQL fragment
// ---------------------------------------------------------------------------
//
// Returns the distance in metres between two points.
// LEAST(1.0, ...) guards against floating-point values marginally above 1
// that would cause acos() to return NaN.
//
// Parameters injected by the caller as positional $N placeholders.
//   $latParam  — name of the SQL expression for the user's latitude
//   $lngParam  — name of the SQL expression for the user's longitude
//   $rowLat    — SQL expression for the row's latitude  (e.g. "b.lat")
//   $rowLng    — SQL expression for the row's longitude (e.g. "b.lng")
//
function haversineExpr(userLatParam, userLngParam, rowLat, rowLng) {
  return `
    (6371000 * acos(
      LEAST(1.0,
        cos(radians(${userLatParam})) * cos(radians(${rowLat}))
          * cos(radians(${rowLng}) - radians(${userLngParam}))
        + sin(radians(${userLatParam})) * sin(radians(${rowLat}))
      )
    ))
  `.trim();
}

// ---------------------------------------------------------------------------
// 1. getOffersNearLocation
// ---------------------------------------------------------------------------

/**
 * Returns active, non-expired, redeemable offers whose *business* location
 * falls within `radiusMeters` of the supplied coordinates.
 *
 * @param {number}  lat
 * @param {number}  lng
 * @param {number}  radiusMeters   — outer search radius (metres)
 * @param {object}  [filters]
 * @param {string}  [filters.category]   — exact match on o.category
 * @param {string}  [filters.offer_type] — 'deal' | 'promotion' | 'clearance'
 * @param {number}  [filters.max_price]  — o.offer_price <= max_price
 *
 * @returns {Array<{
 *   id, business_id, title, description, terms, category,
 *   image_url, offer_type, original_price, offer_price, discount_percent,
 *   lat, lng, radius_meters, max_redemptions, current_redemptions,
 *   starts_at, expires_at, is_active, created_at, updated_at,
 *   business_name, business_logo_url, business_address, business_city,
 *   distance_meters
 * }>}
 */
async function getOffersNearLocation(lat, lng, radiusMeters, filters = {}) {
  // Positional params: $1 = lat, $2 = lng, $3 = radiusMeters
  // Optional filter params start at $4
  const params = [lat, lng, radiusMeters];
  const conditions = [];
  let   paramIndex  = 4;

  const distanceExpr = haversineExpr('$1', '$2', 'b.lat', 'b.lng');

  // Static conditions
  const baseConditions = `
    o.is_active  = true
    AND (o.expires_at IS NULL OR o.expires_at > NOW())
    AND (o.max_redemptions IS NULL OR o.current_redemptions < o.max_redemptions)
    AND b.status = 'active'
    AND b.lat IS NOT NULL
    AND b.lng IS NOT NULL
    AND ${distanceExpr} <= $3
  `;

  // Dynamic optional filters
  if (filters.category) {
    conditions.push(`o.category = $${paramIndex++}`);
    params.push(filters.category);
  }
  if (filters.offer_type) {
    conditions.push(`o.offer_type = $${paramIndex++}`);
    params.push(filters.offer_type);
  }
  if (filters.max_price != null) {
    conditions.push(`o.offer_price <= $${paramIndex++}`);
    params.push(filters.max_price);
  }

  const extraWhere = conditions.length
    ? `AND ${conditions.join(' AND ')}`
    : '';

  const sql = `
    SELECT
      o.id,
      o.business_id,
      o.title,
      o.description,
      o.terms,
      o.category,
      o.image_url,
      o.offer_type,
      o.original_price,
      o.offer_price,
      o.discount_percent,
      o.lat,
      o.lng,
      o.radius_meters,
      o.max_redemptions,
      o.current_redemptions,
      o.starts_at,
      o.expires_at,
      o.is_active,
      o.icon_color,
      o.show_when_closed,
      o.show_countdown,
      o.created_at,
      o.updated_at,
      b.name        AS business_name,
      b.logo_url    AS business_logo_url,
      b.address     AS business_address,
      b.city        AS business_city,
      b.lat         AS business_lat,
      b.lng         AS business_lng,
      ROUND(${distanceExpr}::numeric, 1) AS distance_meters
    FROM  offers     o
    JOIN  businesses b ON b.id = o.business_id
    WHERE ${baseConditions}
    ${extraWhere}
    ORDER BY distance_meters ASC
  `;

  const { rows } = await pool.query(sql, params);

  // Enrich each offer with business hours status + countdown
  const hoursService = require('./hoursService');
  const businessCache = {};

  for (const offer of rows) {
    const bizId = offer.business_id;
    if (!businessCache[bizId]) {
      businessCache[bizId] = await hoursService.isBusinessOpen(bizId);
    }
    const status = businessCache[bizId];
    offer.business_is_open      = status.isOpen;
    offer.business_closes_at    = status.closesAt;
    offer.minutes_until_close   = status.minutesUntilClose;
    offer.business_next_open    = status.nextOpenTime;
    offer.hours_configured      = status.hoursConfigured;

    const countdown = hoursService.buildCountdownLabel(offer, status);
    offer.countdown_label   = countdown?.text || null;
    offer.countdown_urgency = countdown?.urgency || null;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// 2. checkUserInOfferRadius
// ---------------------------------------------------------------------------

/**
 * Returns true when the user's position is within the offer's own
 * `radius_meters` geofence (stored on the offer row itself).
 *
 * @param {number} userLat
 * @param {number} userLng
 * @param {number} offerId
 * @returns {boolean}
 */
async function checkUserInOfferRadius(userLat, userLng, offerId) {
  const distanceExpr = haversineExpr('$1', '$2', 'o.lat', 'o.lng');

  const sql = `
    SELECT
      ${distanceExpr}        AS distance_meters,
      o.radius_meters        AS offer_radius
    FROM offers o
    WHERE o.id  = $3
      AND o.lat IS NOT NULL
      AND o.lng IS NOT NULL
  `;

  const { rows } = await pool.query(sql, [userLat, userLng, offerId]);

  if (rows.length === 0) return { inRadius: false, offerRadius: null };

  const { distance_meters, offer_radius } = rows[0];
  return {
    inRadius:    parseFloat(distance_meters) <= parseFloat(offer_radius),
    offerRadius: parseFloat(offer_radius),
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { getOffersNearLocation, checkUserInOfferRadius };
