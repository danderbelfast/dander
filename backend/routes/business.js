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
    body('avg_hourly_staff_cost_gbp').optional().isFloat({ min: 0 }).withMessage('Staff cost must be a positive number.'),
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
    const { rows } = await pool.query(
      `SELECT * FROM inventory_items WHERE business_id = $1 AND is_active = true ORDER BY sort_order, name`,
      [req.business.id]
    );
    return ok(res, { items: rows });
  } catch (err) {
    console.error('[business/inventory GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to list inventory.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/business/inventory
// ---------------------------------------------------------------------------

router.post(
  '/inventory',
  [
    body('name').notEmpty().trim().withMessage('name is required.'),
    body('category').optional().trim(),
    body('is_perishable').optional().isBoolean(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rows } = await pool.query(
        `INSERT INTO inventory_items (business_id, name, category, is_perishable)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.business.id, req.body.name, req.body.category || null, req.body.is_perishable ?? true]
      );
      return ok(res, { item: rows[0] }, 201);
    } catch (err) {
      console.error('[business/inventory POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to add item.');
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

module.exports = router;
