'use strict';

/**
 * steps.js — POST /api/steps
 *
 * The app submits a running total of today's steps periodically. We:
 *   1. Upsert step_logs (one row per user per UTC date). Never decrease
 *      a stored value — if a later POST has a lower count (e.g. the app
 *      restarted with a fresh sensor counter), we keep the higher one.
 *   2. Award the *delta* in points since whatever was already credited
 *      for that day. 100 steps = 1 point, capped at MAX_STEP_POINTS_PER_DAY.
 *   3. Forward the award into the main ledger via loyaltyService and
 *      refresh the per-user steps_* totals on user_loyalty.
 */

const { Router } = require('express');
const { body, validationResult } = require('express-validator');

const { requireAuth } = require('../middleware/auth');
const pool            = require('../db/pool');
const loyaltyService  = require('../services/loyaltyService');

const router = Router();
router.use(requireAuth);

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}
function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

// Tunable at runtime via env vars; sensible fallbacks if unset.
// eligibleTotal below uses (STEPS_PER_POINT * MAX_STEP_POINTS_PER_DAY) as the
// step cap, so changing either constant automatically retunes the ceiling
// (e.g. defaults give a 500-pt / 50,000-step daily cap).
const STEPS_PER_POINT          = parseInt(process.env.STEPS_PER_POINT)         || 100;
const MAX_STEP_POINTS_PER_DAY  = parseInt(process.env.MAX_STEP_POINTS_PER_DAY) || 500;
const MAX_REASONABLE_STEPS     = 200_000;

function computePointsForSteps(steps) {
  const capped = Math.min(steps, STEPS_PER_POINT * MAX_STEP_POINTS_PER_DAY);
  return Math.floor(capped / STEPS_PER_POINT);
}

router.post(
  '/',
  [
    body('steps').isInt({ min: 0, max: MAX_REASONABLE_STEPS })
      .withMessage(`steps must be between 0 and ${MAX_REASONABLE_STEPS}`),
    body('distance_metres').optional({ nullable: true }).isInt({ min: 0 }),
    body('logged_at').isISO8601().withMessage('logged_at must be a YYYY-MM-DD date'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg);
    }

    const userId   = req.user.id;
    const incoming = parseInt(req.body.steps, 10);
    const distance = req.body.distance_metres != null
      ? parseInt(req.body.distance_metres, 10)
      : null;
    // Coerce to YYYY-MM-DD so DATE column accepts it cleanly.
    const loggedAt = String(req.body.logged_at).slice(0, 10);

    let stepsAfter        = incoming;
    let prevPointsAwarded = 0;
    let pointsToAward     = 0;
    let logRow            = null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert — never decrease the step count for the day. distance_metres
      // mirrors the same logic: only update when the new value is higher
      // OR when the existing value is null and we now have one.
      const upsert = await client.query(
        `INSERT INTO step_logs (user_id, steps, distance_metres, logged_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, logged_at) DO UPDATE SET
           steps           = GREATEST(step_logs.steps, EXCLUDED.steps),
           distance_metres = CASE
             WHEN EXCLUDED.distance_metres IS NULL THEN step_logs.distance_metres
             WHEN step_logs.distance_metres IS NULL THEN EXCLUDED.distance_metres
             ELSE GREATEST(step_logs.distance_metres, EXCLUDED.distance_metres)
           END,
           updated_at      = NOW()
         RETURNING id, steps, distance_metres, points_awarded`,
        [userId, incoming, distance, loggedAt]
      );
      logRow            = upsert.rows[0];
      stepsAfter        = logRow.steps;
      prevPointsAwarded = logRow.points_awarded;

      // Delta points: total eligible for today minus already-awarded.
      const eligibleTotal = computePointsForSteps(stepsAfter);
      pointsToAward = Math.max(0, eligibleTotal - prevPointsAwarded);

      if (pointsToAward > 0) {
        await client.query(
          `UPDATE step_logs SET points_awarded = $1, updated_at = NOW() WHERE id = $2`,
          [eligibleTotal, logRow.id]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[steps]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to record steps.');
    } finally {
      client.release();
    }

    // Outside the transaction: forward the award (if any) and refresh
    // the cached step totals on user_loyalty. Failures here log but
    // don't roll back the step_logs row.
    if (pointsToAward > 0) {
      try {
        await loyaltyService.awardPoints(userId, {
          points:        pointsToAward,
          description:   `Steps logged for ${loggedAt}`,
          referenceType: 'steps',
          referenceId:   loggedAt,
        });
      } catch (err) {
        console.error('[steps] loyalty write-through failed:', err.message);
      }
    }

    // Refresh steps_* cache on user_loyalty (computed from step_logs).
    try {
      await pool.query(
        `UPDATE user_loyalty ul
         SET steps_today = COALESCE(today.steps, 0),
             steps_this_month = COALESCE(month.total, 0),
             steps_all_time   = COALESCE(all_time.total, 0)
         FROM (SELECT steps FROM step_logs WHERE user_id = $1 AND logged_at = (CURRENT_DATE AT TIME ZONE 'UTC')::date) today
         FULL OUTER JOIN
              (SELECT COALESCE(SUM(steps), 0)::int AS total
               FROM step_logs WHERE user_id = $1
                 AND logged_at >= date_trunc('month', (CURRENT_DATE AT TIME ZONE 'UTC')::date)) month ON true
         FULL OUTER JOIN
              (SELECT COALESCE(SUM(steps), 0)::int AS total
               FROM step_logs WHERE user_id = $1) all_time ON true
         WHERE ul.user_id = $1`,
        [userId]
      );
    } catch (err) {
      console.error('[steps] user_loyalty refresh failed:', err.message);
    }

    return ok(res, {
      steps_today:          stepsAfter,
      points_awarded:       pointsToAward,
      total_points_today:   prevPointsAwarded + pointsToAward,
    });
  }
);

module.exports = router;
