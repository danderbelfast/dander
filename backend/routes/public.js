'use strict';

/**
 * public.js — endpoints that intentionally have no auth, used during
 * device / app onboarding where the caller has no credentials yet.
 *
 *   GET /api/public/business/code/:code
 *     4-digit business code -> { business_id, business_name }.
 *     Rate-limited per-IP to keep code space (~9000 values) from being
 *     brute-forced.
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');

const router = Router();

// 30 lookups per 5 minutes per IP is plenty for legitimate setup flows
// and well below what's needed to enumerate the code space.
const codeLookupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max:      30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, code: 'RATE_LIMITED', message: 'Too many code lookups. Please wait a few minutes.' },
});

router.get('/business/code/:code', codeLookupLimiter, async (req, res) => {
  const raw = req.params.code || '';
  if (!/^\d{4}$/.test(raw)) {
    return res.status(400).json({ success: false, code: 'INVALID_CODE', message: 'Code must be 4 digits.' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM businesses WHERE business_code = $1 LIMIT 1',
      [raw]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No business found for that code.' });
    }
    return res.json({
      success: true,
      business_id:   rows[0].id,
      business_name: rows[0].name,
    });
  } catch (err) {
    console.error('[public/business/code]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Lookup failed.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/public/business/:id/stranger-display
//
// What the Dander Node should render when there's no matched user. The
// Node polls this every ~5 min while idle. No auth — the response is
// already public-facing content (business name + today's offer + app
// download CTA).
// ---------------------------------------------------------------------------

router.get('/business/:id/stranger-display', async (req, res) => {
  const businessId = parseInt(req.params.id, 10);
  if (!Number.isFinite(businessId)) {
    return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'business id must be numeric.' });
  }
  try {
    const { rows: bizRows } = await pool.query(
      'SELECT id, name FROM businesses WHERE id = $1 LIMIT 1',
      [businessId]
    );
    if (bizRows.length === 0) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Business not found.' });
    }
    const business = bizRows[0];

    // Most recent active offer if any. Limit columns to what a kiosk
    // display needs — title + short description + headline price.
    const { rows: offerRows } = await pool.query(
      `SELECT id, title, description, offer_type, original_price, offer_price, discount_percent
         FROM offers
        WHERE business_id = $1 AND is_active = TRUE
        ORDER BY created_at DESC
        LIMIT 1`,
      [businessId]
    );
    const offer = offerRows[0] || null;

    // Today's visitor count — entrance nodes only. Till / display /
    // general zones aren't customer entries and would inflate the
    // headline number on the kiosk. UTC day boundary as elsewhere.
    const { rows: countRows } = await pool.query(
      `SELECT COALESCE(SUM(count_in), 0)::int AS visitors
         FROM phone_counter_readings
        WHERE business_id = $1
          AND zone_type = 'entrance'
          AND (timestamp AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date`,
      [businessId]
    );
    const visitorCountToday = countRows[0]?.visitors ?? 0;

    return res.status(200).json({
      success: true,
      business_name: business.name,
      todays_offer: offer,
      app_download_url: 'https://dander.io',
      visitor_count_today: visitorCountToday,
      custom_message: 'Scan to get loyalty points',
    });
  } catch (err) {
    console.error('[public/stranger-display]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load stranger display.' });
  }
});

module.exports = router;
