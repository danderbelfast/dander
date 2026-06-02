'use strict';

/**
 * loyalty.js — business-facing loyalty management API.
 *
 *   GET    /api/loyalty/settings           — read settings (auto-created on first hit)
 *   PUT    /api/loyalty/settings           — update points/tone/api_key
 *   GET    /api/loyalty/messages           — every custom message for this business
 *   POST   /api/loyalty/messages           — add a message for a trigger
 *   DELETE /api/loyalty/messages/:id       — delete one
 *   GET    /api/loyalty/customers          — recent visits + summary cards
 *   POST   /api/loyalty/preview-greeting   — Claude + Giphy round-trip, no persistence
 *
 * All endpoints require a business JWT.
 */

const { Router } = require('express');
const pool = require('../db/pool');
const { requireBusiness } = require('../middleware/auth');
const { buildGreetingCommand } = require('../services/loyaltyGreeting');

const router = Router();

const VALID_TONES = ['professional', 'friendly', 'cheeky', 'custom'];
const VALID_TRIGGERS = [
  'regular', 'milestone_10', 'milestone_50', 'milestone_100',
  'long_absence', 'birthday', 'first_visit', 'already_visited_today',
];

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

router.get('/settings', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO business_loyalty_settings (business_id)
       VALUES ($1)
       ON CONFLICT (business_id) DO UPDATE SET updated_at = business_loyalty_settings.updated_at
       RETURNING points_per_visit, points_cooldown_hours, greeting_tone,
                 (giphy_api_key IS NOT NULL) AS giphy_api_key_set,
                 created_at, updated_at`,
      [req.business.id]
    );
    return res.status(200).json({ success: true, settings: rows[0] });
  } catch (err) {
    console.error('[loyalty/settings GET]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load settings.' });
  }
});

router.put('/settings', requireBusiness, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const pts = body.points_per_visit != null ? parseInt(body.points_per_visit, 10) : null;
  const cool = body.points_cooldown_hours != null ? parseInt(body.points_cooldown_hours, 10) : null;
  const tone = typeof body.greeting_tone === 'string' ? body.greeting_tone : null;
  const giphyKey = typeof body.giphy_api_key === 'string' ? body.giphy_api_key.slice(0, 100) : null;

  if (tone != null && !VALID_TONES.includes(tone)) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Invalid tone.' });
  }
  if (pts != null && (!Number.isFinite(pts) || pts < 0 || pts > 10_000)) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Invalid points_per_visit.' });
  }
  if (cool != null && (!Number.isFinite(cool) || cool < 1 || cool > 8760)) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Invalid cooldown.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO business_loyalty_settings
         (business_id, points_per_visit, points_cooldown_hours, greeting_tone, giphy_api_key)
       VALUES ($1,
               COALESCE($2, 50),
               COALESCE($3, 24),
               COALESCE($4, 'friendly'),
               $5)
       ON CONFLICT (business_id) DO UPDATE
         SET points_per_visit       = COALESCE($2, business_loyalty_settings.points_per_visit),
             points_cooldown_hours  = COALESCE($3, business_loyalty_settings.points_cooldown_hours),
             greeting_tone          = COALESCE($4, business_loyalty_settings.greeting_tone),
             giphy_api_key          = COALESCE($5, business_loyalty_settings.giphy_api_key),
             updated_at             = NOW()
       RETURNING points_per_visit, points_cooldown_hours, greeting_tone,
                 (giphy_api_key IS NOT NULL) AS giphy_api_key_set`,
      [req.business.id, pts, cool, tone, giphyKey]
    );
    return res.status(200).json({ success: true, settings: rows[0] });
  } catch (err) {
    console.error('[loyalty/settings PUT]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to save settings.' });
  }
});

// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------

router.get('/messages', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, trigger, message, is_active, created_at
         FROM business_messages
        WHERE business_id = $1
        ORDER BY trigger, created_at DESC`,
      [req.business.id]
    );
    return res.status(200).json({ success: true, messages: rows });
  } catch (err) {
    console.error('[loyalty/messages GET]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load messages.' });
  }
});

router.post('/messages', requireBusiness, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const trigger = typeof body.trigger === 'string' ? body.trigger : null;
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!trigger || !VALID_TRIGGERS.includes(trigger)) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Invalid trigger.' });
  }
  if (!message || message.length > 500) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Message must be 1–500 chars.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO business_messages (business_id, trigger, message)
       VALUES ($1, $2, $3)
       RETURNING id, trigger, message, is_active, created_at`,
      [req.business.id, trigger, message]
    );
    return res.status(200).json({ success: true, message: rows[0] });
  } catch (err) {
    console.error('[loyalty/messages POST]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to save message.' });
  }
});

router.delete('/messages/:id', requireBusiness, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM business_messages WHERE id = $1 AND business_id = $2`,
      [req.params.id, req.business.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Message not found.' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[loyalty/messages DELETE]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to delete message.' });
  }
});

// ---------------------------------------------------------------------------
// customers / visits
// ---------------------------------------------------------------------------

router.get('/customers', requireBusiness, async (req, res) => {
  try {
    const businessId = req.business.id;
    const [{ rows: visits }, { rows: summary }, { rows: top }] = await Promise.all([
      pool.query(
        `SELECT cv.id,
                u.first_name,
                cv.visit_number,
                cv.points_awarded,
                cv.visited_at,
                cv.greeting_shown,
                cv.gif_url
           FROM customer_visits cv
           JOIN users u ON u.id = cv.user_id
          WHERE cv.business_id = $1
          ORDER BY cv.visited_at DESC
          LIMIT 100`,
        [businessId]
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM business_loyalty_points WHERE business_id = $1) AS total_members,
           (SELECT COUNT(*)::int FROM customer_visits
             WHERE business_id = $1
               AND (visited_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date) AS visits_today,
           (SELECT COALESCE(SUM(points_awarded), 0)::int FROM customer_visits
             WHERE business_id = $1
               AND (visited_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date) AS points_today`,
        [businessId]
      ),
      pool.query(
        `SELECT u.first_name, blp.total_visits, blp.points
           FROM business_loyalty_points blp
           JOIN users u ON u.id = blp.user_id
          WHERE blp.business_id = $1
          ORDER BY blp.total_visits DESC
          LIMIT 1`,
        [businessId]
      ),
    ]);

    return res.status(200).json({
      success: true,
      visits,
      summary: summary[0] || { total_members: 0, visits_today: 0, points_today: 0 },
      top_customer: top[0] || null,
    });
  } catch (err) {
    console.error('[loyalty/customers]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load customers.' });
  }
});

// ---------------------------------------------------------------------------
// preview-greeting — Claude + Giphy round trip, nothing persisted
// ---------------------------------------------------------------------------

router.post('/preview-greeting', requireBusiness, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const greetingType = typeof body.greeting_type === 'string' && VALID_TRIGGERS.includes(body.greeting_type)
    ? body.greeting_type
    : 'regular';

  try {
    const { rows: bizRows } = await pool.query(
      `SELECT name, category FROM businesses WHERE id = $1`,
      [req.business.id]
    );
    const { rows: settingsRows } = await pool.query(
      `INSERT INTO business_loyalty_settings (business_id)
       VALUES ($1)
       ON CONFLICT (business_id) DO UPDATE SET updated_at = business_loyalty_settings.updated_at
       RETURNING points_per_visit, greeting_tone, giphy_api_key`,
      [req.business.id]
    );

    const business = bizRows[0] || { name: 'Your business', category: 'shop' };
    const settings = settingsRows[0];

    const command = await buildGreetingCommand(pool, {
      business_id:       req.business.id,
      business_name:     business.name,
      business_category: business.category,
      first_name:        typeof body.first_name === 'string' ? body.first_name : 'Emma',
      visit_number:      typeof body.visit_number === 'number' ? body.visit_number : 7,
      greeting_type:     greetingType,
      tone:              settings.greeting_tone,
      giphy_api_key:     settings.giphy_api_key,
      points_awarded:    settings.points_per_visit,
      total_points:      settings.points_per_visit * 7,
      last_visit_text:   '3 days ago',
    });

    return res.status(200).json({ success: true, command });
  } catch (err) {
    console.error('[loyalty/preview-greeting]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Preview failed.' });
  }
});

module.exports = router;
