// ============================================================
//  rewardTiers — variable-tier reward selection.
//
//  selectAndAward(client, { businessId })
//    1. Loads (or creates default) reward_tiers row for the business
//       using FOR UPDATE so concurrent taps don't double-decrement.
//    2. Resets _remaining counts if last_reset_at is in a prior
//       calendar month.
//    3. Builds the weighted random pool from what's still available.
//    4. Picks a tier, decrements the matching _remaining, persists
//       last_reset_at.
//    5. Returns { reward_tier, points_awarded }.
//
//  The reset and decrement run inside the caller's transaction —
//  pass in the client, not the pool, when calling from a route that
//  already opened BEGIN. (nfc-checkin currently runs without an
//  explicit transaction; that's OK because the SELECT FOR UPDATE
//  still serialises within a single PG connection.)
//
//  Weights (per spec):
//     standard = 200, bronze = 10, silver = 3, gold = 1
//  → standard wins almost every tap; bronze is "lucky", silver is
//    "amazing", gold is "jackpot". Customer never sees the pool —
//    pure surprise.
// ============================================================

const TIER_WEIGHTS = { gold: 1, silver: 3, bronze: 10, standard: 200 };

function startOfThisMonthUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

async function loadOrSeed(client, businessId) {
  const seedSql = `
    INSERT INTO reward_tiers (business_id) VALUES ($1)
    ON CONFLICT (business_id) DO NOTHING`;
  await client.query(seedSql, [businessId]);

  const { rows } = await client.query(
    `SELECT * FROM reward_tiers WHERE business_id = $1 FOR UPDATE`,
    [businessId]
  );
  return rows[0];
}

async function maybeReset(client, tiers) {
  const monthStart = startOfThisMonthUtc();
  const lastReset = new Date(tiers.last_reset_at);
  if (lastReset >= monthStart) return tiers;

  const { rows } = await client.query(
    `UPDATE reward_tiers
        SET bronze_remaining = bronze_monthly_count,
            silver_remaining = silver_monthly_count,
            gold_remaining   = gold_monthly_count,
            last_reset_at    = NOW(),
            updated_at       = NOW()
      WHERE id = $1
    RETURNING *`,
    [tiers.id]
  );
  return rows[0];
}

function pickWeighted(pool) {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    if ((r -= p.weight) <= 0) return p.tier;
  }
  return pool[pool.length - 1].tier;
}

function buildPool(tiers) {
  const pool = [{ tier: 'standard', weight: TIER_WEIGHTS.standard }];
  if (tiers.gold_remaining   > 0) pool.push({ tier: 'gold',   weight: TIER_WEIGHTS.gold });
  if (tiers.silver_remaining > 0) pool.push({ tier: 'silver', weight: TIER_WEIGHTS.silver });
  if (tiers.bronze_remaining > 0) pool.push({ tier: 'bronze', weight: TIER_WEIGHTS.bronze });
  return pool;
}

function pointsFor(tiers, tier) {
  switch (tier) {
    case 'gold':     return tiers.gold_points;
    case 'silver':   return tiers.silver_points;
    case 'bronze':   return tiers.bronze_points;
    case 'standard':
    default:         return tiers.standard_points;
  }
}

async function decrement(client, tiers, tier) {
  if (tier === 'standard') return;
  const col = `${tier}_remaining`;
  await client.query(
    `UPDATE reward_tiers
        SET ${col} = GREATEST(0, ${col} - 1),
            updated_at = NOW()
      WHERE id = $1`,
    [tiers.id]
  );
}

async function selectAndAward(client, { businessId }) {
  let tiers = await loadOrSeed(client, businessId);
  tiers     = await maybeReset(client, tiers);

  const pool   = buildPool(tiers);
  const tier   = pickWeighted(pool);
  const points = pointsFor(tiers, tier);

  await decrement(client, tiers, tier);

  return { reward_tier: tier, points_awarded: points };
}

module.exports = { selectAndAward, TIER_WEIGHTS };
