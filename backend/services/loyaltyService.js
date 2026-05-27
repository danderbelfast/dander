'use strict';

const pool = require('../db/pool');

const TIER_THRESHOLDS = { bronze: 0, silver: 50, gold: 150, platinum: 500 };

function calculateTier(lifetimePoints) {
  if (lifetimePoints >= 500) return 'platinum';
  if (lifetimePoints >= 150) return 'gold';
  if (lifetimePoints >= 50) return 'silver';
  return 'bronze';
}

async function getOrCreateLoyalty(userId) {
  let { rows } = await pool.query('SELECT * FROM user_loyalty WHERE user_id = $1', [userId]);
  if (rows.length === 0) {
    ({ rows } = await pool.query(
      'INSERT INTO user_loyalty (user_id) VALUES ($1) RETURNING *', [userId]
    ));
  }
  return rows[0];
}

async function awardPoints(userId, { points, savedGbp, description, referenceType, referenceId }) {
  const loyalty = await getOrCreateLoyalty(userId);

  const newTotal = loyalty.total_points + points;
  const newLifetime = loyalty.lifetime_points + points;
  const newSaved = parseFloat(loyalty.total_saved_gbp) + (savedGbp || 0);
  const newTier = calculateTier(newLifetime);

  await pool.query(
    `UPDATE user_loyalty
     SET total_points = $1, lifetime_points = $2, total_saved_gbp = $3, tier = $4
     WHERE user_id = $5`,
    [newTotal, newLifetime, newSaved, newTier, userId]
  );

  await pool.query(
    `INSERT INTO points_transactions (user_id, type, points, description, reference_type, reference_id)
     VALUES ($1, 'earn', $2, $3, $4, $5)`,
    [userId, points, description, referenceType || null, referenceId || null]
  );

  const unlocked = await checkMilestones(userId, newSaved);

  return {
    points_earned: points,
    total_points: newTotal,
    lifetime_points: newLifetime,
    total_saved_gbp: newSaved,
    tier: newTier,
    tier_changed: newTier !== loyalty.tier,
    milestones_unlocked: unlocked,
  };
}

async function checkMilestones(userId, totalSaved) {
  const { rows: milestones } = await pool.query(
    `SELECT m.* FROM loyalty_milestones m
     WHERE m.is_active = true AND m.threshold_gbp <= $1
       AND m.id NOT IN (SELECT milestone_id FROM user_milestone_unlocks WHERE user_id = $2)
     ORDER BY m.threshold_gbp`,
    [totalSaved, userId]
  );

  const unlocked = [];
  for (const m of milestones) {
    await pool.query(
      `INSERT INTO user_milestone_unlocks (user_id, milestone_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, m.id]
    );
    unlocked.push({
      id: m.id,
      title: m.title,
      description: m.description,
      reward_type: m.reward_type,
      reward_value: m.reward_value,
    });
  }

  return unlocked;
}

async function getLoyaltyStatus(userId) {
  const loyalty = await getOrCreateLoyalty(userId);

  const [
    { rows: milestones },
    { rows: unlocks },
    { rows: wifiRows },
  ] = await Promise.all([
    pool.query(
      `SELECT * FROM loyalty_milestones WHERE is_active = true ORDER BY threshold_gbp`
    ),
    pool.query(
      `SELECT milestone_id, unlocked_at, redeemed_at FROM user_milestone_unlocks WHERE user_id = $1`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(DISTINCT bssid)::int AS wifi_today
         FROM wifi_points_log
        WHERE user_id   = $1
          AND award_day = (NOW() AT TIME ZONE 'UTC')::date`,
      [userId]
    ),
  ]);

  const unlockMap = {};
  for (const u of unlocks) unlockMap[u.milestone_id] = u;

  const totalSaved = parseFloat(loyalty.total_saved_gbp);
  const nextMilestone = milestones.find(m => parseFloat(m.threshold_gbp) > totalSaved);

  const wifiToday = wifiRows[0]?.wifi_today ?? 0;

  return {
    total_points: loyalty.total_points,
    lifetime_points: loyalty.lifetime_points,
    total_saved_gbp: totalSaved,
    tier: loyalty.tier,
    next_tier: loyalty.tier === 'platinum' ? null : Object.keys(TIER_THRESHOLDS).find(t => TIER_THRESHOLDS[t] > loyalty.lifetime_points),
    next_tier_points_needed: loyalty.tier === 'platinum' ? 0 : (TIER_THRESHOLDS[Object.keys(TIER_THRESHOLDS).find(t => TIER_THRESHOLDS[t] > loyalty.lifetime_points)] || 0) - loyalty.lifetime_points,
    // Steps — cached counters on user_loyalty, maintained by POST /api/steps.
    // Cross-device authoritative; up to ~5 min stale between client POSTs.
    steps_today:      loyalty.steps_today      || 0,
    steps_this_month: loyalty.steps_this_month || 0,
    steps_all_time:   loyalty.steps_all_time   || 0,
    // WiFi — direct count of today's distinct BSSIDs for this user.
    wifi_today:       wifiToday,
    milestones: milestones.map(m => ({
      ...m,
      threshold_gbp: parseFloat(m.threshold_gbp),
      unlocked: !!unlockMap[m.id],
      unlocked_at: unlockMap[m.id]?.unlocked_at || null,
      redeemed: !!unlockMap[m.id]?.redeemed_at,
    })),
    next_milestone: nextMilestone ? {
      title: nextMilestone.title,
      threshold_gbp: parseFloat(nextMilestone.threshold_gbp),
      remaining_gbp: parseFloat((parseFloat(nextMilestone.threshold_gbp) - totalSaved).toFixed(2)),
      progress_pct: parseFloat(((totalSaved / parseFloat(nextMilestone.threshold_gbp)) * 100).toFixed(1)),
    } : null,
  };
}

async function getHistory(userId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT * FROM points_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

module.exports = { awardPoints, getLoyaltyStatus, getHistory, getOrCreateLoyalty };
