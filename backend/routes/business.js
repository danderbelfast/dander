'use strict';

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');

const pool           = require('../db/pool');
const offerService   = require('../services/offerService');
const profitService  = require('../services/profitService');
const { requireBusiness } = require('../middleware/auth');
const { upload, processImage } = require('../middleware/upload');

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
         (SELECT COUNT(*) FROM offers o WHERE o.business_id = b.id AND o.is_active = true)
           AS active_offer_count,
         (SELECT COALESCE(SUM(o.current_redemptions), 0)
          FROM offers o WHERE o.business_id = b.id)
           AS total_redemptions
       FROM  businesses b
       JOIN  users u ON u.id = b.owner_id
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
    body('name').optional().trim().notEmpty().withMessage('name must not be empty.'),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('address').optional().trim(),
    body('city').optional().trim(),
    body('lat').optional().isFloat({ min: -90,  max: 90  }).withMessage('Invalid latitude.'),
    body('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.'),
    body('website').optional().isURL().withMessage('website must be a valid URL.'),
    body('phone').optional().trim().isLength({ max: 30 }).withMessage('Invalid phone number.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const allowed = ['name', 'description', 'category', 'address', 'city', 'lat', 'lng', 'website', 'phone'];
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
    body('title').notEmpty().trim().withMessage('title is required.'),
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
    body('title').optional().trim().notEmpty(),
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

module.exports = router;
