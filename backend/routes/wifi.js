'use strict';

/**
 * wifi.js — User-app ingest endpoint for WiFi scans.
 *
 *   POST /api/wifi/observations
 *
 * Accepts a batch of WiFi observations from the authenticated user,
 * stores each into wifi_observations (with H3 indices and an anonymised
 * user_id), and awards points subject to:
 *
 *   • cross-user daily dedup — a given (bssid, UTC day) can earn points
 *     exactly once across the whole user base. Enforced at the DB level
 *     by the UNIQUE index on wifi_points_log (bssid, award_day); we just
 *     INSERT … ON CONFLICT DO NOTHING and count the rows that took.
 *
 *   • fraud gate — if the batch fails the impossible-velocity check, no
 *     points are awarded. The observations are still stored (the data is
 *     useful for the aggregation pipeline). The response does not reveal
 *     the flag reason; the caller just sees fewer points.
 */

const { Router } = require('express');
const { body, validationResult } = require('express-validator');

const { requireAuth } = require('../middleware/auth');
const pool            = require('../db/pool');
const { getH3Indexes } = require('../utils/h3');
const {
  anonymiseUserId,
  checkImpossibleVelocity,
} = require('../utils/fraudChecks');

const router = Router();
router.use(requireAuth);

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}
function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

const POINTS_PER_DISCOVERY         = parseInt(process.env.POINTS_PER_DISCOVERY) || 2;
const MAX_OBSERVATIONS_PER_REQUEST = 200;
const BSSID_RE = /^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}$/;

router.post(
  '/observations',
  [
    body('observations').isArray({ min: 1, max: MAX_OBSERVATIONS_PER_REQUEST })
      .withMessage(`observations must be an array of 1..${MAX_OBSERVATIONS_PER_REQUEST}`),
    body('observations.*.bssid').isString().matches(BSSID_RE)
      .withMessage('bssid must be a MAC address like AA:BB:CC:DD:EE:FF'),
    body('observations.*.ssid').optional({ nullable: true }).isString().isLength({ max: 32 }),
    body('observations.*.signal_strength').optional({ nullable: true }).isInt(),
    body('observations.*.latitude').isFloat({ min: -90, max: 90 }),
    body('observations.*.longitude').isFloat({ min: -180, max: 180 }),
    body('observations.*.accuracy_metres').optional({ nullable: true }).isInt({ min: 0 }),
    body('observations.*.captured_at').isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg);
    }

    const userIdReal      = req.user.id;
    const anonymousUserId = anonymiseUserId(userIdReal);
    const observations    = req.body.observations;
    const awardDay        = new Date().toISOString().slice(0, 10); // UTC date

    let accepted     = 0;
    let pointsEarned = 0;
    let blockedPoints = false;

    // ── Fraud gate: impossible-velocity. A single batch represents one scan
    //    moment, so checking the latest observation in the batch against the
    //    user's most recent prior observation is enough.
    const probe = [...observations]
      .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())[0];
    try {
      const velocity = await checkImpossibleVelocity({
        anonymousUserId,
        lat:        probe.latitude,
        lng:        probe.longitude,
        capturedAt: probe.captured_at,
      });
      if (velocity.suspicious) {
        blockedPoints = true;
        // Log server-side only — the response stays silent on the reason.
        console.warn(
          `[wifi/observations] suspicious velocity user=${userIdReal} ` +
          `velocity=${Math.round(velocity.velocityMps)}m/s — points suppressed.`
        );
      }
    } catch (err) {
      // Non-fatal: log and proceed without awarding to be safe.
      console.error('[wifi/observations] velocity check failed:', err.message);
      blockedPoints = true;
    }

    // ── Store observations + (optionally) award points, in one transaction.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const o of observations) {
        let hex;
        try {
          hex = getH3Indexes(Number(o.latitude), Number(o.longitude));
        } catch {
          // Bad coords on a single row shouldn't kill the batch.
          continue;
        }
        await client.query(
          `INSERT INTO wifi_observations
             (user_id, bssid, ssid, signal_strength,
              latitude, longitude,
              h3_index_r8, h3_index_r10, h3_index_r12,
              accuracy_metres, captured_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            anonymousUserId, o.bssid, o.ssid || null, o.signal_strength ?? null,
            o.latitude, o.longitude,
            hex.r8, hex.r10, hex.r12,
            o.accuracy_metres ?? null, o.captured_at,
          ]
        );
        accepted++;
      }

      // Points pass — cross-user daily dedup via the UNIQUE index.
      if (!blockedPoints) {
        const uniqueBssids = [...new Set(observations.map((o) => o.bssid))];
        for (const bssid of uniqueBssids) {
          const ins = await client.query(
            `INSERT INTO wifi_points_log
               (user_id, bssid, points, awarded_for, award_day)
             VALUES ($1, $2, $3, 'discovery', $4)
             ON CONFLICT (bssid, award_day) DO NOTHING
             RETURNING id`,
            [userIdReal, bssid, POINTS_PER_DISCOVERY, awardDay]
          );
          if (ins.rows.length > 0) pointsEarned += POINTS_PER_DISCOVERY;
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[wifi/observations]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to record observations.');
    } finally {
      client.release();
    }

    return ok(res, { accepted, points_earned: pointsEarned });
  }
);

module.exports = router;
