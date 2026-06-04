'use strict';

/**
 * userPreferences.js — display preference (personalised vs anonymous)
 * + birthday sharing toggle for the user app.
 *
 *   GET  /api/users/display-preference
 *   POST /api/users/display-preference
 *
 * Both require a Bearer JWT.
 */

const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.get('/display-preference', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT display_preference, display_preference_set_at, birthday_sharing
         FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, code: 'NOT_FOUND' });
    return res.status(200).json({ success: true, ...rows[0] });
  } catch (err) {
    console.error('[users/display-preference GET]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

router.post('/display-preference', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const pref = body.display_preference;
  const birthday = typeof body.birthday_sharing === 'boolean' ? body.birthday_sharing : null;
  if (pref !== 'personalised' && pref !== 'anonymous') {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'display_preference must be personalised|anonymous.' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE users
          SET display_preference        = $2,
              display_preference_set_at = NOW(),
              birthday_sharing          = COALESCE($3, birthday_sharing)
        WHERE id = $1
        RETURNING display_preference, display_preference_set_at, birthday_sharing`,
      [req.user.id, pref, birthday]
    );
    return res.status(200).json({ success: true, ...rows[0] });
  } catch (err) {
    console.error('[users/display-preference POST]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

module.exports = router;
