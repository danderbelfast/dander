'use strict';

const { Router } = require('express');
const bcrypt     = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const pool       = require('../db/pool');
const { getOffersNearLocation } = require('../services/geoService');
const { sendProximityPush }     = require('../services/pushService');
const { upload, processImage }  = require('../middleware/upload');

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/users/location — store location + trigger proximity push
// ---------------------------------------------------------------------------

router.post('/location', requireAuth, async (req, res) => {
  const { lat, lng } = req.body;
  if (lat == null || lng == null) {
    return res.status(400).json({ success: false, message: 'lat and lng are required.' });
  }

  const userId = req.user.id;

  try {
    // Persist latest location + read global notifications flag in one query
    const { rows: userRows } = await pool.query(
      'UPDATE users SET last_location_lat = $1, last_location_lng = $2 WHERE id = $3 RETURNING notifications_enabled',
      [lat, lng, userId]
    );

    // If the column doesn't exist yet (pre-migration run), default to enabled
    const notificationsEnabled = userRows[0]?.notifications_enabled ?? true;
    if (!notificationsEnabled) {
      return res.json({ success: true });
    }

    // Load per-category preferences for this user
    const { rows: prefRows } = await pool.query(
      'SELECT category, enabled, radius_meters FROM user_notification_preferences WHERE user_id = $1',
      [userId]
    );

    // Build category -> { enabled, radius_meters } lookup
    const prefMap = {};
    for (const p of prefRows) prefMap[p.category] = p;

    // Search radius = largest enabled category radius, or 2km default
    const enabledRadii = prefRows.filter((p) => p.enabled).map((p) => p.radius_meters);
    const searchRadius = enabledRadii.length > 0 ? Math.max(...enabledRadii) : 2000;

    const offers = await getOffersNearLocation(lat, lng, searchRadius);

    // Filter to only offers whose category is within the user's preferred radius
    const eligible = offers.filter((offer) => {
      const pref = prefMap[offer.category];
      if (pref) {
        // Respect explicit preference
        if (!pref.enabled) return false;
        return parseFloat(offer.distance_meters) <= pref.radius_meters;
      }
      // No preference saved for this category → use default 2km
      return parseFloat(offer.distance_meters) <= 2000;
    });

    // For each eligible offer, push only if not already pushed in the last 24 hours
    for (const offer of eligible) {
      const { rows } = await pool.query(`
        INSERT INTO notifications (user_id, offer_id, type)
        SELECT $1, $2, 'proximity'::text
        WHERE NOT EXISTS (
          SELECT 1 FROM notifications
          WHERE user_id = $1 AND offer_id = $2 AND type = 'proximity'
            AND created_at > NOW() - INTERVAL '24 hours'
        )
        RETURNING id
      `, [userId, offer.id]);

      if (rows.length > 0) {
        sendProximityPush(userId, offer).catch(() => {});
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[users/location]', err);
    return res.status(500).json({ success: false, message: 'Failed to update location.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/users/me/password
// ---------------------------------------------------------------------------

router.put(
  '/me/password',
  requireAuth,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required.'),
    body('newPassword')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter.')
      .matches(/[0-9]/).withMessage('Password must contain a number.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    const { currentPassword, newPassword } = req.body;

    try {
      const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });

      const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
      if (!match) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

      const newHash = await bcrypt.hash(newPassword, 12);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

      return res.json({ success: true, message: 'Password updated.' });
    } catch (err) {
      console.error('[users/me/password]', err);
      return res.status(500).json({ success: false, message: 'Failed to update password.' });
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/users/me/avatar
// ---------------------------------------------------------------------------

router.put('/me/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No image file provided.' });
  }
  try {
    const avatarUrl = await processImage(req.file.buffer, 'avatar', req.file.originalname);
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.user.id]);
    return res.json({ success: true, avatar_url: avatarUrl });
  } catch (err) {
    console.error('[users/me/avatar]', err);
    return res.status(500).json({ success: false, message: 'Failed to upload avatar.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/loyalty — points balance, tier, milestones
// ---------------------------------------------------------------------------

const loyaltyService = require('../services/loyaltyService');

router.get('/loyalty', requireAuth, async (req, res) => {
  try {
    const status = await loyaltyService.getLoyaltyStatus(req.user.id);
    return res.json({ success: true, loyalty: status });
  } catch (err) {
    console.error('[users/loyalty]', err);
    return res.status(500).json({ success: false, message: 'Failed to load loyalty status.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/loyalty/history — points transaction log
// ---------------------------------------------------------------------------

router.get('/loyalty/history', requireAuth, async (req, res) => {
  try {
    const history = await loyaltyService.getHistory(req.user.id);
    return res.json({ success: true, history });
  } catch (err) {
    console.error('[users/loyalty/history]', err);
    return res.status(500).json({ success: false, message: 'Failed to load history.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/users/daily-login — once-per-UTC-day points bonus
// ---------------------------------------------------------------------------
//
// Dedupes by querying points_transactions for an 'earn' row with
// reference_type='daily_login' since midnight UTC today. If found, this is
// a no-op and returns already_claimed: true.

const DAILY_LOGIN_BONUS = parseInt(process.env.DAILY_LOGIN_BONUS) || 5;

router.post('/daily-login', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const today  = new Date().toISOString().slice(0, 10);

    const { rows } = await pool.query(
      `SELECT 1 FROM points_transactions
       WHERE user_id = $1
         AND type = 'earn'
         AND reference_type = 'daily_login'
         AND created_at >= (NOW() AT TIME ZONE 'UTC')::date
       LIMIT 1`,
      [userId]
    );
    if (rows.length > 0) {
      return res.json({ success: true, ok: true, points_awarded: 0, already_claimed: true });
    }

    await loyaltyService.awardPoints(userId, {
      points:         DAILY_LOGIN_BONUS,
      description:    `Daily app open (${today})`,
      referenceType:  'daily_login',
      referenceId:    today,
    });

    return res.json({
      success: true, ok: true,
      points_awarded: DAILY_LOGIN_BONUS,
      already_claimed: false,
    });
  } catch (err) {
    console.error('[users/daily-login]', err);
    return res.status(500).json({ success: false, message: 'Failed to claim daily bonus.' });
  }
});

module.exports = router;
