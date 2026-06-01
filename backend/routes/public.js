'use strict';

/**
 * public.js — endpoints that intentionally have no auth, used during
 * device / app onboarding where the caller has no credentials yet.
 *
 *   GET /api/public/business/code/:code
 *     4-digit business code -> { business_id, business_name }.
 *     Rate-limited per-IP to keep code space (~9000 values) from being
 *     brute-forced.
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');

const router = Router();

// 30 lookups per 5 minutes per IP is plenty for legitimate setup flows
// and well below what's needed to enumerate the code space.
const codeLookupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max:      30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, code: 'RATE_LIMITED', message: 'Too many code lookups. Please wait a few minutes.' },
});

router.get('/business/code/:code', codeLookupLimiter, async (req, res) => {
  const raw = req.params.code || '';
  if (!/^\d{4}$/.test(raw)) {
    return res.status(400).json({ success: false, code: 'INVALID_CODE', message: 'Code must be 4 digits.' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM businesses WHERE business_code = $1 LIMIT 1',
      [raw]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No business found for that code.' });
    }
    return res.json({
      success: true,
      business_id:   rows[0].id,
      business_name: rows[0].name,
    });
  } catch (err) {
    console.error('[public/business/code]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Lookup failed.' });
  }
});

module.exports = router;
