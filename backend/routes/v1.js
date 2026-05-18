'use strict';

/**
 * routes/v1.js — External API v1
 *
 * All routes require API key authentication via X-API-Key header.
 * Scopes control access to individual endpoints.
 * Rate limited to 100 req/min per key.
 *
 * Mounted at /api/v1 in src/index.js.
 */

const { Router } = require('express');
const { query, param } = require('express-validator');

const pool = require('../db/pool');
const {
  authenticateApiKey,
  requireScope,
  apiRateLimiter,
  apiError,
  apiSuccess,
} = require('../middleware/apiAuth');

const router = Router();

// ---------------------------------------------------------------------------
// Discount label formatter
// ---------------------------------------------------------------------------

function discountLabel(offer) {
  switch (offer.offer_type) {
    case 'percentage':
      return offer.discount_percent ? `${Math.round(offer.discount_percent)}% OFF` : null;
    case 'fixed':
    case 'fixed_price':
      return offer.offer_price != null ? `£${parseFloat(offer.offer_price).toFixed(2)}` : null;
    case 'free_item':
    case 'gift_with_purchase':
      return 'FREE GIFT';
    case 'bogo':
    case 'buy_one_get_one':
      return '2 FOR 1';
    case 'free_delivery':
      return 'FREE DELIVERY';
    case 'custom':
      return offer.discount_label || offer.description || null;
    default:
      return null;
  }
}

function enrichOffer(offer) {
  if (!offer) return null;
  return { ...offer, discount_label: discountLabel(offer) };
}

// All v1 routes: authenticate → rate limit
router.use(authenticateApiKey);
router.use(apiRateLimiter);

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

function validate(req, res) {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    apiError(res, 400, 'validation_error', errors.array()[0].msg);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /api/v1/stats
// Scope: stats:read
// ---------------------------------------------------------------------------

router.get(
  '/stats',
  requireScope('stats:read'),
  [
    query('period').optional().isIn(['7d', '30d', '90d']).withMessage('period must be 7d, 30d, or 90d'),
    query('trigger_source').optional().isIn(['kilo_iot', 'stamplify', 'manual', 'all']).withMessage('Invalid trigger_source'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    const bizId  = req.apiKey.businessId;
    const period = req.query.period || '30d';
    const source = req.query.trigger_source || 'all';

    const days = parseInt(period, 10);
    const interval = `${days} days`;

    const sourceFilter = source !== 'all'
      ? 'AND o.trigger_source = $2'
      : '';
    const params = source !== 'all' ? [bizId, source] : [bizId];

    try {
      // ── Offer counts ───────────────────────────────────────
      const offerQ = await pool.query(
        `SELECT
           COUNT(*)::int                                          AS total_offers,
           COUNT(*) FILTER (WHERE o.is_active = true)::int        AS active_offers,
           COALESCE(SUM(o.view_count), 0)::int                    AS total_views,
           COALESCE(SUM(o.current_redemptions), 0)::int           AS total_redemptions,
           COALESCE(SUM(o.share_count), 0)::int                   AS total_shares
         FROM offers o
         WHERE o.business_id = $1
           AND o.created_at >= NOW() - INTERVAL '${interval}'
           ${sourceFilter}`,
        params
      );
      const s = offerQ.rows[0];

      const redemptionRate = s.total_views > 0
        ? ((s.total_redemptions / s.total_views) * 100).toFixed(1) + '%'
        : '0.0%';

      // ── Top performing offer ───────────────────────────────
      const topQ = await pool.query(
        `SELECT id, title, description, category, offer_type,
                original_price, offer_price, discount_percent,
                current_redemptions, view_count, share_count,
                is_active, starts_at, expires_at, created_at,
                trigger_source, external_ref
         FROM offers
         WHERE business_id = $1
           AND created_at >= NOW() - INTERVAL '${interval}'
         ORDER BY current_redemptions DESC
         LIMIT 1`,
        [bizId]
      );

      // ── Busiest day & hour from coupons ────────────────────
      const dayQ = await pool.query(
        `SELECT LOWER(TO_CHAR(c.redeemed_at, 'day')) AS day_name,
                COUNT(*)::int AS cnt
         FROM coupons c
         JOIN offers o ON o.id = c.offer_id
         WHERE o.business_id = $1
           AND c.status = 'redeemed'
           AND c.redeemed_at >= NOW() - INTERVAL '${interval}'
         GROUP BY day_name
         ORDER BY cnt DESC
         LIMIT 1`,
        [bizId]
      );

      const hourQ = await pool.query(
        `SELECT TO_CHAR(c.redeemed_at, 'HH24:00') AS hour_label,
                COUNT(*)::int AS cnt
         FROM coupons c
         JOIN offers o ON o.id = c.offer_id
         WHERE o.business_id = $1
           AND c.status = 'redeemed'
           AND c.redeemed_at >= NOW() - INTERVAL '${interval}'
         GROUP BY hour_label
         ORDER BY cnt DESC
         LIMIT 1`,
        [bizId]
      );

      // ── Breakdown by trigger source ────────────────────────
      const triggerQ = await pool.query(
        `SELECT
           COALESCE(o.trigger_source, 'manual') AS source,
           COUNT(*)::int                        AS offers,
           COALESCE(SUM(o.current_redemptions), 0)::int AS redemptions
         FROM offers o
         WHERE o.business_id = $1
           AND o.created_at >= NOW() - INTERVAL '${interval}'
         GROUP BY source
         ORDER BY source`,
        [bizId]
      );

      const byTriggerSource = {};
      for (const row of triggerQ.rows) {
        byTriggerSource[row.source] = {
          offers: row.offers,
          redemptions: row.redemptions,
        };
      }

      return apiSuccess(res, {
        period,
        total_offers:         s.total_offers,
        active_offers:        s.active_offers,
        total_views:          s.total_views,
        total_redemptions:    s.total_redemptions,
        total_shares:         s.total_shares,
        avg_redemption_rate:  redemptionRate,
        top_performing_offer: enrichOffer(topQ.rows[0]),
        busiest_day:          dayQ.rows[0]?.day_name?.trim() || null,
        busiest_hour:         hourQ.rows[0]?.hour_label || null,
        by_trigger_source:    byTriggerSource,
      });
    } catch (err) {
      console.error('[api/v1/stats]', err);
      return apiError(res, 500, 'server_error', 'Failed to fetch stats.');
    }
  }
);

module.exports = router;
