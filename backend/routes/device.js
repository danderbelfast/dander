'use strict';

/**
 * device.js — Device fingerprint ingest.
 *
 *   POST /api/device/fingerprint   (authenticated)
 *
 * Called by the app on login / app open with a SHA-256 device fingerprint,
 * a persistent install UUID, and a handful of device attributes. Upserts
 * the (install_id, user_id) row, then runs three fraud checks. Flagged
 * status is written directly to the affected rows and returned so the
 * downstream points system can silently suppress rewards.
 *
 * The response intentionally does NOT echo `fingerprint` or `install_id` —
 * those are not user-facing.
 */

const { Router } = require('express');
const { body, validationResult } = require('express-validator');

const { requireAuth } = require('../middleware/auth');
const pool = require('../db/pool');
const { anonymiseUserId } = require('../utils/fraudChecks');

const router = Router();
router.use(requireAuth);

function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

// Hard limit on devices per account before the newest is flagged.
const MAX_DEVICES_PER_USER          = 3;
// Tolerance for the longitude→offset approximation in the timezone check.
// 6 hours ≈ 90° of longitude — flags obvious cross-continent mismatches
// (e.g. Asia tz with North America GPS) while letting legitimate travel
// pass. The longitude/15 approximation is intentionally coarse; this
// tolerance accounts for political timezone borders (China alone spans
// 60° of longitude on one tz).
const TIMEZONE_MISMATCH_TOLERANCE_H = 6;

/**
 * IANA timezone → current UTC offset in hours. Returns null if Intl can't
 * resolve the zone (invalid tz string, etc.).
 */
function getOffsetHoursForTimezone(tz, when = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    }).formatToParts(when);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    if (tzPart === 'GMT') return 0;
    const m = tzPart.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!m) return null;
    const sign = m[1] === '+' ? 1 : -1;
    const h    = parseInt(m[2], 10);
    const min  = m[3] ? parseInt(m[3], 10) : 0;
    return sign * (h + min / 60);
  } catch {
    return null;
  }
}

router.post(
  '/fingerprint',
  [
    body('fingerprint').isString().isLength({ min: 16, max: 128 })
      .withMessage('fingerprint must be a 16-128 char string'),
    body('install_id').isString().isLength({ min: 8, max: 64 })
      .withMessage('install_id must be an 8-64 char string'),
    body('platform').isString().isIn(['ios', 'android'])
      .withMessage('platform must be "ios" or "android"'),
    body('os_version').optional({ nullable: true }).isString().isLength({ max: 40 }),
    body('app_version').optional({ nullable: true }).isString().isLength({ max: 40 }),
    body('timezone').optional({ nullable: true }).isString().isLength({ max: 64 }),
    body('screen_width').optional({ nullable: true }).isInt({ min: 1 }),
    body('screen_height').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg);
    }

    const userId = req.user.id;
    const {
      fingerprint, install_id,
      platform, os_version, app_version, timezone,
      screen_width, screen_height,
    } = req.body;

    let flagged    = false;
    let flagReason = null;
    let rowId      = null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ── Upsert ───────────────────────────────────────────────────────
      const upsert = await client.query(
        `INSERT INTO device_fingerprints
           (user_id, fingerprint, install_id, platform, os_version, app_version,
            timezone, screen_width, screen_height)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (install_id, user_id) DO UPDATE SET
           last_seen   = NOW(),
           seen_count  = device_fingerprints.seen_count + 1,
           os_version  = COALESCE(EXCLUDED.os_version,  device_fingerprints.os_version),
           app_version = COALESCE(EXCLUDED.app_version, device_fingerprints.app_version),
           fingerprint = EXCLUDED.fingerprint,
           timezone    = COALESCE(EXCLUDED.timezone,    device_fingerprints.timezone),
           screen_width  = COALESCE(EXCLUDED.screen_width,  device_fingerprints.screen_width),
           screen_height = COALESCE(EXCLUDED.screen_height, device_fingerprints.screen_height)
         RETURNING id`,
        [
          userId, fingerprint, install_id, platform,
          os_version || null, app_version || null, timezone || null,
          screen_width || null, screen_height || null,
        ]
      );
      rowId = upsert.rows[0].id;

      // ── Check 1: multiple accounts on same install_id ───────────────
      // After the upsert, count distinct user_ids for this install. If
      // >1, this install has been used by multiple accounts — flag every
      // row sharing the install_id, not just this one.
      const multi = await client.query(
        `SELECT COUNT(DISTINCT user_id)::int AS n
         FROM device_fingerprints WHERE install_id = $1`,
        [install_id]
      );
      if ((multi.rows[0]?.n || 0) > 1) {
        await client.query(
          `UPDATE device_fingerprints
           SET flagged = true, flag_reason = 'multiple_accounts_same_device'
           WHERE install_id = $1`,
          [install_id]
        );
        flagged    = true;
        flagReason = 'multiple_accounts_same_device';
      }

      // ── Check 2: excessive distinct fingerprints on this account ────
      // Only flag the newest (the just-upserted) row.
      if (!flagged) {
        const excess = await client.query(
          `SELECT COUNT(DISTINCT fingerprint)::int AS n
           FROM device_fingerprints WHERE user_id = $1`,
          [userId]
        );
        if ((excess.rows[0]?.n || 0) > MAX_DEVICES_PER_USER) {
          await client.query(
            `UPDATE device_fingerprints
             SET flagged = true, flag_reason = 'excessive_devices'
             WHERE id = $1`,
            [rowId]
          );
          flagged    = true;
          flagReason = 'excessive_devices';
        }
      }

      // ── Check 3: timezone vs. recent GPS location ───────────────────
      // Compares the device's reported tz to a longitude-derived expected
      // offset from the user's most recent wifi_observation. Skipped when
      // tz is missing/unparseable or the user has no GPS data yet.
      if (!flagged && timezone) {
        const deviceOffset = getOffsetHoursForTimezone(timezone);
        if (deviceOffset !== null) {
          const anonId = anonymiseUserId(userId);
          const gps = await client.query(
            `SELECT longitude FROM wifi_observations
             WHERE user_id = $1
             ORDER BY captured_at DESC LIMIT 1`,
            [anonId]
          );
          if (gps.rows.length > 0) {
            const expectedOffset = Number(gps.rows[0].longitude) / 15;
            if (Math.abs(deviceOffset - expectedOffset) > TIMEZONE_MISMATCH_TOLERANCE_H) {
              await client.query(
                `UPDATE device_fingerprints
                 SET flagged = true, flag_reason = 'timezone_location_mismatch'
                 WHERE id = $1`,
                [rowId]
              );
              flagged    = true;
              flagReason = 'timezone_location_mismatch';
            }
          }
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[device/fingerprint]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to record fingerprint.');
    } finally {
      client.release();
    }

    // Response shape per spec: { ok, flagged, flag_reason }. No fingerprint
    // or install_id is echoed back — those are not user-facing.
    return res.status(200).json({ ok: true, flagged, flag_reason: flagReason });
  }
);

module.exports = router;
