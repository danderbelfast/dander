'use strict';

const { Router } = require('express');
const { query, validationResult } = require('express-validator');

const { requireBusiness } = require('../middleware/auth');
const analytics = require('../services/analyticsService');

const router = Router();

router.use(requireBusiness);

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}
function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

// ---------------------------------------------------------------------------
// GET /api/analytics/dashboard
// ---------------------------------------------------------------------------

router.get(
  '/dashboard',
  [
    query('from').optional().isISO8601().withMessage('from must be YYYY-MM-DD'),
    query('to').optional().isISO8601().withMessage('to must be YYYY-MM-DD'),
    query('zone').optional().isInt({ min: 1 }).withMessage('zone must be a positive integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg);

    try {
      const data = await analytics.getDashboard(req.business.id, {
        from: req.query.from,
        to: req.query.to,
        zone: req.query.zone ? parseInt(req.query.zone, 10) : null,
      });
      return ok(res, { analytics: data });
    } catch (err) {
      console.error('[analytics/dashboard]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to load analytics.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/analytics/realtime
// ---------------------------------------------------------------------------

router.get('/realtime', async (req, res) => {
  try {
    const data = await analytics.getCurrentStatus(req.business.id);
    return ok(res, { realtime: data });
  } catch (err) {
    console.error('[analytics/realtime]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to load realtime data.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/analytics/placeholder — dev only
// ---------------------------------------------------------------------------

router.post('/placeholder', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return fail(res, 403, 'FORBIDDEN', 'Placeholder data generation is disabled in production.');
  }
  try {
    const result = await analytics.generatePlaceholderData(req.business.id);
    return ok(res, result);
  } catch (err) {
    console.error('[analytics/placeholder]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to generate placeholder data.');
  }
});

module.exports = router;
