'use strict';

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');

const pool           = require('../db/pool');
const offerService   = require('../services/offerService');
const profitService  = require('../services/profitService');
const hoursService   = require('../services/hoursService');
const crypto = require('crypto');
const { generateShareImage } = require('../services/shareService');
const { dispatchEvent }     = require('../services/webhookService');
const { requireBusiness } = require('../middleware/auth');
const { upload, processImage } = require('../middleware/upload');
const { hashKey } = require('../middleware/apiAuth');

const router = Router();

// All business routes require business auth
router.use(requireBusiness);

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function fail(res, status, code, message, details) {
  return res.status(status).json({ success: false, code, message, ...(details && { details }) });
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
// GET /api/business/me
// ---------------------------------------------------------------------------

router.get('/me', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         b.*,
         u.email       AS owner_email,
         u.first_name  AS owner_first_name,
         u.last_name   AS owner_last_name,
         u.phone       AS owner_phone,
         c.name          AS country_name,
         c.currency_code AS currency_code,
         c.currency_symbol AS currency_symbol,
         c.monthly_price AS country_monthly_price,
         (SELECT COUNT(*) FROM offers o WHERE o.business_id = b.id AND o.is_active = true)
           AS active_offer_count,
         (SELECT COALESCE(SUM(o.current_redemptions), 0)
          FROM offers o WHERE o.business_id = b.id)
           AS total_redemptions
       FROM  businesses b
       JOIN  users u ON u.id = b.owner_id
       LEFT JOIN countries c ON c.code = b.country_code
       WHERE b.id = $1`,
      [req.business.id]
    );

    return ok(res, { business: rows[0] });
  } catch (err) {
    console.error('[business/me GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch business profile.');
  }
});

// ---------------------------------------------------------------------------
// PUT /api/business/me   — update profile + optional logo / cover image
// ---------------------------------------------------------------------------

const profileUpload = upload.fields([
  { name: 'logo',  maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]);

router.put(
  '/me',
  profileUpload,
  [
    // checkFalsy: true → treat empty string the same as "not provided".
    // The default optional() only skips undefined, so an empty website
    // field (sent as "" by multipart FormData) would fail isURL("") and
    // reject the entire request — which historically masked the
    // location-save bug: users saving a pin with an empty website got
    // a "website must be a valid URL" 400 they couldn't see.
    body('name').optional({ checkFalsy: true }).trim().notEmpty().withMessage('name must not be empty.'),
    body('description').optional({ checkFalsy: true }).trim(),
    body('category').optional({ checkFalsy: true }).trim(),
    body('address').optional({ checkFalsy: true }).trim(),
    body('city').optional({ checkFalsy: true }).trim(),
    body('lat').optional({ checkFalsy: true }).isFloat({ min: -90,  max: 90  }).withMessage('Invalid latitude.'),
    body('lng').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.'),
    body('website').optional({ checkFalsy: true }).isURL().withMessage('website must be a valid URL.'),
    body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 30 }).withMessage('Invalid phone number.'),
    body('avg_hourly_staff_cost_gbp').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Staff cost must be a positive number.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const allowed = ['name', 'description', 'category', 'address', 'city', 'lat', 'lng', 'website', 'phone', 'avg_hourly_staff_cost_gbp'];
      const updates = {};

      for (const field of allowed) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      // Process uploaded images
      if (req.files?.logo?.[0]) {
        updates.logo_url = await processImage(
          req.files.logo[0].buffer,
          'logo',
          req.files.logo[0].originalname
        );
      }
      if (req.files?.cover?.[0]) {
        updates.cover_image_url = await processImage(
          req.files.cover[0].buffer,
          'cover',
          req.files.cover[0].originalname
        );
      }

      if (Object.keys(updates).length === 0) {
        return fail(res, 400, 'NO_CHANGES', 'No fields provided to update.');
      }

      const setClauses = Object.keys(updates).map((col, i) => `${col} = $${i + 2}`);
      const values     = [req.business.id, ...Object.values(updates)];

      const { rows } = await pool.query(
        `UPDATE businesses
         SET    ${setClauses.join(', ')}, updated_at = NOW()
         WHERE  id = $1
         RETURNING *`,
        values
      );

      return ok(res, { business: rows[0] });
    } catch (err) {
      console.error('[business/me PUT]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to update business profile.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/business/dashboard
// ---------------------------------------------------------------------------

router.get('/dashboard', async (req, res) => {
  try {
    const bizId = req.business.id;

    const [summaryResult, topOfferResult, weeklyResult, couponSummaryResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)                                                         AS total_offers,
           COUNT(*) FILTER (WHERE is_active = true)                        AS active_offers,
           COUNT(*) FILTER (WHERE is_active = false)                       AS inactive_offers,
           COALESCE(SUM(current_redemptions), 0)                           AS total_redemptions,
           COALESCE(SUM(CASE WHEN is_active THEN max_redemptions END), 0)  AS total_capacity
         FROM offers
         WHERE business_id = $1`,
        [bizId]
      ),

      pool.query(
        `SELECT id, title, current_redemptions, is_active, expires_at, image_url
         FROM   offers
         WHERE  business_id = $1
         ORDER  BY current_redemptions DESC
         LIMIT  1`,
        [bizId]
      ),

      pool.query(
        `SELECT COUNT(*) AS redemptions_this_week
         FROM   coupons c
         JOIN   offers  o ON o.id = c.offer_id
         WHERE  o.business_id = $1
           AND  c.status      = 'redeemed'
           AND  c.redeemed_at >= NOW() - INTERVAL '7 days'`,
        [bizId]
      ),

      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE c.status = 'active')   AS total_claimed,
           COUNT(*) FILTER (WHERE c.status = 'redeemed') AS total_redeemed
         FROM   coupons c
         JOIN   offers  o ON o.id = c.offer_id
         WHERE  o.business_id = $1`,
        [bizId]
      ),
    ]);

    const summary       = summaryResult.rows[0];
    const topOffer      = topOfferResult.rows[0] || null;
    const weekly        = weeklyResult.rows[0];
    const couponSummary = couponSummaryResult.rows[0];

    return ok(res, {
      dashboard: {
        active_offers:          parseInt(summary.active_offers, 10),
        inactive_offers:        parseInt(summary.inactive_offers, 10),
        total_offers:           parseInt(summary.total_offers, 10),
        total_redemptions:      parseInt(summary.total_redemptions, 10),
        redemptions_this_week:  parseInt(weekly.redemptions_this_week, 10),
        total_claimed:          parseInt(couponSummary.total_claimed, 10),
        total_redeemed:         parseInt(couponSummary.total_redeemed, 10),
        top_offer:              topOffer,
      },
    });
  } catch (err) {
    console.error('[business/dashboard]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch dashboard.');
  }
});

// ---------------------------------------------------------------------------
// GET /api/business/offers
// ---------------------------------------------------------------------------

router.get('/offers', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*,
              COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active')   AS claimed_count,
              COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'redeemed') AS redeemed_count,
              COUNT(DISTINCT v.id)                                        AS view_count
       FROM   offers o
       LEFT   JOIN coupons     c ON c.offer_id = o.id
       LEFT   JOIN offer_views v ON v.offer_id = o.id
       WHERE  o.business_id = $1
       GROUP  BY o.id
       ORDER  BY o.created_at DESC`,
      [req.business.id]
    );

    return ok(res, { count: rows.length, offers: rows });
  } catch (err) {
    console.error('[business/offers GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch offers.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/business/offers
// ---------------------------------------------------------------------------

const offerUpload = upload.single('image');

router.post(
  '/offers',
  offerUpload,
  [
    body('title').notEmpty().trim().isLength({ max: 80 }).withMessage('title must be 80 characters or fewer.'),
    body('description').optional().isLength({ max: 600 }).withMessage('description is too long.'),
    body('offer_type')
      .isIn(['deal', 'promotion', 'clearance', 'percentage', 'fixed', 'bogo', 'free_item', 'custom'])
      .withMessage('offer_type must be a valid type.'),
    body('original_price').optional().isFloat({ min: 0 }),
    body('offer_price').optional().isFloat({ min: 0 }),
    body('discount_percent').optional().isFloat({ min: 0, max: 100 }),
    body('cost_price').optional().isFloat({ min: 0 }),
    body('selling_price').optional().isFloat({ min: 0 }),
    body('radius_meters').optional().isInt({ min: 100 }),
    body('max_redemptions').optional().isInt({ min: 1 }),
    body('expires_at').optional().isISO8601().withMessage('expires_at must be a valid date.'),
    body('starts_at').optional().isISO8601().withMessage('starts_at must be a valid date.'),
    body('lat').optional().isFloat({ min: -90,  max: 90  }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
    body('icon_color').optional().trim(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const offerData = { ...req.body };

      // Coerce numeric strings sent via multipart form
      for (const f of ['original_price', 'offer_price', 'discount_percent', 'cost_price', 'selling_price', 'lat', 'lng']) {
        if (offerData[f] != null) offerData[f] = parseFloat(offerData[f]);
      }
      for (const f of ['radius_meters', 'max_redemptions']) {
        if (offerData[f] != null) offerData[f] = parseInt(offerData[f], 10);
      }

      if (req.file) {
        offerData.image_url = await processImage(req.file.buffer, 'offer', req.file.originalname);
      }

      const offer = await offerService.createOffer(req.business.id, offerData);
      dispatchEvent(req.business.id, 'offer.created', offer);
      return ok(res, { offer }, 201);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') return fail(res, 400, err.code, err.message, err.details);
      console.error('[business/offers POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to create offer.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/business/offers/:id
// ---------------------------------------------------------------------------

router.get(
  '/offers/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rows } = await pool.query(
        'SELECT * FROM offers WHERE id = $1 AND business_id = $2',
        [req.params.id, req.business.id]
      );
      if (rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Offer not found.');
      return ok(res, { offer: rows[0] });
    } catch (err) {
      console.error('[business/offers/:id GET]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch offer.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/business/offers/:id/duplicate
// ---------------------------------------------------------------------------

router.post(
  '/offers/:id/duplicate',
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rows: src } = await pool.query(
        'SELECT * FROM offers WHERE id = $1 AND business_id = $2',
        [req.params.id, req.business.id]
      );
      if (src.length === 0) return fail(res, 404, 'NOT_FOUND', 'Offer not found.');
      const o = src[0];
      const { rows } = await pool.query(
        `INSERT INTO offers (
           business_id, title, description, terms, category, image_url, offer_type,
           original_price, offer_price, discount_percent, cost_price, selling_price,
           lat, lng, radius_meters, max_redemptions, starts_at, expires_at, is_active
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,false)
         RETURNING *`,
        [
          o.business_id, `${o.title} (copy)`, o.description, o.terms,
          o.category, o.image_url, o.offer_type,
          o.original_price, o.offer_price, o.discount_percent,
          o.cost_price, o.selling_price,
          o.lat, o.lng, o.radius_meters, o.max_redemptions,
          o.starts_at, o.expires_at,
        ]
      );
      return ok(res, { offer: rows[0] }, 201);
    } catch (err) {
      console.error('[business/offers/:id/duplicate POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to duplicate offer.');
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/business/offers/:id
// ---------------------------------------------------------------------------

router.put(
  '/offers/:id',
  offerUpload,
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.'),
    body('title').optional().trim().notEmpty().isLength({ max: 80 }).withMessage('title must be 80 characters or fewer.'),
    body('description').optional().isLength({ max: 600 }).withMessage('description is too long.'),
    body('offer_type').optional().isIn(['deal', 'promotion', 'clearance', 'percentage', 'fixed', 'bogo', 'free_item', 'custom']),
    body('original_price').optional().isFloat({ min: 0 }),
    body('offer_price').optional().isFloat({ min: 0 }),
    body('discount_percent').optional().isFloat({ min: 0, max: 100 }),
    body('cost_price').optional().isFloat({ min: 0 }),
    body('selling_price').optional().isFloat({ min: 0 }),
    body('radius_meters').optional().isInt({ min: 100 }),
    body('max_redemptions').optional().isInt({ min: 1 }),
    body('expires_at').optional().isISO8601(),
    body('starts_at').optional().isISO8601(),
    body('is_active').optional().isBoolean(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const updates = { ...req.body };

      for (const f of ['original_price', 'offer_price', 'discount_percent', 'cost_price', 'selling_price', 'lat', 'lng']) {
        if (updates[f] != null) updates[f] = parseFloat(updates[f]);
      }
      for (const f of ['radius_meters', 'max_redemptions']) {
        if (updates[f] != null) updates[f] = parseInt(updates[f], 10);
      }
      if (updates.is_active !== undefined) {
        updates.is_active = updates.is_active === 'true' || updates.is_active === true;
      }

      if (req.file) {
        updates.image_url = await processImage(req.file.buffer, 'offer', req.file.originalname);
      }

      const offer = await offerService.updateOffer(req.params.id, req.business.id, updates);
      dispatchEvent(req.business.id, 'offer.updated', offer);
      return ok(res, { offer });
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') return fail(res, 400, err.code, err.message, err.details);
      if (err.status === 404) return fail(res, 404, 'NOT_FOUND', err.message);
      console.error('[business/offers PUT]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to update offer.');
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/business/offers/:id  (soft deactivate)
// ---------------------------------------------------------------------------

router.delete(
  '/offers/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const result = await offerService.deactivateOffer(req.params.id, req.business.id);
      dispatchEvent(req.business.id, 'offer.deactivated', result);
      return ok(res, { message: 'Offer deactivated.', offer: result });
    } catch (err) {
      if (err.status === 404) return fail(res, 404, 'NOT_FOUND', err.message);
      console.error('[business/offers DELETE]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to deactivate offer.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/business/offers/:id/stats
// ---------------------------------------------------------------------------

router.get(
  '/offers/:id/stats',
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const stats = await offerService.getOfferStats(req.params.id, req.business.id);
      return ok(res, { stats });
    } catch (err) {
      if (err.status === 404) return fail(res, 404, 'NOT_FOUND', err.message);
      console.error('[business/offers/stats]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch offer stats.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/business/staff
// ---------------------------------------------------------------------------

router.get('/staff', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, is_active, created_at
       FROM   business_staff
       WHERE  business_id = $1
       ORDER  BY created_at ASC`,
      [req.business.id]
    );
    return ok(res, { staff: rows });
  } catch (err) {
    console.error('[business/staff GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch staff.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/business/staff  — add a staff member
// ---------------------------------------------------------------------------

const bcrypt = require('bcrypt');

router.post(
  '/staff',
  [
    body('name').notEmpty().trim().withMessage('name is required.'),
    body('email').isEmail().normalizeEmail().withMessage('A valid email is required.'),
    body('pin').isLength({ min: 4, max: 12 }).isNumeric().withMessage('PIN must be 4–12 digits.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { name, email, pin } = req.body;
      const pinHash = await bcrypt.hash(pin, 10);
      const { rows } = await pool.query(
        `INSERT INTO business_staff (business_id, name, email, pin_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (business_id, email) DO UPDATE
           SET name = EXCLUDED.name, pin_hash = EXCLUDED.pin_hash, is_active = true
         RETURNING id, name, email, is_active, created_at`,
        [req.business.id, name, email, pinHash]
      );
      return ok(res, { staff: rows[0] }, 201);
    } catch (err) {
      console.error('[business/staff POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to add staff member.');
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/business/staff/:id  — deactivate a staff member
// ---------------------------------------------------------------------------

router.delete(
  '/staff/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid staff ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rowCount } = await pool.query(
        `UPDATE business_staff SET is_active = false
         WHERE id = $1 AND business_id = $2`,
        [req.params.id, req.business.id]
      );
      if (rowCount === 0) return fail(res, 404, 'NOT_FOUND', 'Staff member not found.');
      return ok(res, { message: 'Staff member removed.' });
    } catch (err) {
      console.error('[business/staff DELETE]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to remove staff member.');
    }
  }
);

// ---------------------------------------------------------------------------
// Profit & ROI endpoints
// ---------------------------------------------------------------------------

router.get('/dashboard/roi', async (req, res) => {
  try {
    const data = await profitService.getBusinessROI(req.business.id, {
      from: req.query.from, to: req.query.to,
    });
    return ok(res, { roi: data });
  } catch (err) {
    console.error('[business/dashboard/roi]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch ROI data.');
  }
});

router.get('/offers/:id/profit', async (req, res) => {
  try {
    const data = await profitService.getOfferProfitBreakdown(
      parseInt(req.params.id, 10), req.business.id
    );
    return ok(res, { profit: data });
  } catch (err) {
    if (err.status === 404) return fail(res, 404, 'NOT_FOUND', err.message);
    console.error('[business/offers/:id/profit]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch offer profit.');
  }
});

router.get('/reports/profit', async (req, res) => {
  try {
    const { from, to } = req.query;
    const [summary, offers, chart] = await Promise.all([
      profitService.getBusinessROI(req.business.id, { from, to }),
      profitService.getOfferProfitTable(req.business.id, { from, to }),
      profitService.getDailyProfitChart(req.business.id, { from, to }),
    ]);
    return ok(res, { summary, offers, chart });
  } catch (err) {
    console.error('[business/reports/profit]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to build profit report.');
  }
});

router.get('/reports/profit/csv', async (req, res) => {
  try {
    const csv = await profitService.generateBusinessProfitCSV(req.business.id, {
      from: req.query.from, to: req.query.to,
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="dander-profit-report.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('[business/reports/profit/csv]', err);
    return fail(res, 500, 'SERVER_ERROR', 'CSV export failed.');
  }
});

// ---------------------------------------------------------------------------
// Opening Hours endpoints
// ---------------------------------------------------------------------------

router.get('/hours', async (req, res) => {
  try {
    const [hours, special, status] = await Promise.all([
      hoursService.getBusinessHours(req.business.id),
      hoursService.getSpecialHours(req.business.id),
      hoursService.isBusinessOpen(req.business.id),
    ]);
    return ok(res, { hours, special, status });
  } catch (err) {
    console.error('[business/hours GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch hours.');
  }
});

router.put('/hours', async (req, res) => {
  try {
    const { hours } = req.body;
    if (!Array.isArray(hours)) return fail(res, 400, 'VALIDATION_ERROR', 'hours must be an array.');
    await hoursService.saveBusinessHours(req.business.id, hours);
    return ok(res, { message: 'Hours saved.' });
  } catch (err) {
    console.error('[business/hours PUT]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to save hours.');
  }
});

router.post('/hours/special', async (req, res) => {
  try {
    const row = await hoursService.addSpecialHours(req.business.id, req.body);
    return ok(res, { special: row }, 201);
  } catch (err) {
    console.error('[business/hours/special POST]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to add special hours.');
  }
});

router.delete(
  '/hours/special/:id',
  [param('id').isInt({ min: 1 })],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const deleted = await hoursService.deleteSpecialHours(req.business.id, req.params.id);
      if (!deleted) return fail(res, 404, 'NOT_FOUND', 'Special hours not found.');
      return ok(res, { message: 'Deleted.' });
    } catch (err) {
      console.error('[business/hours/special DELETE]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to delete special hours.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/business/offers/:id/share-image
// ---------------------------------------------------------------------------

router.get(
  '/offers/:id/share-image',
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rows } = await pool.query(
        `SELECT o.*, b.name AS business_name, b.logo_url AS business_logo_url
         FROM offers o JOIN businesses b ON b.id = o.business_id
         WHERE o.id = $1 AND o.business_id = $2`,
        [req.params.id, req.business.id]
      );
      if (rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Offer not found.');

      const pngBuffer = await generateShareImage(rows[0]);
      res.set({
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="dander-deal-${req.params.id}.png"`,
        'Cache-Control': 'no-cache',
      });
      return res.send(pngBuffer);
    } catch (err) {
      console.error('[business/offers/:id/share-image]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to generate share image.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/business/story
// ---------------------------------------------------------------------------

router.get('/story', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM business_stories
       WHERE business_id = $1
         AND (created_at AT TIME ZONE 'Europe/London')::date = (NOW() AT TIME ZONE 'Europe/London')::date
       ORDER BY created_at DESC LIMIT 1`,
      [req.business.id]
    );
    return ok(res, { story: rows[0] || null });
  } catch (err) {
    console.error('[business/story GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch story.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/business/story
// ---------------------------------------------------------------------------

const storyUpload = upload.single('image');

router.post(
  '/story',
  storyUpload,
  [body('caption').optional().isLength({ max: 280 }).withMessage('Caption must be 280 characters or fewer.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    if (!req.file) return fail(res, 400, 'VALIDATION_ERROR', 'An image is required.');

    try {
      const imageUrl = await processImage(req.file.buffer, 'story', req.file.originalname);
      const caption = req.body.caption || null;

      const { rows } = await pool.query(
        `INSERT INTO business_stories (business_id, image_url, caption)
         VALUES ($1, $2, $3) RETURNING *`,
        [req.business.id, imageUrl, caption]
      );
      dispatchEvent(req.business.id, 'story.posted', rows[0]);
      return ok(res, { story: rows[0] }, 201);
    } catch (err) {
      console.error('[business/story POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to post story.');
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/business/story
// ---------------------------------------------------------------------------

router.delete('/story', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM business_stories
       WHERE business_id = $1
         AND (created_at AT TIME ZONE 'Europe/London')::date = (NOW() AT TIME ZONE 'Europe/London')::date`,
      [req.business.id]
    );
    return ok(res, { message: 'Story removed.' });
  } catch (err) {
    console.error('[business/story DELETE]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to delete story.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/business/api-keys — generate a new API key
// ---------------------------------------------------------------------------

router.post(
  '/api-keys',
  [
    body('label').optional().trim().isLength({ max: 100 }),
    body('scopes').isArray({ min: 1 }).withMessage('scopes must be a non-empty array.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const keyPrefix = process.env.API_KEY_PREFIX || 'dnd_live_';
      const rawKey = `${keyPrefix}${crypto.randomBytes(24).toString('hex')}`;
      const keyHash = hashKey(rawKey);
      const prefix = rawKey.slice(0, 12);
      const label = req.body.label || 'default';
      const scopes = req.body.scopes;

      const { rows } = await pool.query(
        `INSERT INTO api_keys (business_id, key_hash, key_prefix, label, scopes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, key_prefix, label, scopes, is_active, created_at`,
        [req.business.id, keyHash, prefix, label, scopes]
      );

      return ok(res, {
        api_key: {
          ...rows[0],
          key: rawKey,
        },
        warning: 'Store this key securely — it will not be shown again.',
      }, 201);
    } catch (err) {
      console.error('[business/api-keys POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to create API key.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/business/api-keys — list all API keys for this business
// ---------------------------------------------------------------------------

router.get('/api-keys', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, key_prefix, label, scopes, is_active, last_used_at, created_at
       FROM api_keys
       WHERE business_id = $1
       ORDER BY created_at DESC`,
      [req.business.id]
    );
    return ok(res, { api_keys: rows });
  } catch (err) {
    console.error('[business/api-keys GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to list API keys.');
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/business/api-keys/:id — revoke an API key
// ---------------------------------------------------------------------------

router.delete(
  '/api-keys/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid API key ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const { rowCount } = await pool.query(
        `UPDATE api_keys SET is_active = false
         WHERE id = $1 AND business_id = $2`,
        [req.params.id, req.business.id]
      );
      if (rowCount === 0) return fail(res, 404, 'NOT_FOUND', 'API key not found.');
      return ok(res, { message: 'API key revoked.' });
    } catch (err) {
      console.error('[business/api-keys DELETE]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to revoke API key.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/business/inventory
// ---------------------------------------------------------------------------

router.get('/inventory', async (req, res) => {
  try {
    // 2026-06-10: sort_order was removed from inventory_items in prod out of band;
    // endpoint patched to match (ORDER BY name only).
    const { rows } = await pool.query(
      `SELECT * FROM inventory_items WHERE business_id = $1 AND is_active = true ORDER BY name`,
      [req.business.id]
    );
    const totalCount = rows.length;
    const inStock = rows.filter(r => r.stock_level > (r.low_stock_threshold || 0)).length;
    const lowStock = rows.filter(r => r.stock_level > 0 && r.stock_level <= (r.low_stock_threshold || 5)).length;
    const outOfStock = rows.filter(r => (r.stock_level || 0) === 0).length;
    const categories = [...new Set(rows.map(r => r.category).filter(Boolean))].length;

    return ok(res, {
      items: rows,
      stats: { total: totalCount, in_stock: inStock, low_stock: lowStock, out_of_stock: outOfStock, categories },
    });
  } catch (err) {
    console.error('[business/inventory GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to list inventory.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/business/inventory
// ---------------------------------------------------------------------------

const inventoryUpload = upload.single('image');

router.post(
  '/inventory',
  inventoryUpload,
  [
    body('name').notEmpty().trim().withMessage('name is required.'),
    body('category').optional().trim(),
    body('is_perishable').optional(),
    body('sku').optional().trim(),
    body('barcode').optional().trim(),
    body('price').optional().isFloat({ min: 0 }),
    body('cost_price').optional().isFloat({ min: 0 }),
    body('stock_level').optional().isInt({ min: 0 }),
    body('low_stock_threshold').optional().isInt({ min: 0 }),
    body('description').optional().trim(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      let imageUrl = null;
      if (req.file) {
        imageUrl = await processImage(req.file.buffer, 'offer', req.file.originalname);
      }

      // 2026-06-10: category was removed from inventory_items in prod out of band;
      // endpoint patched to drop it from the INSERT column list and value tuple.
      const { rows } = await pool.query(
        `INSERT INTO inventory_items
           (business_id, name, is_perishable, sku, barcode, price, cost_price, stock_level, low_stock_threshold, image_url, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          req.business.id, req.body.name,
          req.body.is_perishable === 'true' || req.body.is_perishable === true,
          req.body.sku || null, req.body.barcode || null,
          req.body.price || null, req.body.cost_price || null,
          parseInt(req.body.stock_level, 10) || 0,
          parseInt(req.body.low_stock_threshold, 10) || 5,
          imageUrl, req.body.description || null,
        ]
      );
      return ok(res, { item: rows[0] }, 201);
    } catch (err) {
      if (err.constraint?.includes('sku')) return fail(res, 409, 'DUPLICATE_SKU', 'An item with this SKU already exists.');
      console.error('[business/inventory POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to add item.');
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/business/inventory/:id
// ---------------------------------------------------------------------------

router.put(
  '/inventory/:id',
  inventoryUpload,
  [param('id').isInt({ min: 1 }).withMessage('Invalid item ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      // 2026-06-10: category + sort_order were removed from inventory_items in prod
      // out of band; endpoint patched to drop them from the allowed-update list.
      const allowed = ['name', 'is_perishable', 'sku', 'barcode', 'price', 'cost_price', 'stock_level', 'low_stock_threshold', 'description'];
      const updates = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          if (key === 'is_perishable') updates[key] = req.body[key] === 'true' || req.body[key] === true;
          else if (['price', 'cost_price'].includes(key)) updates[key] = parseFloat(req.body[key]);
          else if (['stock_level', 'low_stock_threshold'].includes(key)) updates[key] = parseInt(req.body[key], 10);
          else updates[key] = req.body[key];
        }
      }
      if (req.file) {
        updates.image_url = await processImage(req.file.buffer, 'offer', req.file.originalname);
      }
      if (Object.keys(updates).length === 0) return fail(res, 400, 'NO_CHANGES', 'No fields to update.');

      const setClauses = Object.keys(updates).map((col, i) => `${col} = $${i + 2}`);
      const values = [req.business.id, ...Object.values(updates), req.params.id];

      const { rows } = await pool.query(
        `UPDATE inventory_items SET ${setClauses.join(', ')}
         WHERE id = $${values.length} AND business_id = $1 AND is_active = true RETURNING *`,
        values
      );
      if (rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Item not found.');
      return ok(res, { item: rows[0] });
    } catch (err) {
      if (err.constraint?.includes('sku')) return fail(res, 409, 'DUPLICATE_SKU', 'An item with this SKU already exists.');
      console.error('[business/inventory PUT]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to update item.');
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/business/inventory/:id
// ---------------------------------------------------------------------------

router.delete(
  '/inventory/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid item ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rowCount } = await pool.query(
        `UPDATE inventory_items SET is_active = false WHERE id = $1 AND business_id = $2`,
        [req.params.id, req.business.id]
      );
      if (rowCount === 0) return fail(res, 404, 'NOT_FOUND', 'Item not found.');
      return ok(res, { message: 'Item removed.' });
    } catch (err) {
      console.error('[business/inventory DELETE]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to remove item.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/business/rota
// ---------------------------------------------------------------------------

router.get('/rota', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT rota_data FROM business_rota WHERE business_id = $1',
      [req.business.id]
    );
    return ok(res, { rota: rows[0]?.rota_data || {} });
  } catch (err) {
    console.error('[business/rota GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch rota.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/business/rota
// ---------------------------------------------------------------------------

router.post('/rota', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO business_rota (business_id, rota_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (business_id)
       DO UPDATE SET rota_data = $2, updated_at = NOW()
       RETURNING rota_data`,
      [req.business.id, JSON.stringify(req.body.rota || {})]
    );
    return ok(res, { rota: rows[0].rota_data });
  } catch (err) {
    console.error('[business/rota POST]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to save rota.');
  }
});

// ---------------------------------------------------------------------------
// GET /api/business/notification-preferences
// ---------------------------------------------------------------------------

router.get('/notification-preferences', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT prefs FROM business_notification_preferences WHERE business_id = $1',
      [req.business.id]
    );
    return ok(res, { prefs: rows[0]?.prefs || { coupon_redeemed: true, daily_summary: true, footfall_alert: true } });
  } catch (err) {
    console.error('[business/notification-preferences GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch preferences.');
  }
});

// ---------------------------------------------------------------------------
// PUT /api/business/notification-preferences
// ---------------------------------------------------------------------------

router.put('/notification-preferences', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO business_notification_preferences (business_id, prefs, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (business_id)
       DO UPDATE SET prefs = $2, updated_at = NOW()
       RETURNING prefs`,
      [req.business.id, JSON.stringify(req.body.prefs || {})]
    );
    return ok(res, { prefs: rows[0].prefs });
  } catch (err) {
    console.error('[business/notification-preferences PUT]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to save preferences.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/business/fcm-token — register FCM push token
// ---------------------------------------------------------------------------

router.post(
  '/fcm-token',
  [body('token').notEmpty().withMessage('token is required.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      await pool.query(
        `UPDATE businesses SET business_fcm_token = $1, updated_at = NOW() WHERE id = $2`,
        [req.body.token, req.business.id]
      );
      return ok(res, { updated: true });
    } catch (err) {
      console.error('[business/fcm-token POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to save FCM token.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/business/reports/weekly — weekly performance report
// ---------------------------------------------------------------------------

router.get('/reports/weekly', async (req, res) => {
  try {
    const bizId = req.business.id;
    const weekEnd = req.query.week_end || new Date().toISOString().slice(0, 10);

    const [
      summaryResult,
      dailyResult,
      footfallResult,
      weatherResult,
      offersResult,
      couponsResult,
      baselineResult,
    ] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total_offers,
           COUNT(*) FILTER (WHERE is_active)::int AS active_offers,
           COALESCE(SUM(current_redemptions), 0)::int AS total_redemptions,
           COALESCE(SUM(view_count), 0)::int AS total_views,
           COALESCE(SUM(share_count), 0)::int AS total_shares
         FROM offers
         WHERE business_id = $1
           AND created_at BETWEEN ($2::date - INTERVAL '6 days') AND ($2::date + INTERVAL '1 day')`,
        [bizId, weekEnd]
      ),
      pool.query(
        `SELECT DATE(created_at) AS day,
                COUNT(*)::int AS offers_created,
                COALESCE(SUM(current_redemptions), 0)::int AS redemptions
         FROM offers
         WHERE business_id = $1
           AND created_at BETWEEN ($2::date - INTERVAL '6 days') AND ($2::date + INTERVAL '1 day')
         GROUP BY day ORDER BY day`,
        [bizId, weekEnd]
      ),
      pool.query(
        `SELECT DATE(recorded_at) AS day,
                ROUND(AVG(reading_value), 1) AS avg_footfall,
                MAX(reading_value)::numeric(10,1) AS peak_footfall,
                COUNT(*)::int AS readings
         FROM sensor_readings
         WHERE business_id = $1 AND device_type = 'people_counter'
           AND recorded_at BETWEEN ($2::date - INTERVAL '6 days') AND ($2::date + INTERVAL '1 day')
         GROUP BY day ORDER BY day`,
        [bizId, weekEnd]
      ),
      pool.query(
        `SELECT DATE(recorded_at) AS day,
                ROUND(AVG(temperature_c), 1) AS avg_temp,
                ROUND(SUM(rainfall_mm), 1) AS total_rain,
                MODE() WITHIN GROUP (ORDER BY condition) AS dominant_condition
         FROM weather_readings
         WHERE business_id = $1
           AND recorded_at BETWEEN ($2::date - INTERVAL '6 days') AND ($2::date + INTERVAL '1 day')
         GROUP BY day ORDER BY day`,
        [bizId, weekEnd]
      ),
      pool.query(
        `SELECT id, title, offer_type, discount_percent,
                current_redemptions, view_count, share_count, created_at
         FROM offers
         WHERE business_id = $1
           AND created_at BETWEEN ($2::date - INTERVAL '6 days') AND ($2::date + INTERVAL '1 day')
         ORDER BY current_redemptions DESC`,
        [bizId, weekEnd]
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'redeemed')::int AS redeemed,
                COUNT(*) FILTER (WHERE status = 'active')::int AS outstanding,
                COUNT(*)::int AS total
         FROM coupons c JOIN offers o ON o.id = c.offer_id
         WHERE o.business_id = $1
           AND c.created_at BETWEEN ($2::date - INTERVAL '6 days') AND ($2::date + INTERVAL '1 day')`,
        [bizId, weekEnd]
      ),
      pool.query(
        `SELECT day_of_week, hour_slot, avg_footfall, sample_count
         FROM footfall_baselines WHERE business_id = $1`,
        [bizId]
      ),
    ]);

    const summary = summaryResult.rows[0];
    const coupons = couponsResult.rows[0];

    const baselineMap = {};
    for (const b of baselineResult.rows) {
      baselineMap[`${b.day_of_week}`] = baselineMap[`${b.day_of_week}`] || [];
      baselineMap[`${b.day_of_week}`].push(parseFloat(b.avg_footfall));
    }

    const probable_causes = [];
    for (const wr of weatherResult.rows) {
      const ff = footfallResult.rows.find(f => f.day === wr.day);
      if (wr.total_rain > 2 && ff && parseFloat(ff.avg_footfall) > 0) {
        probable_causes.push({
          day: wr.day,
          description: `Rain (${wr.total_rain}mm) may have affected footfall`,
          type: 'weather',
        });
      }
    }

    for (const offer of offersResult.rows) {
      if (offer.current_redemptions > 3) {
        probable_causes.push({
          day: new Date(offer.created_at).toISOString().slice(0, 10),
          description: `"${offer.title}" drove ${offer.current_redemptions} redemptions`,
          type: 'offer_impact',
        });
      }
    }

    return ok(res, {
      report: {
        week_ending: weekEnd,
        summary: {
          total_offers: summary.total_offers,
          active_offers: summary.active_offers,
          total_views: summary.total_views,
          total_redemptions: summary.total_redemptions,
          total_shares: summary.total_shares,
          coupons_redeemed: coupons.redeemed,
          coupons_outstanding: coupons.outstanding,
        },
        daily_breakdown: dailyResult.rows,
        footfall_daily: footfallResult.rows,
        weather_daily: weatherResult.rows,
        offers: offersResult.rows,
        probable_causes,
      },
    });
  } catch (err) {
    console.error('[business/reports/weekly]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to generate weekly report.');
  }
});

// ---------------------------------------------------------------------------
// Smart Specials — Claude Vision-driven offer copy
// ---------------------------------------------------------------------------
//
// Three endpoints:
//   GET    /api/business/smart-specials/settings  — defaults for the wizard
//   PUT    /api/business/smart-specials/settings  — save defaults (+ mark setup_complete)
//   POST   /api/business/smart-specials/assess    — multipart photo + offer type → suggestion
//   POST   /api/business/smart-specials/post      — approve + create the live offer
//
// The owner ALWAYS approves before anything goes live. Claude only writes copy.

const smartSpecialsService = require('../services/smartSpecialsService');

// ── Settings ──────────────────────────────────────────────────────────────
router.get('/smart-specials/settings', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ss_setup_complete, ss_default_offer_type, ss_default_discount_pct,
              ss_default_duration_hours, ss_active_hours_start, ss_active_hours_end
       FROM businesses WHERE id = $1`,
      [req.business.id]
    );
    return ok(res, { settings: rows[0] || null });
  } catch (err) {
    console.error('[smart-specials/settings GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to load settings.');
  }
});

router.put(
  '/smart-specials/settings',
  [
    body('ss_default_offer_type').optional().isIn(['discount', 'freebie', 'urgency']),
    body('ss_default_discount_pct').optional().isInt({ min: 1, max: 100 }),
    body('ss_default_duration_hours').optional().isInt({ min: 1, max: 168 }),
    body('ss_active_hours_start').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('ss_active_hours_end').optional().matches(/^\d{2}:\d{2}(:\d{2})?$/),
    body('mark_setup_complete').optional().isBoolean(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const fields = [];
      const values = [];
      let i = 1;
      for (const key of [
        'ss_default_offer_type', 'ss_default_discount_pct', 'ss_default_duration_hours',
        'ss_active_hours_start', 'ss_active_hours_end',
      ]) {
        if (req.body[key] !== undefined) {
          fields.push(`${key} = $${i++}`);
          values.push(req.body[key]);
        }
      }
      if (req.body.mark_setup_complete) {
        fields.push(`ss_setup_complete = true`);
      }
      if (fields.length === 0) return ok(res, { updated: false });

      values.push(req.business.id);
      const { rows } = await pool.query(
        `UPDATE businesses SET ${fields.join(', ')}, updated_at = NOW()
         WHERE id = $${i}
         RETURNING ss_setup_complete, ss_default_offer_type, ss_default_discount_pct,
                   ss_default_duration_hours, ss_active_hours_start, ss_active_hours_end`,
        values
      );
      return ok(res, { settings: rows[0] });
    } catch (err) {
      console.error('[smart-specials/settings PUT]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to save settings.');
    }
  }
);

// ── Assess ─────────────────────────────────────────────────────────────────
const ssPhotoUpload = upload.single('photo');

router.post(
  '/smart-specials/assess',
  ssPhotoUpload,
  [
    body('offer_type').isIn(['discount', 'freebie', 'urgency']),
    body('offer_value').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 100 }),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    if (!req.file) return fail(res, 400, 'VALIDATION_ERROR', 'photo is required');

    try {
      const photoUrl = await processImage(req.file.buffer, 'offer', req.file.originalname);

      const assessment = await smartSpecialsService.assessPhoto({
        businessId: req.business.id,
        photoUrl,
        offerType:  req.body.offer_type,
        offerValue: req.body.offer_value || null,
      });

      return ok(res, { assessment });
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        return fail(res, err.status || 400, err.code, err.message);
      }
      console.error('[smart-specials/assess]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to assess photo.');
    }
  }
);

// ── Post (approve + create live offer) ────────────────────────────────────
router.post(
  '/smart-specials/post',
  [
    body('assessment_id').isInt({ min: 1 }),
    body('title').notEmpty().trim().isLength({ max: 80 }),
    body('description').optional().trim().isLength({ max: 600 }),
    body('offer_type').isIn(['discount', 'freebie', 'urgency']),
    body('offer_value').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 100 }),
    body('duration_hours').isInt({ min: 1, max: 168 }),
    body('owner_edited').optional().isBoolean(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      // Verify the assessment belongs to this business.
      const { rows: aRows } = await pool.query(
        `SELECT id, photo_url FROM photo_assessments
         WHERE id = $1 AND business_id = $2`,
        [req.body.assessment_id, req.business.id]
      );
      if (aRows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Assessment not found.');
      const assessment = aRows[0];

      // Map Smart Specials shape onto the existing offers table.
      const offerType = req.body.offer_type;
      const offerValue = req.body.offer_value || null;
      const expiresAt = new Date(Date.now() + req.body.duration_hours * 3_600_000).toISOString();

      const payload = {
        title:       req.body.title.trim(),
        description: (req.body.description || '').trim(),
        image_url:   assessment.photo_url || undefined,
        expires_at:  expiresAt,
      };

      if (offerType === 'discount') {
        const pctMatch = offerValue && /^\s*(\d{1,3})\s*%\s*$/.exec(offerValue);
        if (pctMatch) {
          payload.offer_type = 'percentage';
          payload.discount_percent = Math.min(100, parseInt(pctMatch[1], 10));
        } else {
          payload.offer_type = 'custom';
          payload.discount_label = offerValue || null;
        }
      } else if (offerType === 'freebie') {
        payload.offer_type = 'free_item';
        payload.discount_label = offerValue || null;
      } else {
        payload.offer_type = 'custom';
      }

      const offer = await offerService.createOffer(req.business.id, payload);
      dispatchEvent(req.business.id, 'offer.created', offer);

      await smartSpecialsService.markApproved({
        assessmentId: req.body.assessment_id,
        businessId:   req.business.id,
        userId:       req.user.id,
        ownerEdited:  !!req.body.owner_edited,
      });

      return ok(res, { offer }, 201);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        return fail(res, err.status || 400, err.code, err.message);
      }
      console.error('[smart-specials/post]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to post offer.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/business/opening-hours
//
// Update the business's weekly schedule AND push it to every Dander Node
// paired to this business (via the existing node_commands channel). The
// schedule arrives on each Node on its next 60s upload through the
// commands piggy-back in /api/webhooks/phone-counter.
//
// Body shape:
//   { opening_hours: {
//       "monday":    {"open":"09:00","close":"17:30","closed":false},
//       ...
//       "sunday":    {"open":"09:00","close":"17:30","closed":true}
//     } }
// All 7 day keys required.
// ---------------------------------------------------------------------------

const DAY_KEYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

function validateOpeningHours(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const day of DAY_KEYS) {
    const v = input[day];
    if (!v || typeof v !== 'object') return null;
    const open  = typeof v.open  === 'string' && /^\d{2}:\d{2}$/.test(v.open)  ? v.open  : null;
    const close = typeof v.close === 'string' && /^\d{2}:\d{2}$/.test(v.close) ? v.close : null;
    if (!open || !close) return null;
    out[day] = { open, close, closed: v.closed === true };
  }
  return out;
}

router.post('/opening-hours', async (req, res) => {
  const validated = validateOpeningHours(req.body && req.body.opening_hours);
  if (!validated) {
    return fail(res, 400, 'VALIDATION_ERROR', 'opening_hours must include all 7 days with HH:MM open/close.');
  }
  try {
    await pool.query(
      'UPDATE businesses SET opening_hours = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(validated), req.business.id]
    );

    // Push to every Node that has ever posted a reading for this business.
    // Use the same UPSERT pattern as the regular remote-command endpoint so
    // a partial command (just opening_hours) leaves the other fields intact.
    const { rows: devs } = await pool.query(
      `SELECT DISTINCT device_id FROM phone_counter_readings
        WHERE business_id = $1 AND device_id IS NOT NULL`,
      [req.business.id]
    );
    for (const { device_id } of devs) {
      await pool.query(
        `INSERT INTO node_commands (device_id, business_id, counting_enabled, opening_hours, updated_at)
         VALUES ($1, $2, TRUE, $3::jsonb, NOW())
         ON CONFLICT (device_id) DO UPDATE
           SET business_id   = EXCLUDED.business_id,
               opening_hours = EXCLUDED.opening_hours,
               updated_at    = NOW()`,
        [device_id, req.business.id, JSON.stringify(validated)]
      );
    }

    return ok(res, { opening_hours: validated, nodes_updated: devs.length });
  } catch (err) {
    console.error('[business/opening-hours]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to save opening hours.');
  }
});

module.exports = router;
