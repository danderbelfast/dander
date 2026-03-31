'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');

const couponService = require('../services/couponService');
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

module.exports = router;
