'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');

const pool = require('../db/pool');
const { requireBusiness } = require('../middleware/auth');
const billing = require('../services/billingService');

const router = Router();

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}
function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}
function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg); return false; }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/billing/subscribe
// ---------------------------------------------------------------------------

router.post(
  '/subscribe',
  requireBusiness,
  [body('tier').isIn(['starter', 'growth', 'pro']).withMessage('tier must be starter, growth, or pro')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rows } = await pool.query(
        `SELECT b.*, u.email AS owner_email FROM businesses b JOIN users u ON u.id = b.owner_id WHERE b.id = $1`,
        [req.business.id]
      );
      const result = await billing.createSubscription(rows[0], req.body.tier);
      return ok(res, result, 201);
    } catch (err) {
      if (err.status) return fail(res, err.status, 'BILLING_ERROR', err.message);
      console.error('[billing/subscribe]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to create subscription.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/billing/subscription
// ---------------------------------------------------------------------------

router.get('/subscription', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM businesses WHERE id = $1', [req.business.id]);
    const sub = await billing.getSubscription(rows[0]);
    return ok(res, { subscription: sub });
  } catch (err) {
    console.error('[billing/subscription]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch subscription.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/billing/upgrade
// ---------------------------------------------------------------------------

router.post(
  '/upgrade',
  requireBusiness,
  [body('tier').isIn(['starter', 'growth', 'pro']).withMessage('tier must be starter, growth, or pro')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rows } = await pool.query(
        `SELECT b.*, u.email AS owner_email FROM businesses b JOIN users u ON u.id = b.owner_id WHERE b.id = $1`,
        [req.business.id]
      );
      const result = await billing.upgradeSubscription(rows[0], req.body.tier);
      return ok(res, result);
    } catch (err) {
      if (err.status) return fail(res, err.status, 'BILLING_ERROR', err.message);
      console.error('[billing/upgrade]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to upgrade subscription.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/billing/cancel
// ---------------------------------------------------------------------------

router.post('/cancel', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM businesses WHERE id = $1', [req.business.id]);
    const result = await billing.cancelSubscription(rows[0]);
    return ok(res, result);
  } catch (err) {
    if (err.status) return fail(res, err.status, 'BILLING_ERROR', err.message);
    console.error('[billing/cancel]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to cancel subscription.');
  }
});

// ---------------------------------------------------------------------------
// GET /api/billing/history
// ---------------------------------------------------------------------------

router.get('/history', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM businesses WHERE id = $1', [req.business.id]);
    const invoices = await billing.getInvoiceHistory(rows[0]);
    return ok(res, { invoices });
  } catch (err) {
    console.error('[billing/history]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch invoice history.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/billing/hardware
// ---------------------------------------------------------------------------

router.post(
  '/hardware',
  requireBusiness,
  [
    body('quantity').optional().isInt({ min: 1, max: 10 }).withMessage('quantity must be 1-10'),
    body('shipping_address').isObject().withMessage('shipping_address is required'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rows } = await pool.query(
        `SELECT b.*, u.email AS owner_email FROM businesses b JOIN users u ON u.id = b.owner_id WHERE b.id = $1`,
        [req.business.id]
      );
      const result = await billing.orderHardware(rows[0], req.body.shipping_address, req.body.quantity || 1);
      return ok(res, result, 201);
    } catch (err) {
      if (err.status) return fail(res, err.status, 'BILLING_ERROR', err.message);
      console.error('[billing/hardware]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to create hardware order.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/billing/portal
// ---------------------------------------------------------------------------

router.post('/portal', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, u.email AS owner_email FROM businesses b JOIN users u ON u.id = b.owner_id WHERE b.id = $1`,
      [req.business.id]
    );
    const result = await billing.createPortalSession(rows[0]);
    return ok(res, result);
  } catch (err) {
    console.error('[billing/portal]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to create portal session.');
  }
});

module.exports = router;
