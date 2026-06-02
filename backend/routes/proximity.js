'use strict';

/**
 * proximity.js — user-app-facing proximity detection.
 *
 *   POST /api/proximity/detected   (requireAuth)
 *
 * The user app calls this when its background BLE scanner sees a
 * Dander Node nearby with strong RSSI. The handler decides whether
 * to award points (once-per-UTC-day per business), pulls/inserts a
 * customer_visits row, asks Claude+Giphy for a personalised greeting,
 * and enqueues a display command into node_display_commands. The
 * Node phone picks it up on its next 60s upload via the existing
 * piggy-back channel in /api/webhooks/phone-counter.
 *
 * Returns to the user app right after the visit is logged, even if
 * Claude/Giphy fail. The display command is enqueued regardless and
 * the Node just renders text-only if gif_url comes back null.
 */

const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { buildGreetingCommand } = require('../services/loyaltyGreeting');
const nodeWs = require('../ws/nodes');

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/proximity/detected
// ---------------------------------------------------------------------------

router.post('/detected', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const nodeDeviceId = typeof body.node_device_id === 'string' ? body.node_device_id.slice(0, 100) : null;
  const businessId   = parseInt(body.business_id, 10);
  const rssi         = Number.isFinite(parseInt(body.rssi, 10)) ? parseInt(body.rssi, 10) : null;

  if (!nodeDeviceId || !Number.isFinite(businessId)) {
    return res.status(400).json({
      success: false, code: 'VALIDATION_ERROR',
      message: 'node_device_id and business_id are required.',
    });
  }

  try {
    // ── 1. User + business lookup ─────────────────────────────
    const { rows: userRows } = await pool.query(
      `SELECT id, first_name, email FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'User not found.' });
    }
    const user = userRows[0];

    const { rows: bizRows } = await pool.query(
      `SELECT id, name, category FROM businesses WHERE id = $1`,
      [businessId]
    );
    if (bizRows.length === 0) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Business not found.' });
    }
    const business = bizRows[0];

    // ── 2. Loyalty settings (auto-create row if missing) ──────
    const { rows: settingsRows } = await pool.query(
      `INSERT INTO business_loyalty_settings (business_id)
       VALUES ($1)
       ON CONFLICT (business_id) DO UPDATE SET updated_at = business_loyalty_settings.updated_at
       RETURNING points_per_visit, greeting_tone, giphy_api_key`,
      [businessId]
    );
    const settings = settingsRows[0];

    // ── 3. Today-already-visited check (UTC date) ─────────────
    const { rows: todayRows } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM customer_visits
        WHERE business_id = $1
          AND user_id = $2
          AND (visited_at AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date`,
      [businessId, user.id]
    );
    const alreadyVisitedToday = todayRows[0].n > 0;

    // ── 4. Running totals + visit_number derivation ───────────
    const { rows: totalsRows } = await pool.query(
      `SELECT points, total_visits, last_visit_at
         FROM business_loyalty_points
        WHERE business_id = $1 AND user_id = $2`,
      [businessId, user.id]
    );
    const prior = totalsRows[0] || { points: 0, total_visits: 0, last_visit_at: null };

    // visit_number is the cumulative count including this visit, BUT if
    // they already visited today we don't re-increment — we surface the
    // same visit number so the dashboard shows "Visit #N — already today".
    const visitNumber = alreadyVisitedToday ? prior.total_visits : (prior.total_visits + 1);

    // ── 5. Greeting type ──────────────────────────────────────
    const lastVisitMs = prior.last_visit_at ? new Date(prior.last_visit_at).getTime() : null;
    const daysSinceLast = lastVisitMs ? Math.floor((Date.now() - lastVisitMs) / 86_400_000) : null;

    let greetingType;
    if (alreadyVisitedToday)              greetingType = 'already_visited_today';
    else if (visitNumber === 1)           greetingType = 'first_visit';
    else if (visitNumber % 100 === 0)     greetingType = 'milestone_100';
    else if (visitNumber % 50  === 0)     greetingType = 'milestone_50';
    else if (visitNumber % 10  === 0)     greetingType = 'milestone_10';
    else if (daysSinceLast != null && daysSinceLast > 21) greetingType = 'long_absence';
    else                                  greetingType = 'regular';

    const pointsAwarded = alreadyVisitedToday ? 0 : settings.points_per_visit;

    // ── 6. Persist totals + visit row ─────────────────────────
    let newPointsTotal = prior.points;
    if (!alreadyVisitedToday) {
      const { rows: upsertRows } = await pool.query(
        `INSERT INTO business_loyalty_points (business_id, user_id, points, total_visits, last_visit_at)
         VALUES ($1, $2, $3, 1, NOW())
         ON CONFLICT (business_id, user_id) DO UPDATE
           SET points        = business_loyalty_points.points + EXCLUDED.points,
               total_visits  = business_loyalty_points.total_visits + 1,
               last_visit_at = NOW()
         RETURNING points`,
        [businessId, user.id, pointsAwarded]
      );
      newPointsTotal = upsertRows[0].points;
    }

    // ── 7. Greeting payload (Claude + Giphy, all fallbacks safe) ──
    const lastVisitText = daysSinceLast == null ? 'first time'
      : daysSinceLast === 0 ? 'earlier today'
      : daysSinceLast === 1 ? 'yesterday'
      : `${daysSinceLast} days ago`;

    const command = await buildGreetingCommand(pool, {
      business_id:       businessId,
      business_name:     business.name,
      business_category: business.category,
      first_name:        user.first_name,
      visit_number:      visitNumber,
      greeting_type:     greetingType,
      tone:              settings.greeting_tone,
      giphy_api_key:     settings.giphy_api_key,
      points_awarded:    pointsAwarded,
      total_points:      newPointsTotal,
      last_visit_text:   lastVisitText,
    });

    // ── 8. Insert customer_visits + node_display_commands ─────
    await pool.query(
      `INSERT INTO customer_visits
         (business_id, user_id, points_awarded, points_awarded_at,
          visit_number, greeting_shown, gif_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        businessId, user.id, pointsAwarded,
        pointsAwarded > 0 ? new Date() : null,
        visitNumber,
        command.message?.slice(0, 200) || null,
        command.gif_url || null,
      ]
    );

    // Try the realtime push channel first. If the Node has an open
    // WebSocket we deliver instantly (<1s) and persist the command row
    // with delivered_at already set — keeps the dashboard audit trail
    // intact. If the WS is down we fall back to the existing piggy-back
    // path: the row stays undelivered and the next 60s upload picks it
    // up. NEVER break the fallback.
    const pushed = nodeWs.pushDisplayCommand(nodeDeviceId, command);
    if (pushed) {
      await pool.query(
        `INSERT INTO node_display_commands (device_id, command, delivered_at)
         VALUES ($1, $2::jsonb, NOW())`,
        [nodeDeviceId, JSON.stringify(command)]
      );
    } else {
      await pool.query(
        `INSERT INTO node_display_commands (device_id, command)
         VALUES ($1, $2::jsonb)`,
        [nodeDeviceId, JSON.stringify(command)]
      );
    }

    return res.status(200).json({
      success: true,
      greeted: true,
      already_visited: alreadyVisitedToday,
      points_awarded: pointsAwarded,
      total_points: newPointsTotal,
      visit_number: visitNumber,
      business_name: business.name,
      rssi,
      delivery: pushed ? 'websocket' : 'piggyback',
    });
  } catch (err) {
    console.error('[proximity/detected]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Proximity processing failed.' });
  }
});

module.exports = router;
