'use strict';

/**
 * leaderboard.js — user-facing leaderboard.
 *
 *   GET /api/leaderboard/monthly  — top 50 for the current UTC calendar month
 *   GET /api/leaderboard/me       — caller's rank + totals for the same window
 *   GET /api/leaderboard/friends  — stub, returns []
 *
 * Source of truth: points_transactions. Steps and WiFi counts are joined
 * for display only — points_transactions already contains the awards from
 * those sources (steps + wifi write through to it via the main ledger).
 */

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const pool = require('../db/pool');

const router = Router();
router.use(requireAuth);

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}
function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

function displayName(row) {
  const parts = [row.first_name, row.last_name].filter(Boolean).map((s) => s.trim());
  return parts.length > 0 ? parts.join(' ') : 'Anonymous';
}

// One CTE-style query used by both /monthly and /me — the only difference
// is whether we filter to the caller and slice the top-N.
//
// Window: rows whose UTC month matches the current UTC month. Computed
// directly off NOW() so a server restart doesn't shift the boundary.
const RANK_SQL = `
  WITH pts AS (
    SELECT user_id, COALESCE(SUM(points), 0)::int AS points_this_month
    FROM points_transactions
    WHERE created_at >= date_trunc('month', (NOW() AT TIME ZONE 'UTC'))::date
      AND type = 'earn'
    GROUP BY user_id
  ),
  steps AS (
    SELECT user_id, COALESCE(SUM(steps), 0)::int AS steps_this_month
    FROM step_logs
    WHERE logged_at >= date_trunc('month', (NOW() AT TIME ZONE 'UTC'))::date
    GROUP BY user_id
  ),
  wifi AS (
    SELECT user_id, COUNT(DISTINCT bssid)::int AS wifi_networks_this_month
    FROM wifi_points_log
    WHERE awarded_at >= date_trunc('month', (NOW() AT TIME ZONE 'UTC'))::date
    GROUP BY user_id
  ),
  ranked AS (
    SELECT
      pts.user_id,
      pts.points_this_month,
      COALESCE(steps.steps_this_month, 0)             AS steps_this_month,
      COALESCE(wifi.wifi_networks_this_month, 0)      AS wifi_networks_this_month,
      ROW_NUMBER() OVER (
        ORDER BY pts.points_this_month DESC, pts.user_id ASC
      )::int AS rank
    FROM pts
    LEFT JOIN steps ON steps.user_id = pts.user_id
    LEFT JOIN wifi  ON wifi.user_id  = pts.user_id
  )
  SELECT r.rank, r.user_id,
         r.points_this_month, r.steps_this_month, r.wifi_networks_this_month,
         u.first_name, u.last_name, u.avatar_url
  FROM ranked r
  JOIN users u ON u.id = r.user_id
`;

// ── Top 50 ──────────────────────────────────────────────────────────────────
router.get('/monthly', async (_req, res) => {
  try {
    const { rows } = await pool.query(`${RANK_SQL} ORDER BY r.rank ASC LIMIT 50`);
    const board = rows.map((r) => ({
      rank:                     r.rank,
      user_id:                  r.user_id,
      display_name:             displayName(r),
      avatar_url:               r.avatar_url || null,
      points_this_month:        r.points_this_month,
      steps_this_month:         r.steps_this_month,
      wifi_networks_this_month: r.wifi_networks_this_month,
      rank_change:              0,
    }));
    return ok(res, { leaderboard: board });
  } catch (err) {
    console.error('[leaderboard/monthly]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to load leaderboard.');
  }
});

// ── Caller's own rank + totals ─────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `${RANK_SQL} WHERE r.user_id = $1`,
      [req.user.id]
    );
    if (rows.length === 0) {
      // No 'earn' transactions yet this month — return a synthesised zero row.
      return ok(res, {
        me: {
          rank:                     null,
          user_id:                  req.user.id,
          display_name:             'You',
          avatar_url:               null,
          points_this_month:        0,
          steps_this_month:         0,
          wifi_networks_this_month: 0,
          rank_change:              0,
        },
      });
    }
    const r = rows[0];
    return ok(res, {
      me: {
        rank:                     r.rank,
        user_id:                  r.user_id,
        display_name:             displayName(r),
        avatar_url:               r.avatar_url || null,
        points_this_month:        r.points_this_month,
        steps_this_month:         r.steps_this_month,
        wifi_networks_this_month: r.wifi_networks_this_month,
        rank_change:              0,
      },
    });
  } catch (err) {
    console.error('[leaderboard/me]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to load your rank.');
  }
});

// ── Friends — stub ─────────────────────────────────────────────────────────
router.get('/friends', async (_req, res) => {
  return ok(res, { data: [], message: 'Friends leaderboard coming soon' });
});

module.exports = router;
