// ============================================================
//  /api/countries — public list of active markets.
//
//  Used by both registration forms (business dashboard, user app)
//  to populate the country picker. No auth: this is reference data
//  consumed at signup time before a JWT exists.
// ============================================================

const { Router } = require('express');
const pool = require('../db/pool');

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT code, name, currency_code, currency_symbol, monthly_price
         FROM countries
        WHERE is_active = TRUE
        ORDER BY name`
    );
    return res.status(200).json({
      success: true,
      countries: rows.map((r) => ({
        code:            r.code,
        name:            r.name,
        currency_code:   r.currency_code,
        currency_symbol: r.currency_symbol,
        monthly_price:   Number(r.monthly_price),
      })),
    });
  } catch (err) {
    console.error('[countries]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load countries.' });
  }
});

module.exports = router;
