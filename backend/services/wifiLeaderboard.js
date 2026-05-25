'use strict';

/**
 * wifiLeaderboard.js — read helpers over wifi_points_log.
 *
 * Pure data layer — admin/user-facing endpoints (built later) will compose
 * these. wifi_points_log.user_id is the real users.id (not the anonymised
 * id used in wifi_observations) so we can join on the users table.
 */

const pool = require('../db/pool');

/**
 * Top point earners over an optional time window.
 *
 * @param {object} [opts]
 * @param {string} [opts.from]   ISO date / timestamp lower bound (inclusive)
 * @param {string} [opts.to]     ISO date / timestamp upper bound (inclusive)
 * @param {number} [opts.limit]  default 25
 */
async function getTopContributors({ from, to, limit = 25 } = {}) {
  const conditions = [];
  const params = [];
  let p = 1;

  if (from) { conditions.push(`pl.awarded_at >= $${p++}`); params.push(from); }
  if (to)   { conditions.push(`pl.awarded_at <= $${p++}`); params.push(to); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT pl.user_id,
            u.first_name,
            u.last_name,
            COALESCE(SUM(pl.points), 0)::int  AS total_points,
            COUNT(DISTINCT pl.bssid)::int     AS unique_bssids,
            MIN(pl.awarded_at)                AS first_award,
            MAX(pl.awarded_at)                AS last_award
     FROM wifi_points_log pl
     JOIN users u ON u.id = pl.user_id
     ${where}
     GROUP BY pl.user_id, u.first_name, u.last_name
     ORDER BY total_points DESC, unique_bssids DESC
     LIMIT $${p}`,
    [...params, limit]
  );
  return rows;
}

/**
 * Score summary for one user.
 *
 * @param {number} userId  real users.id
 */
async function getUserScore(userId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(points), 0)::int  AS total_points,
            COUNT(DISTINCT bssid)::int     AS unique_bssids,
            COUNT(*)::int                  AS total_awards,
            MIN(awarded_at)                AS first_award,
            MAX(awarded_at)                AS last_award
     FROM wifi_points_log
     WHERE user_id = $1`,
    [userId]
  );
  return rows[0];
}

/**
 * Daily totals (one row per award_day) over an optional window. Useful
 * for time-series charts and rolling leaderboards.
 *
 * @param {object} [opts]
 * @param {string} [opts.from]
 * @param {string} [opts.to]
 */
async function getDailyTotals({ from, to } = {}) {
  const conditions = [];
  const params = [];
  let p = 1;

  if (from) { conditions.push(`award_day >= $${p++}`); params.push(from); }
  if (to)   { conditions.push(`award_day <= $${p++}`); params.push(to); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT award_day,
            COUNT(DISTINCT user_id)::int  AS contributors,
            COUNT(*)::int                 AS bssids_awarded,
            COALESCE(SUM(points), 0)::int AS total_points
     FROM wifi_points_log
     ${where}
     GROUP BY award_day
     ORDER BY award_day DESC`,
    params
  );
  return rows;
}

/**
 * Recent point-earning activity for one user (most recent first).
 *
 * @param {number} userId
 * @param {number} [limit=50]
 */
async function getUserRecentAwards(userId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT bssid, points, awarded_for, award_day, awarded_at
     FROM wifi_points_log
     WHERE user_id = $1
     ORDER BY awarded_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

module.exports = {
  getTopContributors,
  getUserScore,
  getDailyTotals,
  getUserRecentAwards,
};
