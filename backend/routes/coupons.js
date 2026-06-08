'use strict';

/**
 * /api/coupons — read-only history endpoint.
 *
 * Generation, redemption, and QR/code scanning are gone — offers now
 * apply at the till during an NFC tap (staff sees the offer in the
 * TillPanel, applies the discount, enters the post-discount amount).
 * The user-facing "My Coupons" lists already-generated coupon rows
 * as read-only history; no new coupons get created. The whole table
 * becomes purely archival and can be dropped in a future migration
 * once no live rows remain.
 */

const { Router } = require('express');
const couponService = require('../services/couponService');
const { requireAuth } = require('../middleware/auth');

const router = Router();
router.use(requireAuth);

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

// ---------------------------------------------------------------------------
// GET /api/coupons/mine — read-only history
// ---------------------------------------------------------------------------

router.get('/mine', async (req, res) => {
  try {
    const grouped = await couponService.getUserCoupons(req.user.id);
    return ok(res, {
      total: grouped.active.length + grouped.redeemed.length + grouped.expired.length,
      ...grouped,
    });
  } catch (err) {
    console.error('[coupons/mine]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch coupons.');
  }
});

module.exports = router;
