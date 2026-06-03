'use strict';

/**
 * loyaltyMechanics.js — pure logic for the post-MVP loyalty layer:
 * streaks, tiers, reward unlocks, collectable unlocks.
 *
 * Designed so the NFC check-in endpoint and the staff "award purchase
 * points" endpoint share the same award path. Every public function
 * takes a `pool` (or a client) and returns plain JSON-friendly data.
 */

const TIER_THRESHOLDS = [
  { tier: 'legend',   minVisits: 500 },
  { tier: 'obsidian', minVisits: 250 },
  { tier: 'diamond',  minVisits: 100 },
  { tier: 'platinum', minVisits: 50 },
  { tier: 'gold',     minVisits: 25 },
  { tier: 'silver',   minVisits: 10 },
  { tier: 'bronze',   minVisits: 0 },
];

function tierForVisits(visits) {
  for (const t of TIER_THRESHOLDS) if (visits >= t.minVisits) return t.tier;
  return 'bronze';
}

/**
 * Update streak based on the gap between last_visit_date and today.
 *   gap = 0      → same day, no change
 *   gap = 1      → consecutive day, +1
 *   gap > 1      → streak broken, reset to 1
 *   last = null  → first ever, set to 1
 */
function nextStreak({ current_streak, last_visit_date, today }) {
  if (!last_visit_date) return { streak: 1, broken: false, same_day: false };
  const last = new Date(last_visit_date);
  const todayDate = new Date(today);
  const ms = todayDate.getTime() - last.getTime();
  const gap = Math.floor(ms / 86_400_000);
  if (gap <= 0) return { streak: current_streak || 1, broken: false, same_day: true };
  if (gap === 1) return { streak: (current_streak || 0) + 1, broken: false, same_day: false };
  return { streak: 1, broken: true, same_day: false };
}

/**
 * Award the given number of points + bump visit + roll streak/tier.
 * Returns: { points, total_visits, current_streak, longest_streak, tier, tier_upgraded }
 *
 * Pass `samedayVisit = true` when the same UTC day already had a visit
 * (we still credit points/streak update is suppressed).
 */
async function awardPointsAndAdvance(pool, { businessId, userId, pointsAwarded, samedayVisit }) {
  // Read current state.
  const { rows: priorRows } = await pool.query(
    `SELECT points, total_visits, current_streak, longest_streak, last_visit_date, tier
       FROM business_loyalty_points
      WHERE business_id = $1 AND user_id = $2`,
    [businessId, userId]
  );
  const prior = priorRows[0] || {
    points: 0, total_visits: 0, current_streak: 0,
    longest_streak: 0, last_visit_date: null, tier: 'bronze',
  };

  const today = new Date().toISOString().slice(0, 10);
  const { streak } = samedayVisit
    ? { streak: prior.current_streak || 1 }
    : nextStreak({ current_streak: prior.current_streak, last_visit_date: prior.last_visit_date, today });

  const newTotalVisits = samedayVisit ? prior.total_visits : prior.total_visits + 1;
  const newTier        = tierForVisits(newTotalVisits);
  const tierUpgraded   = newTier !== (prior.tier || 'bronze');
  const newLongest     = Math.max(prior.longest_streak || 0, streak);
  const newPoints      = prior.points + pointsAwarded;

  const { rows } = await pool.query(
    `INSERT INTO business_loyalty_points
       (business_id, user_id, points, total_visits, last_visit_at,
        current_streak, longest_streak, last_visit_date, tier)
     VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
     ON CONFLICT (business_id, user_id) DO UPDATE
       SET points          = $3,
           total_visits    = $4,
           last_visit_at   = NOW(),
           current_streak  = $5,
           longest_streak  = $6,
           last_visit_date = $7,
           tier            = $8
     RETURNING points, total_visits, current_streak, longest_streak, tier`,
    [businessId, userId, newPoints, newTotalVisits, streak, newLongest, today, newTier]
  );

  return {
    points: rows[0].points,
    total_visits: rows[0].total_visits,
    current_streak: rows[0].current_streak,
    longest_streak: rows[0].longest_streak,
    tier: rows[0].tier,
    tier_upgraded: tierUpgraded,
  };
}

/**
 * Compute which rewards just got newly affordable and return them along
 * with the next reward the user is still working toward.
 */
async function checkRewardUnlocks(pool, { businessId, userId, priorPoints, newPoints }) {
  const { rows: allRewards } = await pool.query(
    `SELECT id, name, description, points_required, reward_type, emoji
       FROM loyalty_rewards
      WHERE business_id = $1 AND is_active = TRUE
      ORDER BY points_required ASC`,
    [businessId]
  );

  const newlyUnlocked = allRewards.filter(r =>
    priorPoints < r.points_required && newPoints >= r.points_required
  );

  const nextReward = allRewards.find(r => newPoints < r.points_required) || null;

  return {
    rewards_unlocked: newlyUnlocked,
    next_reward: nextReward
      ? { id: nextReward.id, name: nextReward.name, emoji: nextReward.emoji,
          points_needed: nextReward.points_required - newPoints }
      : null,
  };
}

/**
 * Unlock the business collectable when total_visits crosses unlock_visits,
 * and evolve it when total_visits crosses evolved_visits.
 */
async function checkCollectableUnlocks(pool, { businessId, userId, priorVisits, newVisits }) {
  const { rows: collRows } = await pool.query(
    'SELECT id, name, emoji, rarity, unlock_visits, evolved_emoji, evolved_name, evolved_visits FROM business_collectables WHERE business_id = $1',
    [businessId]
  );
  if (collRows.length === 0) return { collectable_unlocked: null, collectable_evolved: null };
  const c = collRows[0];

  let unlocked = null;
  let evolved  = null;

  // Initial unlock — cross the unlock_visits threshold.
  if (priorVisits < c.unlock_visits && newVisits >= c.unlock_visits) {
    const { rows } = await pool.query(
      `INSERT INTO user_collectables (user_id, business_id, collectable_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, business_id) DO NOTHING
       RETURNING id`,
      [userId, businessId, c.id]
    );
    if (rows.length > 0) {
      unlocked = { id: c.id, name: c.name, emoji: c.emoji, rarity: c.rarity };
    }
  }

  // Evolution — cross evolved_visits with the collectable already owned.
  if (c.evolved_visits && c.evolved_emoji && priorVisits < c.evolved_visits && newVisits >= c.evolved_visits) {
    const { rowCount } = await pool.query(
      `UPDATE user_collectables
         SET is_evolved = TRUE, evolved_at = NOW()
       WHERE user_id = $1 AND business_id = $2 AND is_evolved = FALSE`,
      [userId, businessId]
    );
    if (rowCount > 0) {
      evolved = { id: c.id, name: c.evolved_name || c.name, emoji: c.evolved_emoji, rarity: c.rarity };
    }
  }

  return { collectable_unlocked: unlocked, collectable_evolved: evolved };
}

module.exports = {
  tierForVisits,
  nextStreak,
  awardPointsAndAdvance,
  checkRewardUnlocks,
  checkCollectableUnlocks,
  TIER_THRESHOLDS,
};
