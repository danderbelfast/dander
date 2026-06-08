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
const { requireBusiness, requireAuth } = require('../middleware/auth');
const { buildGreetingCommand } = require('../services/loyaltyGreeting');
const {
  awardPointsAndAdvance, checkRewardUnlocks, checkCollectableUnlocks,
} = require('../services/loyaltyMechanics');

const TRIGGER_TYPES = new Set([
  'regular','first_visit','milestone_10','milestone_50','milestone_100',
  'long_absence','birthday','already_visited_today','stranger',
]);
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs/search';

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

// ---------------------------------------------------------------------------
// POST /api/loyalty/purchase-points
// body: { user_id, amount_spent }
// ---------------------------------------------------------------------------

router.post('/purchase-points', requireBusiness, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const userId      = parseInt(body.user_id, 10);
  const amountSpent = Number(body.amount_spent);
  if (!Number.isFinite(userId) || !Number.isFinite(amountSpent) || amountSpent <= 0) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'user_id and positive amount_spent required.' });
  }

  try {
    const { rows: settingsRows } = await pool.query(
      `INSERT INTO business_loyalty_settings (business_id) VALUES ($1)
       ON CONFLICT (business_id) DO UPDATE SET updated_at = business_loyalty_settings.updated_at
       RETURNING points_per_pound`,
      [req.business.id]
    );
    const perPound = Number(settingsRows[0].points_per_pound) || 5;
    const pointsAwarded = Math.round(amountSpent * perPound);

    // Read prior totals for reward-delta detection.
    const { rows: priorRows } = await pool.query(
      'SELECT points, total_visits FROM business_loyalty_points WHERE business_id = $1 AND user_id = $2',
      [req.business.id, userId]
    );
    const prior = priorRows[0] || { points: 0, total_visits: 0 };

    const advance = await awardPointsAndAdvance(pool, {
      businessId: req.business.id, userId, pointsAwarded, samedayVisit: true,
    });

    const rewardInfo = await checkRewardUnlocks(pool, {
      businessId: req.business.id, userId, priorPoints: prior.points, newPoints: advance.points,
    });
    const collectableInfo = await checkCollectableUnlocks(pool, {
      businessId: req.business.id, userId,
      priorVisits: prior.total_visits, newVisits: advance.total_visits,
    });

    return res.status(200).json({
      success: true,
      points_awarded:        pointsAwarded,
      total_points:          advance.points,
      tier:                  advance.tier,
      tier_upgraded:         advance.tier_upgraded,
      rewards_unlocked:      rewardInfo.rewards_unlocked,
      next_reward:           rewardInfo.next_reward,
      collectable_unlocked:  collectableInfo.collectable_unlocked,
      collectable_evolved:   collectableInfo.collectable_evolved,
    });
  } catch (err) {
    console.error('[loyalty/purchase-points]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to award points.' });
  }
});

// ---------------------------------------------------------------------------
// Reward journey CRUD (dashboard)
// ---------------------------------------------------------------------------

router.get('/rewards', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, points_required, reward_type, emoji, is_active, sort_order, created_at
         FROM loyalty_rewards
        WHERE business_id = $1
        ORDER BY points_required ASC`,
      [req.business.id]
    );
    return res.status(200).json({ success: true, rewards: rows });
  } catch (err) {
    console.error('[loyalty/rewards GET]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

router.post('/rewards', requireBusiness, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const points = parseInt(body.points_required, 10);
  const emoji = typeof body.emoji === 'string' && body.emoji.trim() ? body.emoji.trim().slice(0, 8) : '🎁';
  const description = typeof body.description === 'string' ? body.description.slice(0, 500) : null;
  const rewardType = ['freebie','discount','experience'].includes(body.reward_type) ? body.reward_type : 'freebie';
  if (!name || !Number.isFinite(points) || points <= 0) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'name + positive points_required required.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO loyalty_rewards (business_id, name, description, points_required, reward_type, emoji)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.business.id, name, description, points, rewardType, emoji]
    );
    return res.status(200).json({ success: true, reward: rows[0] });
  } catch (err) {
    console.error('[loyalty/rewards POST]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

router.put('/rewards/:id', requireBusiness, async (req, res) => {
  const id = String(req.params.id || '');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = typeof body.name === 'string' ? body.name.trim() : null;
  const points = body.points_required != null ? parseInt(body.points_required, 10) : null;
  const emoji = typeof body.emoji === 'string' ? body.emoji.slice(0, 8) : null;
  const isActive = typeof body.is_active === 'boolean' ? body.is_active : null;
  try {
    const { rows } = await pool.query(
      `UPDATE loyalty_rewards
          SET name             = COALESCE($3, name),
              points_required  = COALESCE($4, points_required),
              emoji            = COALESCE($5, emoji),
              is_active        = COALESCE($6, is_active)
        WHERE id = $1 AND business_id = $2
        RETURNING *`,
      [id, req.business.id, name, points, emoji, isActive]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, code: 'NOT_FOUND' });
    return res.status(200).json({ success: true, reward: rows[0] });
  } catch (err) {
    console.error('[loyalty/rewards PUT]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

router.delete('/rewards/:id', requireBusiness, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM loyalty_rewards WHERE id = $1 AND business_id = $2',
      [req.params.id, req.business.id]
    );
    if (rowCount === 0) return res.status(404).json({ success: false, code: 'NOT_FOUND' });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[loyalty/rewards DELETE]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// Business collectable read + edit
// ---------------------------------------------------------------------------

router.get('/collectable', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM business_collectables WHERE business_id = $1',
      [req.business.id]
    );
    return res.status(200).json({ success: true, collectable: rows[0] || null });
  } catch (err) {
    console.error('[loyalty/collectable GET]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

router.put('/collectable', requireBusiness, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = typeof body.name === 'string' ? body.name.slice(0, 80) : null;
  const emoji = typeof body.emoji === 'string' ? body.emoji.slice(0, 8) : null;
  const unlockVisits = body.unlock_visits != null ? parseInt(body.unlock_visits, 10) : null;
  const evolvedEmoji = typeof body.evolved_emoji === 'string' ? body.evolved_emoji.slice(0, 8) : null;
  const evolvedName = typeof body.evolved_name === 'string' ? body.evolved_name.slice(0, 80) : null;
  const evolvedVisits = body.evolved_visits != null ? parseInt(body.evolved_visits, 10) : null;
  try {
    const { rows } = await pool.query(
      `UPDATE business_collectables
          SET name           = COALESCE($2, name),
              emoji          = COALESCE($3, emoji),
              unlock_visits  = COALESCE($4, unlock_visits),
              evolved_emoji  = COALESCE($5, evolved_emoji),
              evolved_name   = COALESCE($6, evolved_name),
              evolved_visits = COALESCE($7, evolved_visits)
        WHERE business_id = $1
        RETURNING *`,
      [req.business.id, name, emoji, unlockVisits, evolvedEmoji, evolvedName, evolvedVisits]
    );
    return res.status(200).json({ success: true, collectable: rows[0] || null });
  } catch (err) {
    console.error('[loyalty/collectable PUT]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// User-facing summary: every business this user has loyalty data with
// ---------------------------------------------------------------------------

router.get('/user-businesses', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const { rows: lp } = await pool.query(
      `SELECT bp.business_id, b.name, b.logo_url,
              bp.points, bp.total_visits, bp.current_streak, bp.longest_streak, bp.tier
         FROM business_loyalty_points bp
         JOIN businesses b ON b.id = bp.business_id
        WHERE bp.user_id = $1
        ORDER BY bp.last_visit_at DESC NULLS LAST`,
      [userId]
    );
    return res.status(200).json({ success: true, businesses: lp });
  } catch (err) {
    console.error('[loyalty/user-businesses]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// GIF LIBRARY
// ---------------------------------------------------------------------------

// GET /api/loyalty/gifs?trigger_type=... — list business GIFs supplemented
// with globals where the business has fewer than 3 of a given trigger.
router.get('/gifs', requireBusiness, async (req, res) => {
  const trigger = typeof req.query.trigger_type === 'string' && TRIGGER_TYPES.has(req.query.trigger_type)
    ? req.query.trigger_type : null;
  try {
    const ownQ = trigger
      ? `SELECT id, gif_url, gif_id, trigger_type FROM business_gif_library
          WHERE business_id = $1 AND trigger_type = $2 AND is_active = TRUE ORDER BY created_at DESC`
      : `SELECT id, gif_url, gif_id, trigger_type FROM business_gif_library
          WHERE business_id = $1 AND is_active = TRUE ORDER BY trigger_type, created_at DESC`;
    const { rows: own } = await pool.query(ownQ, trigger ? [req.business.id, trigger] : [req.business.id]);

    // Supplement with globals where own count < 3 per trigger.
    const byTrigger = {};
    for (const r of own) (byTrigger[r.trigger_type] ||= []).push(r);

    const triggersToFill = trigger ? [trigger] : Array.from(TRIGGER_TYPES);
    const supplemented = {};
    for (const t of triggersToFill) {
      const ownCount = (byTrigger[t] || []).length;
      let rows = byTrigger[t] || [];
      if (ownCount < 3) {
        const { rows: globals } = await pool.query(
          `SELECT id, gif_url, gif_id, trigger_type FROM business_gif_library
            WHERE business_id IS NULL AND trigger_type = $1 AND is_active = TRUE
            ORDER BY created_at ASC LIMIT $2`,
          [t, 3 - ownCount]
        );
        rows = rows.concat(globals);
      }
      supplemented[t] = rows;
    }

    if (trigger) {
      return res.status(200).json({ success: true, trigger_type: trigger, gifs: supplemented[trigger] });
    }
    return res.status(200).json({ success: true, gifs: supplemented });
  } catch (err) {
    console.error('[loyalty/gifs GET]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

// POST /api/loyalty/gifs — add a GIF to the business library (max 20 per trigger).
router.post('/gifs', requireBusiness, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const gifId  = typeof body.gif_id  === 'string' ? body.gif_id.slice(0, 100) : null;
  const gifUrl = typeof body.gif_url === 'string' ? body.gif_url : null;
  const trigger = typeof body.trigger_type === 'string' && TRIGGER_TYPES.has(body.trigger_type)
    ? body.trigger_type : null;
  if (!gifId || !gifUrl || !trigger) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'gif_id, gif_url, trigger_type required.' });
  }
  try {
    const { rows: existing } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM business_gif_library
        WHERE business_id = $1 AND trigger_type = $2 AND is_active = TRUE`,
      [req.business.id, trigger]
    );
    if (existing[0].n >= 20) {
      return res.status(400).json({ success: false, code: 'LIMIT_REACHED', message: 'Max 20 GIFs per trigger.' });
    }
    const { rows } = await pool.query(
      `INSERT INTO business_gif_library (business_id, gif_url, gif_id, trigger_type, added_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.business.id, gifUrl, gifId, trigger, req.user?.id || null]
    );
    return res.status(200).json({ success: true, gif: rows[0] });
  } catch (err) {
    console.error('[loyalty/gifs POST]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

// DELETE /api/loyalty/gifs/:id — soft-delete (is_active = false).
router.delete('/gifs/:id', requireBusiness, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE business_gif_library SET is_active = FALSE
        WHERE id = $1 AND business_id = $2`,
      [req.params.id, req.business.id]
    );
    if (rowCount === 0) return res.status(404).json({ success: false, code: 'NOT_FOUND' });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[loyalty/gifs DELETE]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

// GET /api/loyalty/gifs/search?q=... — Giphy proxy so the API key stays
// server-side. Returns the top 20 PG results.
router.get('/gifs/search', requireBusiness, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'q required.' });
  const key = process.env.GIPHY_API_KEY;
  if (!key) return res.status(503).json({ success: false, code: 'GIPHY_UNCONFIGURED', message: 'Giphy not configured.' });
  try {
    const url = `${GIPHY_BASE}?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=20&rating=pg`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ success: false, code: 'GIPHY_ERROR' });
    const json = await r.json();
    const results = (json.data || []).map((g) => ({
      id: g.id,
      gif_url: g.images?.downsized_medium?.url || g.images?.original?.url || g.url,
      preview_url: g.images?.fixed_height_small?.url || g.images?.preview_gif?.url || null,
      title: g.title,
    }));
    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('[loyalty/gifs/search]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

// GET /api/loyalty/gif-cache?device_id=... — bulk cache for Dander Node.
// No auth: device_id maps to a business via phone_counter_readings, no
// secret exposed since the URLs are already-public Giphy CDN links.
router.get('/gif-cache', async (req, res) => {
  const deviceId = typeof req.query.device_id === 'string' ? req.query.device_id.slice(0, 100) : null;
  if (!deviceId) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'device_id required.' });
  try {
    const { rows: biz } = await pool.query(
      `SELECT DISTINCT business_id FROM phone_counter_readings
        WHERE device_id = $1 AND business_id IS NOT NULL
        LIMIT 1`,
      [deviceId]
    );
    const businessId = biz[0]?.business_id || null;

    const result = {};
    for (const t of TRIGGER_TYPES) {
      const params = businessId == null ? [t] : [businessId, t];
      const q = businessId == null
        ? `SELECT gif_url FROM business_gif_library WHERE business_id IS NULL AND trigger_type = $1 AND is_active = TRUE`
        : `SELECT gif_url FROM business_gif_library
            WHERE (business_id = $1 OR business_id IS NULL) AND trigger_type = $2 AND is_active = TRUE`;
      const { rows } = await pool.query(q, params);
      result[t] = rows.map((r) => r.gif_url);
    }
    return res.status(200).json({ success: true, cache: result, business_id: businessId });
  } catch (err) {
    console.error('[loyalty/gif-cache]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR' });
  }
});

// ---------------------------------------------------------------------------
// Reward tiers — variable bronze/silver/gold pool + standard baseline.
//   GET /api/loyalty/reward-tiers
//   PUT /api/loyalty/reward-tiers
// Both create the row on first hit so the dashboard can show defaults.
// ---------------------------------------------------------------------------

router.get('/reward-tiers', requireBusiness, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO reward_tiers (business_id) VALUES ($1) ON CONFLICT (business_id) DO NOTHING`,
      [req.business.id]
    );
    const { rows } = await pool.query(
      `SELECT standard_points,
              bronze_points, bronze_monthly_count, bronze_remaining,
              silver_points, silver_monthly_count, silver_remaining,
              gold_points,   gold_monthly_count,   gold_remaining,
              reset_day, last_reset_at, updated_at
         FROM reward_tiers WHERE business_id = $1`,
      [req.business.id]
    );
    return res.status(200).json({ success: true, tiers: rows[0] });
  } catch (err) {
    console.error('[loyalty/reward-tiers GET]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load tiers.' });
  }
});

router.put('/reward-tiers', requireBusiness, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const intOrNull = (v) => {
    if (v == null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };

  const sp  = intOrNull(body.standard_points);
  const bp  = intOrNull(body.bronze_points);
  const bmc = intOrNull(body.bronze_monthly_count);
  const sip = intOrNull(body.silver_points);
  const smc = intOrNull(body.silver_monthly_count);
  const gp  = intOrNull(body.gold_points);
  const gmc = intOrNull(body.gold_monthly_count);

  if (sp != null && (sp < 10 || sp > 50)) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'standard_points must be 10–50.' });
  }
  for (const [name, v] of [['bronze_points', bp], ['silver_points', sip], ['gold_points', gp]]) {
    if (v != null && (v <= 0 || v > 100_000)) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `${name} out of range.` });
    }
  }
  for (const [name, v] of [['bronze_monthly_count', bmc], ['silver_monthly_count', smc], ['gold_monthly_count', gmc]]) {
    if (v != null && (v < 0 || v > 1000)) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `${name} out of range.` });
    }
  }

  try {
    await pool.query(
      `INSERT INTO reward_tiers (business_id) VALUES ($1) ON CONFLICT (business_id) DO NOTHING`,
      [req.business.id]
    );
    // _remaining is NOT updated when _monthly_count grows mid-month —
    // the new cap takes effect at the next month boundary. If
    // _monthly_count is REDUCED below _remaining, clamp _remaining
    // to the new cap so a future tap can't draw past it.
    const { rows } = await pool.query(
      `UPDATE reward_tiers
          SET standard_points       = COALESCE($2, standard_points),
              bronze_points         = COALESCE($3, bronze_points),
              bronze_monthly_count  = COALESCE($4, bronze_monthly_count),
              bronze_remaining      = LEAST(bronze_remaining, COALESCE($4, bronze_monthly_count)),
              silver_points         = COALESCE($5, silver_points),
              silver_monthly_count  = COALESCE($6, silver_monthly_count),
              silver_remaining      = LEAST(silver_remaining, COALESCE($6, silver_monthly_count)),
              gold_points           = COALESCE($7, gold_points),
              gold_monthly_count    = COALESCE($8, gold_monthly_count),
              gold_remaining        = LEAST(gold_remaining, COALESCE($8, gold_monthly_count)),
              updated_at            = NOW()
        WHERE business_id = $1
      RETURNING standard_points,
                bronze_points, bronze_monthly_count, bronze_remaining,
                silver_points, silver_monthly_count, silver_remaining,
                gold_points,   gold_monthly_count,   gold_remaining,
                reset_day, last_reset_at, updated_at`,
      [req.business.id, sp, bp, bmc, sip, smc, gp, gmc]
    );
    return res.status(200).json({ success: true, tiers: rows[0] });
  } catch (err) {
    console.error('[loyalty/reward-tiers PUT]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to update tiers.' });
  }
});

module.exports = router;
