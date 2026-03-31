'use strict';

const { Router } = require('express');
const { query, param, validationResult } = require('express-validator');

const pool       = require('../db/pool');
const geoService = require('../services/geoService');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = Router();

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /api/offers/stats  — public, no auth required
// Returns live counts for the user-facing explainer page.
// ---------------------------------------------------------------------------

router.get('/stats', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)
           FROM offers
          WHERE is_active = true
            AND (expires_at IS NULL OR expires_at > NOW())
        )::int                                                   AS active_offers,

        (SELECT COUNT(DISTINCT b.id)
           FROM businesses b
           JOIN offers o ON o.business_id = b.id
          WHERE b.status = 'active'
            AND o.is_active = true
            AND (o.expires_at IS NULL OR o.expires_at > NOW())
        )::int                                                   AS active_businesses,

        (SELECT COUNT(*)
           FROM coupons
          WHERE status = 'redeemed'
        )::int                                                   AS total_redemptions,

        (SELECT ROUND(AVG(o.original_price - o.offer_price), 2)
           FROM offers o
          WHERE o.original_price IS NOT NULL
            AND o.offer_price    IS NOT NULL
            AND o.original_price > o.offer_price
        )::float                                                 AS avg_saving
    `);
    return ok(res, { stats: rows[0] });
  } catch (err) {
    return fail(res, 500, 'SERVER_ERROR', 'Could not load stats.');
  }
});

// ---------------------------------------------------------------------------
// GET /api/offers/nearby
// ?lat=&lng=&radius=&category=&type=&max_price=
// ---------------------------------------------------------------------------

router.get(
  '/nearby',
  [
    query('lat').isFloat({ min: -90,  max: 90  }).withMessage('Valid lat is required.'),
    query('lng').isFloat({ min: -180, max: 180 }).withMessage('Valid lng is required.'),
    query('radius')
      .optional()
      .isInt({ min: 100, max: 50000 })
      .withMessage('radius must be between 100 and 50000 metres.'),
    query('category').optional().trim().escape(),
    query('type')
      .optional()
      .isIn(['deal', 'promotion', 'clearance'])
      .withMessage('type must be deal, promotion, or clearance.'),
    query('max_price').optional().isFloat({ min: 0 }).withMessage('max_price must be a positive number.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const lat    = parseFloat(req.query.lat);
      const lng    = parseFloat(req.query.lng);
      const radius = parseInt(req.query.radius || '2000', 10);

      const filters = {};
      if (req.query.category)  filters.category   = req.query.category;
      if (req.query.type)      filters.offer_type  = req.query.type;
      if (req.query.max_price) filters.max_price   = parseFloat(req.query.max_price);

      const offers = await geoService.getOffersNearLocation(lat, lng, radius, filters);

      return ok(res, { count: offers.length, offers });
    } catch (err) {
      console.error('[offers/nearby]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch nearby offers.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/offers/saved   — saved offers for the authenticated user
// NOTE: must be registered BEFORE /:id to prevent Express matching 'saved' as an id
// ---------------------------------------------------------------------------

router.get('/saved', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         o.*,
         b.name     AS business_name,
         b.logo_url AS business_logo_url,
         b.address  AS business_address,
         b.city     AS business_city
       FROM  saved_offers s
       JOIN  offers       o ON o.id = s.offer_id
       JOIN  businesses   b ON b.id = o.business_id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    return ok(res, { count: rows.length, offers: rows });
  } catch (err) {
    console.error('[offers/saved GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch saved offers.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/offers/:id/save
// ---------------------------------------------------------------------------

router.post(
  '/:id/save',
  requireAuth,
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      await pool.query(
        `INSERT INTO saved_offers (user_id, offer_id) VALUES ($1, $2)
         ON CONFLICT ON CONSTRAINT uq_saved_offers DO NOTHING`,
        [req.user.id, req.params.id]
      );
      return ok(res, { message: 'Offer saved.' });
    } catch (err) {
      console.error('[offers/:id/save POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to save offer.');
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/offers/:id/save
// ---------------------------------------------------------------------------

router.delete(
  '/:id/save',
  requireAuth,
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      await pool.query(
        'DELETE FROM saved_offers WHERE user_id = $1 AND offer_id = $2',
        [req.user.id, req.params.id]
      );
      return ok(res, { message: 'Offer unsaved.' });
    } catch (err) {
      console.error('[offers/:id/save DELETE]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to unsave offer.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/offers/:id   — single offer with business details
// ---------------------------------------------------------------------------

router.get(
  '/:id',
  optionalAuth,
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rows } = await pool.query(
        `SELECT
           o.*,
           b.name          AS business_name,
           b.logo_url      AS business_logo_url,
           b.address       AS business_address,
           b.city          AS business_city,
           b.phone         AS business_phone,
           b.website       AS business_website,
           b.lat           AS business_lat,
           b.lng           AS business_lng
         FROM  offers       o
         JOIN  businesses   b ON b.id = o.business_id
         WHERE o.id = $1 AND o.is_active = true`,
        [req.params.id]
      );
      if (rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Offer not found.');

      const offer = rows[0];

      if (req.user) {
        const { rows: savedRows } = await pool.query(
          'SELECT 1 FROM saved_offers WHERE user_id = $1 AND offer_id = $2',
          [req.user.id, offer.id]
        );
        offer.is_saved = savedRows.length > 0;
      } else {
        offer.is_saved = false;
      }

      return ok(res, { offer });
    } catch (err) {
      console.error('[offers/:id GET]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch offer.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/offers/:id/view   — record a view
// ---------------------------------------------------------------------------

router.post(
  '/:id/view',
  requireAuth,
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      await pool.query(
        `INSERT INTO offer_views (offer_id, user_id, viewed_at) VALUES ($1, $2, NOW())`,
        [req.params.id, req.user.id]
      );
      return ok(res, { message: 'View recorded.' });
    } catch (err) {
      console.error('[offers/:id/view POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to record view.');
    }
  }
);

module.exports = router;
