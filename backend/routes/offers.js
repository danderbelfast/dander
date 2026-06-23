'use strict';

const { Router } = require('express');
const { query, param, validationResult } = require('express-validator');

const { body } = require('express-validator');
const pool       = require('../db/pool');
const geoService = require('../services/geoService');
const reviewService = require('../services/reviewService');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const offerActivation = require('../services/offerActivation');
const { normalizeChannel } = require('../utils/offerChannel');

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

// ---------------------------------------------------------------------------
// GET /api/offers  — paginated list of active offers (no location required)
// ?limit=50&status=active
// Used by the app's Offers tab for general browsing.
// ---------------------------------------------------------------------------

router.get(
  '/',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage('limit must be 1..200.'),
    query('status')
      .optional()
      .isIn(['active', 'all'])
      .withMessage('status must be "active" or "all".'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const limit  = parseInt(req.query.limit || '50', 10);
      const status = req.query.status || 'active';
      const activeFilter = status === 'active'
        ? `AND o.is_active = true AND (o.expires_at IS NULL OR o.expires_at > NOW())
           AND b.status = 'active'`
        : '';
      const { rows } = await pool.query(
        `SELECT o.*,
                b.name       AS business_name,
                b.category   AS business_category,
                b.logo_url   AS business_logo_url,
                b.address    AS business_address,
                b.city       AS business_city
           FROM offers     o
           JOIN businesses b ON b.id = o.business_id
          WHERE 1 = 1 ${activeFilter}
          ORDER BY o.created_at DESC
          LIMIT $1`,
        [limit]
      );
      return ok(res, { count: rows.length, offers: rows });
    } catch (err) {
      console.error('[offers/]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch offers.');
    }
  }
);

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
// GET /api/offers/story/:businessId — public story (only if business is open)
// ---------------------------------------------------------------------------

router.get(
  '/story/:businessId',
  [param('businessId').isInt({ min: 1 }).withMessage('Invalid business ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const hoursService = require('../services/hoursService');
      const status = await hoursService.isBusinessOpen(parseInt(req.params.businessId, 10));
      if (!status.isOpen) return ok(res, { story: null });

      const { rows } = await pool.query(
        `SELECT s.*, b.name AS business_name, b.logo_url AS business_logo_url
         FROM business_stories s
         JOIN businesses b ON b.id = s.business_id
         WHERE s.business_id = $1
           AND (s.created_at AT TIME ZONE 'Europe/London')::date = (NOW() AT TIME ZONE 'Europe/London')::date
         ORDER BY s.created_at DESC LIMIT 1`,
        [req.params.businessId]
      );
      return ok(res, { story: rows[0] || null });
    } catch (err) {
      console.error('[offers/story/:businessId GET]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch story.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/offers/activated — the caller's "My Offers" (non-expired)
// NOTE: must be registered BEFORE /:id so 'activated' isn't matched as an id.
// ---------------------------------------------------------------------------
router.get('/activated', requireAuth, async (req, res) => {
  try {
    const offers = await offerActivation.listMyOffers(pool, req.user.id);
    return ok(res, { count: offers.length, offers });
  } catch (err) {
    console.error('[offers/activated GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch activated offers.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/offers/:id/activate — record the activate intent event.
// optionalAuth: logged-in → user_id; logged-out → requires anon_id in body.
// Body: { channel: 'app'|'web'|'sticker', anon_id?: string }
// GDPR: anon_id is a device identifier (privacy-flagged) — consent/erasure
// handled by the GDPR pass; NOT production-ready for real users until then.
// ---------------------------------------------------------------------------
router.post(
  '/:id/activate',
  optionalAuth,
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    const channel = normalizeChannel(req.body?.channel);
    if (!channel) return fail(res, 400, 'VALIDATION_ERROR', 'channel must be app, web, or sticker.');

    const userId = req.user?.id ?? null;
    const anonId = userId ? null : (typeof req.body?.anon_id === 'string' ? req.body.anon_id.slice(0, 100) : null);
    if (!userId && !anonId) return fail(res, 400, 'VALIDATION_ERROR', 'Sign in or provide anon_id to activate.');

    try {
      const row = await offerActivation.activate(pool, {
        offerId: parseInt(req.params.id, 10), channel, userId, anonId,
      });
      return ok(res, { activation_id: row.id, status: row.status });
    } catch (err) {
      if (err.status === 404) return fail(res, 404, 'NOT_FOUND', err.message);
      if (err.status === 409) return fail(res, 409, 'OFFER_INACTIVE', err.message);
      console.error('[offers/:id/activate POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to activate offer.');
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/offers/:id/activate — remove an activation (My Offers un-activate)
// ---------------------------------------------------------------------------
router.delete(
  '/:id/activate',
  optionalAuth,
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    const userId = req.user?.id ?? null;
    const anonId = userId ? null : (typeof req.body?.anon_id === 'string' ? req.body.anon_id.slice(0, 100) : null);
    if (!userId && !anonId) return fail(res, 400, 'VALIDATION_ERROR', 'Sign in or provide anon_id.');
    try {
      await offerActivation.deactivate(pool, { offerId: parseInt(req.params.id, 10), userId, anonId });
      return ok(res, { message: 'Deactivated.' });
    } catch (err) {
      console.error('[offers/:id/activate DELETE]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to deactivate offer.');
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
           b.lng           AS business_lng,
           b.avg_rating    AS business_avg_rating,
           b.review_count  AS business_review_count,
           b.rating_visible AS business_rating_visible,
           EXISTS (
             SELECT 1 FROM business_stories bs
             WHERE bs.business_id = o.business_id
               AND (bs.created_at AT TIME ZONE 'Europe/London')::date = (NOW() AT TIME ZONE 'Europe/London')::date
           ) AS has_story
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

// ---------------------------------------------------------------------------
// GET /api/offers/reviews/:businessId — public reviews for a business
// ---------------------------------------------------------------------------

router.get(
  '/reviews/:businessId',
  [param('businessId').isInt({ min: 1 })],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const data = await reviewService.getBusinessReviews(parseInt(req.params.businessId, 10));
      return ok(res, data);
    } catch (err) {
      console.error('[offers/reviews GET]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to load reviews.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/offers/reviews — submit a review (must have redeemed)
// ---------------------------------------------------------------------------

router.post(
  '/reviews',
  requireAuth,
  [
    body('coupon_id').isInt({ min: 1 }).withMessage('coupon_id is required.'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be 1-5.'),
    body('comment').optional().trim().isLength({ max: 500 }),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const canPost = await reviewService.canReview(req.user.id, req.body.coupon_id);
      if (!canPost) return fail(res, 409, 'ALREADY_REVIEWED', 'You have already reviewed this redemption.');

      const review = await reviewService.submitReview(req.user.id, {
        couponId: req.body.coupon_id,
        rating: req.body.rating,
        comment: req.body.comment,
      });
      return ok(res, { review }, 201);
    } catch (err) {
      if (err.status) return fail(res, err.status, 'REVIEW_ERROR', err.message);
      console.error('[offers/reviews POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to submit review.');
    }
  }
);

module.exports = router;
