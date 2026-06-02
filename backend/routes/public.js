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
const { pickSearchTerm, fetchGifUrl } = require('../services/loyaltyGreeting');

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

// ---------------------------------------------------------------------------
// POST /api/public/stranger-milestone
//
// Called by a Dander Node when its visitor count crosses a 100-multiple
// during open hours. We ask Claude for a celebratory Giphy search term,
// fetch a PG GIF, and return both alongside a hand-tuned message keyed
// off the milestone number.
//
// Public because the Node has no JWT yet during this PoC. The milestone
// only fires from the kiosk's own state machine, so the failure mode of
// a curl spam is just wasted Claude+Giphy calls — rate-limit to be safe.
// ---------------------------------------------------------------------------

const milestoneLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, code: 'RATE_LIMITED', message: 'Slow down.' },
});

const MILESTONE_MESSAGES = {
  100:  "You're our 100th visitor today!",
  200:  "200 visitors today — you made it!",
  300:  "300 visitors — what a day!",
  500:  "HALFWAY TO 1000! 🚀",
  1000: "1000 VISITORS!! LEGENDARY!! 🏆",
};

function messageFor(milestone) {
  return MILESTONE_MESSAGES[milestone] || `You're visitor #${milestone} today!`;
}

router.post('/stranger-milestone', milestoneLimiter, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const milestone = parseInt(body.milestone, 10);
  const businessId = parseInt(body.business_id, 10);
  if (!Number.isFinite(milestone) || milestone <= 0) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'milestone must be a positive integer.' });
  }

  let category = 'shop';
  if (Number.isFinite(businessId)) {
    try {
      const { rows } = await pool.query('SELECT category FROM businesses WHERE id = $1', [businessId]);
      if (rows.length > 0 && rows[0].category) category = rows[0].category;
    } catch (err) {
      // Don't block on category lookup — fall through with the default.
      console.warn('[public/stranger-milestone] category lookup failed:', err.message);
    }
  }

  // Claude → Giphy. Both degrade to null on failure; the Node already
  // renders text-only in that case so the celebration still happens.
  const searchTerm =
    (await pickSearchTerm({
      first_name: 'a customer',
      visit_number: milestone,
      greeting_type: 'milestone_visitor',
      business_category: category,
      part_of_day: 'today',
      tone: 'celebratory',
      last_visit_text: '',
    })) || 'celebration confetti';

  const gifUrl = await fetchGifUrl(searchTerm, null);

  return res.status(200).json({
    success: true,
    gif_url: gifUrl,
    message: messageFor(milestone),
    search_term: searchTerm,
    milestone,
  });
});

module.exports = router;
