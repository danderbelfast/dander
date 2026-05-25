'use strict';

/**
 * fraudChecks.js — fraud-detection helpers.
 *
 * This file starts with WiFi-specific checks. Device-fingerprint checks
 * (multiple-accounts-same-device, etc.) can be added later when that task
 * lands. Functions here return data; callers decide what to do with it
 * (gate a points award, set a flag, surface to admin, etc.).
 *
 * Everything reads from the existing wifi_observations / wifi_points_log
 * tables. No new state.
 */

const crypto = require('crypto');
const pool   = require('../db/pool');

// ── Tunables ────────────────────────────────────────────────────────────────

// 100 m/s ≈ 360 km/h — well above driving, below commercial-flight cruise.
// Anything over this between consecutive observations is physically suspect.
const MAX_VELOCITY_MPS = 100;

// "Spam" threshold: how many times one user can observe the same BSSID in
// one UTC day before it counts as scripted behaviour. The cross-user dedup
// already caps points; this catches the case of one user generating many
// observation rows for the same router.
const SAME_BSSID_SPAM_PER_DAY = 50;

// Mass-claim window: distinct users observing the same BSSID within this
// many minutes — likely a coordinated script trying to game the dedup.
const MASS_CLAIM_WINDOW_MIN  = 10;
const MASS_CLAIM_USER_LIMIT  = 10;

// ── User-id anonymisation ───────────────────────────────────────────────────

/**
 * Map an integer users.id → a stable UUID-formatted string via HMAC-SHA256
 * under a server-side secret. Used as wifi_observations.user_id so the raw
 * location data isn't directly joinable to user identity.
 *
 * Stability: same input → same output for the lifetime of the secret.
 * Reversibility: not reversible without the secret.
 */
function anonymiseUserId(userId) {
  const secret = process.env.USER_ID_HASH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('USER_ID_HASH_SECRET (or JWT_SECRET fallback) must be set');
  }
  const hex = crypto.createHmac('sha256', secret).update(String(userId)).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// ── Haversine ───────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000;

function haversineMetres(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ── Checks ──────────────────────────────────────────────────────────────────

/**
 * Impossible-velocity check. Compares the new observation against this
 * user's most recent prior observation; if the implied speed exceeds
 * MAX_VELOCITY_MPS, flag.
 *
 * @returns {Promise<{ suspicious: boolean, reason: string|null, velocityMps: number|null }>}
 */
async function checkImpossibleVelocity({ anonymousUserId, lat, lng, capturedAt }) {
  if (!anonymousUserId || lat == null || lng == null || !capturedAt) {
    return { suspicious: false, reason: null, velocityMps: null };
  }

  const { rows } = await pool.query(
    `SELECT latitude, longitude, captured_at
     FROM wifi_observations
     WHERE user_id = $1 AND captured_at < $2
     ORDER BY captured_at DESC
     LIMIT 1`,
    [anonymousUserId, capturedAt]
  );
  if (rows.length === 0) {
    return { suspicious: false, reason: null, velocityMps: null };
  }

  const prev = rows[0];
  const distanceM = haversineMetres(
    Number(prev.latitude), Number(prev.longitude),
    Number(lat), Number(lng)
  );
  const elapsedMs = new Date(capturedAt).getTime() - new Date(prev.captured_at).getTime();
  if (elapsedMs <= 0) {
    return { suspicious: false, reason: null, velocityMps: null };
  }
  const velocityMps = distanceM / (elapsedMs / 1000);

  if (velocityMps > MAX_VELOCITY_MPS) {
    return {
      suspicious: true,
      reason:     'impossible_velocity',
      velocityMps,
    };
  }
  return { suspicious: false, reason: null, velocityMps };
}

/**
 * Same-BSSID spam: how many times has this user already reported this
 * BSSID today? Useful as a soft signal — callers can suppress points or
 * surface for review when count is high.
 *
 * @returns {Promise<{ suspicious: boolean, reason: string|null, count: number }>}
 */
async function checkSameBssidSpam({ anonymousUserId, bssid, awardDay }) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM wifi_observations
     WHERE user_id = $1
       AND bssid   = $2
       AND captured_at >= $3::date
       AND captured_at <  ($3::date + INTERVAL '1 day')`,
    [anonymousUserId, bssid, awardDay]
  );
  const count = rows[0]?.n || 0;
  return {
    suspicious: count >= SAME_BSSID_SPAM_PER_DAY,
    reason:     count >= SAME_BSSID_SPAM_PER_DAY ? 'same_bssid_spam' : null,
    count,
  };
}

/**
 * Mass-claim: how many distinct (anonymised) users have reported this
 * BSSID in the last MASS_CLAIM_WINDOW_MIN minutes? A flood from many
 * users at once is consistent with a coordinated script.
 *
 * @returns {Promise<{ suspicious: boolean, reason: string|null, userCount: number }>}
 */
async function checkMassClaim({ bssid }) {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT user_id)::int AS n
     FROM wifi_observations
     WHERE bssid = $1
       AND captured_at >= NOW() - ($2 || ' minutes')::interval`,
    [bssid, String(MASS_CLAIM_WINDOW_MIN)]
  );
  const userCount = rows[0]?.n || 0;
  return {
    suspicious: userCount >= MASS_CLAIM_USER_LIMIT,
    reason:     userCount >= MASS_CLAIM_USER_LIMIT ? 'mass_claim' : null,
    userCount,
  };
}

// ── Device-fingerprint admin / review helpers ───────────────────────────────

/**
 * All flagged device records, joined to user info for an admin dashboard.
 * Most recently seen first.
 */
async function getFlaggedDevices() {
  const { rows } = await pool.query(
    `SELECT df.id, df.user_id, df.install_id, df.fingerprint, df.platform,
            df.os_version, df.app_version, df.timezone,
            df.screen_width, df.screen_height,
            df.first_seen, df.last_seen, df.seen_count,
            df.flagged, df.flag_reason,
            u.email, u.first_name, u.last_name,
            u.created_at AS user_created_at
     FROM device_fingerprints df
     JOIN users u ON u.id = df.user_id
     WHERE df.flagged = true
     ORDER BY df.last_seen DESC`
  );
  return rows;
}

/**
 * install_ids seen on 2+ distinct user accounts. Includes the user_id
 * list and most recent activity time per install.
 */
async function getMultiAccountDevices() {
  const { rows } = await pool.query(
    `SELECT install_id,
            COUNT(DISTINCT user_id)::int    AS user_count,
            ARRAY_AGG(DISTINCT user_id)     AS user_ids,
            MAX(last_seen)                  AS last_seen
     FROM device_fingerprints
     GROUP BY install_id
     HAVING COUNT(DISTINCT user_id) > 1
     ORDER BY user_count DESC, last_seen DESC`
  );
  return rows;
}

/**
 * Accounts created within the last `days` days that own at least one
 * flagged device. Defaults to 30 days; non-positive integers fall back
 * to 30 to keep callers safe.
 */
async function getSuspiciousNewAccounts(days = 30) {
  if (!Number.isInteger(days) || days < 1) days = 30;
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.email, u.first_name, u.last_name,
            u.created_at,
            COUNT(df.id)::int               AS flagged_device_count,
            ARRAY_AGG(DISTINCT df.flag_reason) FILTER (WHERE df.flag_reason IS NOT NULL)
                                            AS flag_reasons,
            MAX(df.last_seen)               AS last_device_seen
     FROM users u
     JOIN device_fingerprints df ON df.user_id = u.id
     WHERE u.created_at >= NOW() - ($1 || ' days')::interval
       AND df.flagged = true
     GROUP BY u.id, u.email, u.first_name, u.last_name, u.created_at
     ORDER BY u.created_at DESC`,
    [String(days)]
  );
  return rows;
}

/**
 * Manually clear a flag after admin review. Clears every row sharing
 * that install_id (an install_id with multiple users will typically
 * have flagged set on all its rows). Returns the number of rows
 * affected so callers can sanity-check.
 *
 * @param {string} installId
 * @returns {Promise<number>}
 */
async function clearFlag(installId) {
  const { rowCount } = await pool.query(
    `UPDATE device_fingerprints
     SET flagged = false, flag_reason = NULL
     WHERE install_id = $1`,
    [installId]
  );
  return rowCount;
}

module.exports = {
  // anonymisation
  anonymiseUserId,
  // wifi checks
  checkImpossibleVelocity,
  checkSameBssidSpam,
  checkMassClaim,
  // device-fingerprint admin helpers
  getFlaggedDevices,
  getMultiAccountDevices,
  getSuspiciousNewAccounts,
  clearFlag,
  // exposed for tests / tuning
  MAX_VELOCITY_MPS,
  SAME_BSSID_SPAM_PER_DAY,
  MASS_CLAIM_WINDOW_MIN,
  MASS_CLAIM_USER_LIMIT,
  haversineMetres,
};
