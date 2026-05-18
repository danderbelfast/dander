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
const { enrichOffer, discountLabel } = require('../services/offerLabels');
const { generateOgImage } = require('../services/ogImageService');

const router = Router();

// ---------------------------------------------------------------------------
// PUBLIC — no auth (must be before the auth middleware)
// ---------------------------------------------------------------------------

// GET /api/v1/offers/:id/preview.png — OG image for social sharing
router.get(
  '/offers/:id/preview.png',
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    const { validationResult } = require('express-validator');
    if (!validationResult(req).isEmpty()) return res.status(400).end();

    try {
      const { rows } = await pool.query(
        `SELECT o.*, b.name AS business_name, b.logo_url AS business_logo_url
         FROM offers o JOIN businesses b ON b.id = o.business_id
         WHERE o.id = $1 AND o.is_active = true`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).end();

      const offer = rows[0];
      const badge = discountLabel(offer);
      const png   = await generateOgImage(offer, badge);

      res.set({
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      });
      return res.send(png);
    } catch (err) {
      console.error('[api/v1/offers/:id/preview.png]', err);
      return res.status(500).end();
    }
  }
);

// GET /api/v1/offers/:id/og — HTML page with OG meta tags (for crawlers)
router.get(
  '/offers/:id/og',
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    const { validationResult: vr } = require('express-validator');
    if (!vr(req).isEmpty()) return res.status(400).send('Invalid ID');

    try {
      const { rows } = await pool.query(
        `SELECT o.id, o.title, o.description, o.offer_type,
                o.discount_percent, o.offer_price, o.discount_label,
                b.name AS business_name
         FROM offers o JOIN businesses b ON b.id = o.business_id
         WHERE o.id = $1 AND o.is_active = true`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).send('Offer not found');

      const offer = rows[0];
      const badge = discountLabel(offer) || 'Deal';
      const ogTitle = `${badge} at ${offer.business_name}`;
      const ogDesc  = offer.title || '';
      const ogImage = `https://dander.io/api/v1/offers/${offer.id}/preview.png`;
      const ogUrl   = `https://dander.io/o/${offer.id}`;
      const appUrl  = `https://dander.io/offer/${offer.id}`;

      const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

      res.set('Content-Type', 'text/html');
      return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(ogTitle)}</title>
  <meta property="og:title" content="${esc(ogTitle)}">
  <meta property="og:description" content="${esc(ogDesc)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:url" content="${ogUrl}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(ogTitle)}">
  <meta name="twitter:description" content="${esc(ogDesc)}">
  <meta name="twitter:image" content="${ogImage}">
  <meta http-equiv="refresh" content="0;url=${appUrl}">
</head>
<body>
  <p>Redirecting to <a href="${appUrl}">${esc(offer.title)}</a>…</p>
</body>
</html>`);
    } catch (err) {
      console.error('[api/v1/offers/:id/og]', err);
      return res.status(500).send('Server error');
    }
  }
);

// All remaining v1 routes: authenticate → rate limit
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
