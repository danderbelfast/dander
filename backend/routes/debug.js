'use strict';

/**
 * debug.js — temporary diagnostic endpoints.
 *
 * These exist to help us pin down why wifi_today is reporting 0 in
 * production. Remove (or gate behind admin auth) once the question is
 * answered.
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const pool = require('../db/pool');

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/debug/wifi-today
//
// Returns: { userId, today, rows: [...], wifi_today: N }
//   - userId  — req.user.id, so we can confirm we're querying the right row
//   - today   — what Postgres sees as the current UTC date
//   - rows    — most recent 10 wifi_points_log rows for this user
//   - wifi_today — the actual count produced by the loyaltyService query
// ---------------------------------------------------------------------------

router.get('/wifi-today', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const [today, rows, count] = await Promise.all([
      pool.query(`SELECT (NOW() AT TIME ZONE 'UTC')::date AS today`),
      pool.query(
        `SELECT user_id, bssid, points, award_day, awarded_at
           FROM wifi_points_log
          WHERE user_id = $1
          ORDER BY awarded_at DESC
          LIMIT 10`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT bssid)::int AS wifi_today
           FROM wifi_points_log
          WHERE user_id   = $1
            AND award_day = (NOW() AT TIME ZONE 'UTC')::date`,
        [userId]
      ),
    ]);

    return res.json({
      success:    true,
      userId,
      today:      today.rows[0]?.today ?? null,
      wifi_today: count.rows[0]?.wifi_today ?? 0,
      rows:       rows.rows,
    });
  } catch (err) {
    console.error('[debug/wifi-today]', err);
    return res.status(500).json({
      success: false,
      code:    'DEBUG_QUERY_FAILED',
      message: err.message,
      userId,
    });
  }
});

module.exports = router;
