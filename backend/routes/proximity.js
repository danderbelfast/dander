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
const {
  awardPointsAndAdvance, checkRewardUnlocks, checkCollectableUnlocks,
} = require('../services/loyaltyMechanics');
const nodeWs = require('../ws/nodes');
const { pushToBusiness } = require('../lib/wsPush');
const adAttribution = require('../services/adAttribution');
const rewardTiers = require('../services/rewardTiers');

/**
 * True iff `dob` (Date or YYYY-MM-DD string) shares its month-day with
 * today (server local time — close enough for the kiosk use case).
 */
function isBirthdayToday(dob) {
  if (!dob) return false;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate();
}

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
      `SELECT id, first_name, email, display_preference, date_of_birth, birthday_sharing
         FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'User not found.' });
    }
    const user = userRows[0];
    const anonymous = user.display_preference === 'anonymous';

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

    // ── 3. Recent-visit check ─────────────────────────────────
    // TODO: change back to UTC day check before production
    const { rows: todayRows } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM customer_visits
        WHERE business_id = $1
          AND user_id = $2
          AND visited_at > NOW() - INTERVAL '1 minute'`,
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
    else if (user.birthday_sharing && isBirthdayToday(user.date_of_birth)) greetingType = 'birthday';
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

    // Anonymous users get a generic command — no name, no personalised
    // milestones. Points/visits are tracked normally; only the display
    // payload changes.
    const effectiveGreetingType = anonymous ? 'regular' : greetingType;
    const command = await buildGreetingCommand(pool, {
      business_id:       businessId,
      business_name:     business.name,
      business_category: business.category,
      first_name:        anonymous ? 'A loyal customer' : user.first_name,
      visit_number:      visitNumber,
      greeting_type:     effectiveGreetingType,
      tone:              settings.greeting_tone,
      giphy_api_key:     settings.giphy_api_key,
      points_awarded:    pointsAwarded,
      total_points:      newPointsTotal,
      last_visit_text:   lastVisitText,
    });
    if (anonymous) {
      command.customer_name = 'A loyal customer';
      command.message = 'A loyal customer just checked in! 🎉';
    }

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

// ---------------------------------------------------------------------------
// POST /api/proximity/nfc-checkin
//
// The user app calls this when an NFC tap on a Dander Node phone resolved
// to its in-app handler. Logic mirrors /detected but adds the streak +
// tier + reward + collectable layer from services/loyaltyMechanics.
// ---------------------------------------------------------------------------

router.post('/nfc-checkin', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const nodeDeviceId = typeof body.node_device_id === 'string' ? body.node_device_id.slice(0, 100) : null;
  const businessId   = parseInt(body.business_id, 10);

  if (!nodeDeviceId || !Number.isFinite(businessId)) {
    return res.status(400).json({
      success: false, code: 'VALIDATION_ERROR',
      message: 'node_device_id and business_id are required.',
    });
  }

  try {
    const { rows: userRows } = await pool.query(
      `SELECT id, first_name, email, display_preference, date_of_birth, birthday_sharing
         FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (userRows.length === 0) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'User not found.' });
    const user = userRows[0];
    const anonymous = user.display_preference === 'anonymous';

    const { rows: bizRows } = await pool.query(
      'SELECT id, name, category FROM businesses WHERE id = $1', [businessId]
    );
    if (bizRows.length === 0) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Business not found.' });
    const business = bizRows[0];

    const { rows: settingsRows } = await pool.query(
      `INSERT INTO business_loyalty_settings (business_id) VALUES ($1)
       ON CONFLICT (business_id) DO UPDATE SET updated_at = business_loyalty_settings.updated_at
       RETURNING points_per_visit, greeting_tone, giphy_api_key`,
      [businessId]
    );
    const settings = settingsRows[0];

    // Already-visited-today gate, in the business's LOCAL day. Joins
    // businesses so the conversion uses this business's configured
    // timezone (default 'Europe/London'). Without the join we'd still
    // be on Etc/UTC which puts the boundary at 1am BST and reads as
    // "yesterday" for a 12:30am check-in.
    const { rows: todayRows } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM customer_visits cv
         JOIN businesses b ON b.id = cv.business_id
        WHERE cv.business_id = $1 AND cv.user_id = $2
          AND (cv.visited_at AT TIME ZONE b.timezone)::date
              = (NOW()        AT TIME ZONE b.timezone)::date`,
      [businessId, user.id]
    );
    const sameDay = todayRows[0].n > 0;

    // Read prior state for delta detection.
    const { rows: priorRows } = await pool.query(
      'SELECT points, total_visits, last_visit_at FROM business_loyalty_points WHERE business_id = $1 AND user_id = $2',
      [businessId, user.id]
    );
    const prior = priorRows[0] || { points: 0, total_visits: 0, last_visit_at: null };

    // Variable reward tier — bronze/silver/gold are rare excitement
    // moments drawn from a monthly pool; everyone else gets 'standard'.
    // Repeat-same-day taps award 0 points / 'standard' tier (no draw
    // from the pool, so a customer can't burn a gold by spam-tapping).
    let rewardTier = 'standard';
    let pointsAwarded;
    if (sameDay) {
      pointsAwarded = 0;
    } else {
      const pick = await rewardTiers.selectAndAward(pool, { businessId });
      rewardTier    = pick.reward_tier;
      pointsAwarded = pick.points_awarded;
    }

    const advance = await awardPointsAndAdvance(pool, {
      businessId, userId: user.id, pointsAwarded, samedayVisit: sameDay,
    });

    const rewardInfo = await checkRewardUnlocks(pool, {
      businessId, userId: user.id, priorPoints: prior.points, newPoints: advance.points,
    });
    const collectableInfo = await checkCollectableUnlocks(pool, {
      businessId, userId: user.id, priorVisits: prior.total_visits, newVisits: advance.total_visits,
    });

    // Greeting type (same triage as /detected).
    const daysSinceLast = prior.last_visit_at
      ? Math.floor((Date.now() - new Date(prior.last_visit_at).getTime()) / 86_400_000) : null;
    let greetingType;
    if (sameDay)                                 greetingType = 'already_visited_today';
    else if (advance.total_visits === 1)         greetingType = 'first_visit';
    else if (advance.total_visits % 100 === 0)   greetingType = 'milestone_100';
    else if (advance.total_visits % 50  === 0)   greetingType = 'milestone_50';
    else if (advance.total_visits % 10  === 0)   greetingType = 'milestone_10';
    else if (user.birthday_sharing && isBirthdayToday(user.date_of_birth)) greetingType = 'birthday';
    else if (daysSinceLast != null && daysSinceLast > 21) greetingType = 'long_absence';
    else                                          greetingType = 'regular';

    const lastVisitText = daysSinceLast == null ? 'first time'
      : daysSinceLast === 0 ? 'earlier today'
      : daysSinceLast === 1 ? 'yesterday'
      : `${daysSinceLast} days ago`;

    // Same anonymous override as /detected — see comments there.
    const effectiveGreetingType = anonymous ? 'regular' : greetingType;
    const command = await buildGreetingCommand(pool, {
      business_id:       businessId,
      business_name:     business.name,
      business_category: business.category,
      first_name:        anonymous ? 'A loyal customer' : user.first_name,
      visit_number:      advance.total_visits,
      greeting_type:     effectiveGreetingType,
      tone:              settings.greeting_tone,
      giphy_api_key:     settings.giphy_api_key,
      points_awarded:    pointsAwarded,
      total_points:      advance.points,
      last_visit_text:   lastVisitText,
    });
    if (anonymous) {
      command.customer_name = 'A loyal customer';
      command.message = 'A loyal customer just checked in! 🎉';
    }

    // Persist visit row.
    await pool.query(
      `INSERT INTO customer_visits
         (business_id, user_id, points_awarded, points_awarded_at,
          visit_number, greeting_shown, gif_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [businessId, user.id, pointsAwarded, pointsAwarded > 0 ? new Date() : null,
       advance.total_visits, command.message?.slice(0, 200) || null, command.gif_url || null]
    );

    // Push the display command to the Node — WS first, then queue.
    const pushed = nodeWs.pushDisplayCommand(nodeDeviceId, command);
    if (pushed) {
      await pool.query(
        `INSERT INTO node_display_commands (device_id, command, delivered_at)
         VALUES ($1, $2::jsonb, NOW())`,
        [nodeDeviceId, JSON.stringify(command)]
      );
    } else {
      await pool.query(
        `INSERT INTO node_display_commands (device_id, command) VALUES ($1, $2::jsonb)`,
        [nodeDeviceId, JSON.stringify(command)]
      );
    }

    // Dander Ads — promote any 'clicked' rows to 'entry_conversion'.
    // Fails open: a DB error here must not break the check-in path.
    try {
      await adAttribution.onCustomerArrived(pool, {
        userId: req.user.id,
        businessId: businessId,
      });
    } catch (e) {
      console.warn('[ads/entry-conversion] non-fatal:', e.message);
    }

    return res.status(200).json({
      success: true,
      points_awarded:        pointsAwarded,
      reward_tier:           rewardTier,
      total_points:          advance.points,
      visit_number:          advance.total_visits,
      tier:                  advance.tier,
      tier_upgraded:         advance.tier_upgraded,
      streak:                advance.current_streak,
      rewards_unlocked:      rewardInfo.rewards_unlocked,
      next_reward:           rewardInfo.next_reward,
      collectable_unlocked:  collectableInfo.collectable_unlocked,
      collectable_evolved:   collectableInfo.collectable_evolved,
      business_name:         business.name,
      delivery:              pushed ? 'websocket' : 'piggyback',
    });
  } catch (err) {
    console.error('[proximity/nfc-checkin]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'NFC check-in failed.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/proximity/till-arrive   (requireAuth)
//
// Customer taps the till NFC sticker; this fires before staff have entered
// anything. We look up the user's standing with this business and push the
// profile to the business dashboard's WebSocket room so the staff member
// sees who just tapped (name, tier, points, next reward).
//
// NO points are awarded here — points come later via /api/till/award-points
// once staff types the spend amount.
// ---------------------------------------------------------------------------

router.post('/till-arrive', requireAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const businessId = parseInt(body.business_id, 10);
  if (!Number.isFinite(businessId) || businessId <= 0) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'business_id required.' });
  }

  try {
    const { rows: bizRows } = await pool.query(
      'SELECT id, name FROM businesses WHERE id = $1 AND status = $2 LIMIT 1',
      [businessId, 'active']
    );
    if (bizRows.length === 0) {
      return res.status(404).json({ success: false, code: 'BUSINESS_NOT_FOUND' });
    }
    const business = bizRows[0];

    const userId = req.user.id;
    const { rows: userRows } = await pool.query(
      'SELECT id, first_name FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, code: 'USER_NOT_FOUND' });
    }
    const user = userRows[0];

    // Loyalty standing. No row = brand-new customer; defaults below.
    const { rows: lpRows } = await pool.query(
      `SELECT points, total_visits, current_streak, tier
         FROM business_loyalty_points
        WHERE business_id = $1 AND user_id = $2`,
      [businessId, userId]
    );
    const lp = lpRows[0] || { points: 0, total_visits: 0, current_streak: 0, tier: 'bronze' };

    // Next reward — pick the lowest-points reward they haven't earned yet.
    const { rows: rewardRows } = await pool.query(
      `SELECT id, name, points_required
         FROM loyalty_rewards
        WHERE business_id = $1
          AND is_active = TRUE
          AND points_required > $2
        ORDER BY points_required ASC
        LIMIT 1`,
      [businessId, lp.points]
    );
    const nextReward = rewardRows[0] || null;

    // Active offers for this business — drives the TillPanel "Active
    // Offers" section. The QR / code redemption path is gone; staff
    // applies these by hand and enters the post-discount amount.
    const { rows: offerRows } = await pool.query(
      `SELECT id, title, description, offer_type,
              original_price, offer_price, discount_percent, image_url,
              expires_at
         FROM offers
        WHERE business_id = $1
          AND is_active   = TRUE
          AND (starts_at  IS NULL OR starts_at  <= NOW())
          AND (expires_at IS NULL OR expires_at >  NOW())
        ORDER BY COALESCE(discount_percent, 0) DESC, created_at DESC
        LIMIT 12`,
      [businessId]
    );

    const payload = {
      user_id:        user.id,
      first_name:     user.first_name || 'Customer',
      tier:           lp.tier,
      total_points:   lp.points,
      total_visits:   lp.total_visits,
      current_streak: lp.current_streak,
      next_reward_at: nextReward ? nextReward.points_required : null,
      points_to_next: nextReward ? Math.max(0, nextReward.points_required - lp.points) : null,
      next_reward_name: nextReward ? nextReward.name : null,
      active_offers:  offerRows.map((o) => ({
        id:               o.id,
        title:            o.title,
        description:      o.description,
        offer_type:       o.offer_type,
        original_price:   o.original_price ? Number(o.original_price) : null,
        offer_price:      o.offer_price    ? Number(o.offer_price)    : null,
        discount_percent: o.discount_percent ? Number(o.discount_percent) : null,
        image_url:        o.image_url,
        expires_at:       o.expires_at,
      })),
      arrived_at:     new Date().toISOString(),
    };

    const io = req.app.get('io');
    pushToBusiness(io, businessId, 'till_customer', payload);

    return res.status(200).json({
      success: true,
      message: 'Staff notified',
      business_name: business.name,
    });
  } catch (err) {
    console.error('[proximity/till-arrive]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Till arrive failed.' });
  }
});

module.exports = router;
