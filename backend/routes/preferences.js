'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const pool = require('../db/pool');

const router = Router();

// ---------------------------------------------------------------------------
// Inline migration — run once at startup (idempotent)
// Handles the case where the DB already exists and schema.sql won't re-run.
// ---------------------------------------------------------------------------
(async () => {
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_notification_preferences (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category      VARCHAR(100) NOT NULL,
        enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
        radius_meters INTEGER      NOT NULL DEFAULT 1000,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_notif_pref UNIQUE (user_id, category)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_user_id ON user_notification_preferences (user_id)
    `);
    console.log('[preferences] Migrations OK.');
  } catch (err) {
    console.error('[preferences] Migration error:', err.message);
  }
})();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  'Food & Drink',
  'Beauty & Wellness',
  'Health & Fitness',
  'Entertainment',
  'Retail & Shopping',
  'Services',
  'Experiences & Leisure',
];

const DEFAULT_RADIUS = 1000; // 1 km

// ---------------------------------------------------------------------------
// GET /api/preferences/notifications
// Returns the user's global toggle + per-category preferences.
// Missing categories are filled with defaults so the client always gets all 7.
// ---------------------------------------------------------------------------

router.get('/notifications', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const [userResult, prefsResult] = await Promise.all([
      pool.query('SELECT notifications_enabled FROM users WHERE id = $1', [userId]),
      pool.query(
        'SELECT category, enabled, radius_meters FROM user_notification_preferences WHERE user_id = $1',
        [userId]
      ),
    ]);

    const notificationsEnabled = userResult.rows[0]?.notifications_enabled ?? true;
    const savedMap = {};
    for (const row of prefsResult.rows) {
      savedMap[row.category] = { enabled: row.enabled, radius_meters: row.radius_meters };
    }

    const preferences = CATEGORIES.map((cat) => ({
      category:     cat,
      enabled:      savedMap[cat]?.enabled      ?? true,
      radius_meters: savedMap[cat]?.radius_meters ?? DEFAULT_RADIUS,
    }));

    return res.json({ success: true, notifications_enabled: notificationsEnabled, preferences });
  } catch (err) {
    console.error('[preferences/notifications GET]', err);
    return res.status(500).json({ success: false, message: 'Failed to load notification preferences.' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/preferences/notifications
// Accepts { notifications_enabled?, preferences?: [{ category, enabled, radius_meters }] }
// ---------------------------------------------------------------------------

router.put('/notifications', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { notifications_enabled, preferences } = req.body;

  try {
    if (notifications_enabled != null) {
      await pool.query(
        'UPDATE users SET notifications_enabled = $1 WHERE id = $2',
        [Boolean(notifications_enabled), userId]
      );
    }

    if (Array.isArray(preferences)) {
      for (const pref of preferences) {
        const { category, enabled, radius_meters } = pref;
        if (!CATEGORIES.includes(category)) continue;
        const rad = Math.max(100, Math.min(10000, parseInt(radius_meters, 10) || DEFAULT_RADIUS));
        await pool.query(`
          INSERT INTO user_notification_preferences (user_id, category, enabled, radius_meters, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT ON CONSTRAINT uq_user_notif_pref
          DO UPDATE SET enabled = $3, radius_meters = $4, updated_at = NOW()
        `, [userId, category, Boolean(enabled), rad]);
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[preferences/notifications PUT]', err);
    return res.status(500).json({ success: false, message: 'Failed to save notification preferences.' });
  }
});

module.exports = router;
