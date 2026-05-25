'use strict';

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');

const couponService = require('../services/couponService');
const pool = require('../db/pool');
const bcrypt = require('bcrypt');
const { dispatchEvent } = require('../services/webhookService');
const loyaltyService = require('../services/loyaltyService');
const { requireAuth, requireBusiness } = require('../middleware/auth');

const router = Router();

// All coupon routes require a valid user JWT
router.use(requireAuth);

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
// POST /api/coupons/generate
// body: { offerId, lat?, lng? }
// ---------------------------------------------------------------------------

router.post(
  '/generate',
  [
    body('offerId').isInt({ min: 1 }).withMessage('offerId is required.'),
    body('lat')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('lat must be a valid latitude.'),
    body('lng')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('lng must be a valid longitude.'),
    body('lat').custom((lat, { req }) => {
      if ((lat == null) !== (req.body.lng == null)) {
        throw new Error('lat and lng must both be provided or both omitted.');
      }
      return true;
    }),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const { offerId, lat, lng } = req.body;
      const options = {};
      if (lat != null) {
        options.userLat = parseFloat(lat);
        options.userLng = parseFloat(lng);
      }

      const result = await couponService.generateCoupon(req.user.id, offerId, options);
      return ok(res, result, 201);
    } catch (err) {
      const knownCodes = new Set([
        'OUT_OF_RADIUS', 'OFFER_INACTIVE', 'OFFER_EXPIRED',
        'REDEMPTION_CAP_REACHED', 'COUPON_EXISTS',
      ]);
      if (knownCodes.has(err.code)) {
        const details = err.code === 'OUT_OF_RADIUS' && err.offerRadius != null
          ? { offerRadius: err.offerRadius }
          : undefined;
        return fail(res, err.status || 409, err.code, err.message, details);
      }
      if (err.status === 404) return fail(res, 404, 'NOT_FOUND', err.message);
      console.error('[coupons/generate]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to generate coupon.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/coupons/mine
// ---------------------------------------------------------------------------

router.get('/mine', async (req, res) => {
  try {
    const grouped = await couponService.getUserCoupons(req.user.id);
    return ok(res, {
      total:  grouped.active.length + grouped.redeemed.length + grouped.expired.length,
      ...grouped,
    });
  } catch (err) {
    console.error('[coupons/mine]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch coupons.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/coupons/redeem
// body: { code, staffPin }
// Business staff endpoint: caller must be authenticated as a business owner.
// The staffPin identifies which staff member is performing the redemption.
// ---------------------------------------------------------------------------

router.post(
  '/redeem',
  requireBusiness,
  [
    body('code')
      .notEmpty()
      .matches(/^DAN-[A-Z0-9]{4}$/i)
      .withMessage('A valid coupon code is required (format: DAN-XXXX).'),
    body('staffPin')
      .notEmpty()
      .isLength({ min: 4, max: 12 })
      .withMessage('Staff PIN is required.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const result = await couponService.redeemCoupon(
        req.body.code,
        req.body.staffPin,
        req.business.id
      );
      dispatchEvent(req.business.id, 'coupon.redeemed', result);

      // Award loyalty points
      if (result.user?.id && result.offer) {
        const savedAmount = result.offer.offer_price
          ? parseFloat(result.offer.offer_price)
          : result.offer.discount_percent
          ? parseFloat(result.offer.discount_percent) / 10
          : 1;
        const points = Math.max(1, Math.round(savedAmount));
        loyaltyService.awardPoints(result.user.id, {
          points,
          savedGbp: savedAmount,
          description: `Redeemed: ${result.offer.title}`,
          referenceType: 'coupon',
          referenceId: result.couponId,
        }).catch(() => {});
      }

      return ok(res, result);
    } catch (err) {
      const knownCodes = new Set([
        'COUPON_NOT_FOUND', 'WRONG_BUSINESS', 'ALREADY_REDEEMED',
        'COUPON_EXPIRED', 'INVALID_PIN', 'NO_STAFF', 'COUPON_NOT_ACTIVE',
      ]);
      if (knownCodes.has(err.code)) return fail(res, err.status || 400, err.code, err.message);
      console.error('[coupons/redeem]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Redemption failed.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/coupons/:id/qr — get QR token + coupon details (for shopper)
// ---------------------------------------------------------------------------

router.get(
  '/:id/qr',
  requireAuth,
  [param('id').isInt({ min: 1 })],
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT c.id, c.code, c.qr_token, c.status, c.created_at,
                o.title AS offer_title, o.business_id,
                b.name AS business_name
         FROM coupons c
         JOIN offers o ON o.id = c.offer_id
         JOIN businesses b ON b.id = o.business_id
         WHERE c.id = $1 AND c.user_id = $2`,
        [req.params.id, req.user.id]
      );
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'Coupon not found.' });
      return res.json({ success: true, coupon: rows[0] });
    } catch (err) {
      console.error('[coupons/:id/qr]', err);
      return res.status(500).json({ success: false, message: 'Failed to load coupon.' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/coupons/redeem-qr — scan-based redemption (for business staff)
// ---------------------------------------------------------------------------

router.post(
  '/redeem-qr',
  requireBusiness,
  [body('qr_token').notEmpty().withMessage('qr_token is required.')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: errors.array()[0].msg });

    try {
      const { rows } = await pool.query(
        `SELECT c.id, c.code, c.status, c.user_id, c.offer_id, c.qr_token,
                o.business_id, o.title AS offer_title, o.offer_type, o.offer_price,
                o.discount_percent, o.expires_at,
                u.first_name, u.last_name, u.email
         FROM coupons c
         JOIN offers o ON o.id = c.offer_id
         JOIN users u ON u.id = c.user_id
         WHERE c.qr_token = $1`,
        [req.body.qr_token]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, code: 'INVALID_QR', message: 'Invalid QR code. No coupon found.' });
      }

      const row = rows[0];

      if (row.business_id !== req.business.id) {
        return res.status(403).json({ success: false, code: 'WRONG_BUSINESS', message: 'This coupon belongs to a different business.' });
      }

      if (row.status === 'redeemed') {
        return res.status(409).json({ success: false, code: 'ALREADY_REDEEMED', message: 'This coupon has already been redeemed.' });
      }

      if (row.status !== 'active') {
        return res.status(400).json({ success: false, code: 'COUPON_NOT_ACTIVE', message: 'This coupon is no longer active.' });
      }

      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        return res.status(400).json({ success: false, code: 'COUPON_EXPIRED', message: 'This coupon has expired.' });
      }

      await pool.query(
        `UPDATE coupons SET status = 'redeemed', redeemed_at = NOW() WHERE id = $1`,
        [row.id]
      );

      const result = {
        success: true,
        redeemedAt: new Date().toISOString(),
        couponId: row.id,
        user: { id: row.user_id, firstName: row.first_name, lastName: row.last_name, email: row.email },
        offer: { id: row.offer_id, title: row.offer_title, offer_type: row.offer_type, offer_price: row.offer_price },
      };

      dispatchEvent(req.business.id, 'coupon.redeemed', result);

      if (row.user_id && row.offer_price) {
        const saved = parseFloat(row.offer_price);
        loyaltyService.awardPoints(row.user_id, {
          points: Math.max(1, Math.round(saved)),
          savedGbp: saved,
          description: `Redeemed: ${row.offer_title}`,
          referenceType: 'coupon',
          referenceId: row.id,
        }).catch(() => {});
      }

      return res.json(result);
    } catch (err) {
      console.error('[coupons/redeem-qr]', err);
      return res.status(500).json({ success: false, message: 'Redemption failed.' });
    }
  }
);

module.exports = router;
