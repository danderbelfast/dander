// ============================================================
//  /api/till — staff-side endpoints for the NFC till flow.
//
//  POST /award-points  (requireBusiness)
//    Body: { user_id, amount_spent, category?, item_description? }
//    Awards Math.floor(amount_spent * 10) loyalty points to the
//    customer via the same awardPointsAndAdvance() the proximity and
//    purchase-points routes use, logs a till_transactions row, and
//    pushes confirmations to BOTH the user's room (coins animation
//    trigger) and the business's room (clear the till panel).
//
//  GET  /sales        (requireBusiness)
//    Recent till_transactions for the authenticated business. Powers
//    the dashboard's /sales page.
//
//  Points rate is intentionally distinct from the existing manual
//  purchase-points endpoint (POINTS_PER_POUND = 5) — the till flow is
//  the higher-engagement path (NFC tap + staff confirmation) so it
//  gets the bigger multiplier per the product spec.
// ============================================================

const { Router } = require('express');
const pool = require('../db/pool');
const { requireBusiness } = require('../middleware/auth');
const {
  awardPointsAndAdvance, checkRewardUnlocks, checkCollectableUnlocks,
} = require('../services/loyaltyMechanics');
const { pushToUser, pushToBusiness } = require('../lib/wsPush');
const adAttribution = require('../services/adAttribution');
const offerActivation = require('../services/offerActivation');

const router = Router();

const POINTS_PER_POUND_TILL = 10;

const ALLOWED_CATEGORIES = new Set([
  'Coffee', 'Food', 'Clothing', 'Health', 'Beauty',
  'Services', 'Entertainment', 'Home', 'Sport', 'Other',
]);

// ---------------------------------------------------------------------------
// POST /api/till/award-points
// ---------------------------------------------------------------------------

router.post('/award-points', requireBusiness, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const userId       = parseInt(body.user_id, 10);
  const amountSpent  = Number(body.amount_spent);
  const category     = typeof body.category === 'string' && ALLOWED_CATEGORIES.has(body.category)
    ? body.category
    : null;
  const itemDesc     = typeof body.item_description === 'string'
    ? body.item_description.trim().slice(0, 500) || null
    : null;
  const appliedOfferIdRaw = parseInt(body.applied_offer_id, 10);
  const appliedOfferId = Number.isFinite(appliedOfferIdRaw) && appliedOfferIdRaw > 0
    ? appliedOfferIdRaw
    : null;

  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'user_id required.' });
  }
  if (!Number.isFinite(amountSpent) || amountSpent <= 0) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'amount_spent must be positive.' });
  }

  try {
    // Confirm the customer exists before we touch loyalty tables.
    const { rows: userRows } = await pool.query(
      'SELECT id, first_name FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, code: 'USER_NOT_FOUND' });
    }
    const customer = userRows[0];

    const pointsAwarded = Math.floor(amountSpent * POINTS_PER_POUND_TILL);

    // Read prior totals so we can compute reward-unlock / collectable deltas.
    const { rows: priorRows } = await pool.query(
      'SELECT points, total_visits FROM business_loyalty_points WHERE business_id = $1 AND user_id = $2',
      [req.business.id, userId]
    );
    const prior = priorRows[0] || { points: 0, total_visits: 0 };

    // Same-day visit = true because the till flow is always a fresh tap
    // (we want points but not a duplicate visit count for the same day).
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

    // Audit row. staff_user_id = req.user.id (the dashboard user who
    // approved the award) so the sales report can show which staffer
    // rang it through.
    await pool.query(
      `INSERT INTO till_transactions
         (business_id, user_id, amount_spent, points_awarded, category, item_description, staff_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.business.id, userId, amountSpent, pointsAwarded, category, itemDesc, req.user.id]
    );

    // Dander Ads — promote any open 'entry_conversion' rows to
    // 'qualified_sale' for this (user, business) pair. Fails open.
    try {
      await adAttribution.onCustomerPurchased(pool, {
        userId,
        businessId: req.business.id,
        saleAmount: amountSpent,
      });
    } catch (e) {
      console.warn('[ads/qualified-sale] non-fatal:', e.message);
    }

    // Offer attribution — staff-tagged applied offer → qualified_sale. Strict:
    // markSaleConversion(offerId) only flips a row the customer genuinely
    // activated (status activated/entry_conversion, in-window), so a bogus id
    // matches nothing. 'None' (null) tags nothing. Fails open.
    if (appliedOfferId) {
      try {
        await offerActivation.markSaleConversion(pool, {
          userId,
          businessId: req.business.id,
          offerId: appliedOfferId,
          saleAmount: amountSpent,
        });
      } catch (e) {
        console.warn('[offers/qualified-sale] non-fatal:', e.message);
      }
    }

    // Next reward AFTER the award, so the user/business get a fresh
    // "X to go" figure.
    const { rows: nextRows } = await pool.query(
      `SELECT name, points_required
         FROM loyalty_rewards
        WHERE business_id = $1 AND is_active = TRUE AND points_required > $2
        ORDER BY points_required ASC
        LIMIT 1`,
      [req.business.id, advance.points]
    );
    const nextReward = nextRows[0] || null;

    const io = req.app.get('io');

    pushToUser(io, userId, 'points_awarded', {
      business_id:    req.business.id,
      business_name:  req.business.name,
      points_awarded: pointsAwarded,
      total_points:   advance.points,
      tier:           advance.tier,
      tier_upgraded:  advance.tier_upgraded,
      message:        `Thanks ${customer.first_name || ''}! See you soon 🎉`.trim(),
    });

    pushToBusiness(io, req.business.id, 'till_complete', {
      first_name:     customer.first_name || 'Customer',
      points_awarded: pointsAwarded,
      new_total:      advance.points,
      tier:           advance.tier,
      tier_upgraded:  advance.tier_upgraded,
      next_reward_at: nextReward ? nextReward.points_required : null,
      next_reward_name: nextReward ? nextReward.name : null,
    });

    return res.status(200).json({
      success: true,
      points_awarded:        pointsAwarded,
      new_total:             advance.points,
      tier:                  advance.tier,
      tier_upgraded:         advance.tier_upgraded,
      rewards_unlocked:      rewardInfo.rewards_unlocked,
      next_reward:           rewardInfo.next_reward,
      collectable_unlocked:  collectableInfo.collectable_unlocked,
      collectable_evolved:   collectableInfo.collectable_evolved,
    });
  } catch (err) {
    console.error('[till/award-points]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to award till points.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/till/sales
//
//   Query:
//     limit  (default 100, max 500)
//     offset (default 0)
//
//   Returns the most-recent transactions for the authenticated business.
//   First-name only for the customer column — purchase data leaves the
//   sales screen as a targeting feed; we never expose email/last name.
// ---------------------------------------------------------------------------

router.get('/sales', requireBusiness, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit, 10)  || 100, 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  try {
    const { rows } = await pool.query(
      `SELECT tt.id,
              tt.amount_spent,
              tt.points_awarded,
              tt.category,
              tt.item_description,
              tt.created_at,
              tt.user_id,
              u.first_name
         FROM till_transactions tt
         JOIN users u ON u.id = tt.user_id
        WHERE tt.business_id = $1
        ORDER BY tt.created_at DESC
        LIMIT $2 OFFSET $3`,
      [req.business.id, limit, offset]
    );

    return res.status(200).json({
      success: true,
      transactions: rows.map((r) => ({
        id:              r.id,
        amount_spent:    Number(r.amount_spent),
        points_awarded:  r.points_awarded,
        category:        r.category,
        item_description: r.item_description,
        created_at:      r.created_at,
        customer_first_name: r.first_name || 'Customer',
      })),
    });
  } catch (err) {
    console.error('[till/sales]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to list sales.' });
  }
});

module.exports = router;
