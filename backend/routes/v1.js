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
const { query, param, body } = require('express-validator');
const crypto = require('crypto');

const pool = require('../db/pool');
const {
  authenticateApiKey,
  requireScope,
  apiRateLimiter,
  apiError,
  apiSuccess,
  hashKey,
} = require('../middleware/apiAuth');
const { enrichOffer, discountLabel } = require('../services/offerLabels');
const { generateOgImage } = require('../services/ogImageService');
const { testUrl, VALID_EVENTS } = require('../services/webhookService');
const { assessPhoto, getHistory: getSmartHistory } = require('../services/smartSpecialsService');
const config = require('../src/config');
const { generateDailyInsights } = require('../services/insightsService');
const { upload, processImage } = require('../middleware/upload');

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
                o.discount_percent, o.offer_price,
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
      const ogImage = `${config.API_PUBLIC_URL}/api/v1/offers/${offer.id}/preview.png`;
      const ogUrl   = `${config.USER_APP_URL}/o/${offer.id}`;
      // Forward the incoming query (e.g. ?src=social_facebook) onto the redirect
      // target so attribution survives the OG hop to the SPA offer page.
      const qs = new URLSearchParams(req.query).toString();
      const appUrl  = `${config.USER_APP_URL}/offer/${offer.id}${qs ? `?${qs}` : ''}`;

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

// POST /api/v1/offers/:id/share — increment share_count + dispatch event (no auth)
router.post(
  '/offers/:id/share',
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    const { validationResult: vr } = require('express-validator');
    if (!vr(req).isEmpty()) return res.status(400).json({ error: 'invalid_id' });

    try {
      const { rows } = await pool.query(
        `UPDATE offers SET share_count = share_count + 1
         WHERE id = $1 AND is_active = true
         RETURNING id, business_id, title, share_count`,
        [req.params.id]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'not_found' });

      const { dispatchEvent } = require('../services/webhookService');
      dispatchEvent(rows[0].business_id, 'offer.shared', rows[0]);

      return res.json({ data: { share_count: rows[0].share_count } });
    } catch (err) {
      console.error('[api/v1/offers/:id/share]', err);
      return res.status(500).json({ error: 'server_error' });
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

// ---------------------------------------------------------------------------
// POST /api/v1/webhooks — register a new webhook
// Scope: webhooks:write
// ---------------------------------------------------------------------------

router.post(
  '/webhooks',
  requireScope('webhooks:write'),
  [
    body('url').isURL({ require_protocol: true }).withMessage('url must be a valid HTTPS URL.'),
    body('events').isArray({ min: 1 }).withMessage('events must be a non-empty array.'),
    body('events.*').isIn([...VALID_EVENTS, 'all']).withMessage(`events must be one of: ${VALID_EVENTS.join(', ')}, all`),
    body('secret').isString().isLength({ min: 16, max: 64 }).withMessage('secret must be 16–64 characters.'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    const { url, events, secret } = req.body;
    const bizId = req.apiKey.businessId;

    const reachable = await testUrl(url);
    if (!reachable) {
      return apiError(res, 422, 'url_unreachable',
        'The webhook URL did not return a 2xx response to a test POST.');
    }

    try {
      const secretHash = hashKey(secret);
      const { rows } = await pool.query(
        `INSERT INTO webhooks (business_id, url, events, secret_hash)
         VALUES ($1, $2, $3, $4) RETURNING id, url, events, is_active, created_at`,
        [bizId, url, events, secretHash]
      );
      return apiSuccess(res, rows[0], 201);
    } catch (err) {
      console.error('[api/v1/webhooks POST]', err);
      return apiError(res, 500, 'server_error', 'Failed to register webhook.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/webhooks — list all webhooks for this business
// Scope: webhooks:write
// ---------------------------------------------------------------------------

router.get(
  '/webhooks',
  requireScope('webhooks:write'),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, url, events, is_active, created_at
         FROM webhooks
         WHERE business_id = $1
         ORDER BY created_at DESC`,
        [req.apiKey.businessId]
      );
      return apiSuccess(res, rows);
    } catch (err) {
      console.error('[api/v1/webhooks GET]', err);
      return apiError(res, 500, 'server_error', 'Failed to list webhooks.');
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/webhooks/:id — soft delete (set is_active = false)
// Scope: webhooks:write
// ---------------------------------------------------------------------------

router.delete(
  '/webhooks/:id',
  requireScope('webhooks:write'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid webhook ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rowCount } = await pool.query(
        `UPDATE webhooks SET is_active = false
         WHERE id = $1 AND business_id = $2`,
        [req.params.id, req.apiKey.businessId]
      );
      if (rowCount === 0) {
        return apiError(res, 404, 'not_found', 'Webhook not found.');
      }
      return apiSuccess(res, { id: parseInt(req.params.id, 10), is_active: false });
    } catch (err) {
      console.error('[api/v1/webhooks DELETE]', err);
      return apiError(res, 500, 'server_error', 'Failed to delete webhook.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/webhooks/:id/deliveries — last 50 delivery attempts
// Scope: webhooks:write
// ---------------------------------------------------------------------------

router.get(
  '/webhooks/:id/deliveries',
  requireScope('webhooks:write'),
  [param('id').isInt({ min: 1 }).withMessage('Invalid webhook ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rows: hook } = await pool.query(
        'SELECT 1 FROM webhooks WHERE id = $1 AND business_id = $2',
        [req.params.id, req.apiKey.businessId]
      );
      if (hook.length === 0) {
        return apiError(res, 404, 'not_found', 'Webhook not found.');
      }

      const { rows } = await pool.query(
        `SELECT id, event_type, response_status, response_body,
                attempt_number, delivered_at
         FROM webhook_deliveries
         WHERE webhook_id = $1
         ORDER BY delivered_at DESC
         LIMIT 50`,
        [req.params.id]
      );
      return apiSuccess(res, rows);
    } catch (err) {
      console.error('[api/v1/webhooks deliveries GET]', err);
      return apiError(res, 500, 'server_error', 'Failed to fetch deliveries.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/weather/correlation — weather vs footfall correlation
// Scope: stats:read
// ---------------------------------------------------------------------------

router.get(
  '/weather/correlation',
  requireScope('stats:read'),
  [
    query('days').optional().isInt({ min: 1, max: 90 }).withMessage('days must be 1–90'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    const bizId = req.apiKey.businessId;
    const days = parseInt(req.query.days, 10) || 30;

    try {
      const { rows } = await pool.query(
        `SELECT
           wr.id              AS weather_id,
           wr.recorded_at,
           wr.temperature_c,
           wr.wind_speed_kmh,
           wr.rainfall_mm,
           wr.condition,
           COALESCE(AVG(sr.reading_value), 0)::numeric(10,1) AS footfall_count
         FROM weather_readings wr
         LEFT JOIN sensor_readings sr
           ON sr.business_id = wr.business_id
           AND sr.device_type = 'people_counter'
           AND sr.recorded_at BETWEEN wr.recorded_at AND wr.recorded_at + INTERVAL '30 minutes'
         WHERE wr.business_id = $1
           AND wr.recorded_at >= NOW() - ($2 || ' days')::interval
         GROUP BY wr.id, wr.recorded_at, wr.temperature_c, wr.wind_speed_kmh, wr.rainfall_mm, wr.condition
         ORDER BY wr.recorded_at DESC`,
        [bizId, days]
      );

      return apiSuccess(res, {
        period_days: days,
        data_points: rows.length,
        readings: rows.map(r => ({
          recorded_at:    r.recorded_at,
          temperature_c:  parseFloat(r.temperature_c),
          wind_speed_kmh: parseFloat(r.wind_speed_kmh),
          rainfall_mm:    parseFloat(r.rainfall_mm),
          condition:      r.condition,
          footfall_count: parseFloat(r.footfall_count),
        })),
      });
    } catch (err) {
      console.error('[api/v1/weather/correlation]', err);
      return apiError(res, 500, 'server_error', 'Failed to fetch weather correlation.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/v1/smart-specials/assess — upload photo, assess inventory
// Scope: smart_specials:read
// ---------------------------------------------------------------------------

const smartUpload = upload.single('photo');

router.post(
  '/smart-specials/assess',
  requireScope('smart_specials:read'),
  smartUpload,
  [
    body('offer_type').optional().isIn(['discount', 'freebie', 'urgency']),
    body('offer_value').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 100 }),
    // `labels` is accepted for backward compatibility but no longer used.
    body('labels').optional(),
  ],
  async (req, res) => {
    if (!req.file) return apiError(res, 400, 'validation_error', 'A photo is required.');

    try {
      const photoUrl = await processImage(req.file.buffer, 'offer', req.file.originalname);

      const assessment = await assessPhoto({
        businessId: req.apiKey.businessId,
        photoUrl,
        offerType:  req.body.offer_type  || 'urgency',
        offerValue: req.body.offer_value || null,
      });

      return apiSuccess(res, {
        assessment_id:        assessment.id,
        photo_url:            assessment.photo_url,
        offer_type:           assessment.offer_type,
        offer_value:          assessment.offer_value,
        suggested_title:      assessment.suggested_title,
        suggested_description:assessment.suggested_description,
        photo_summary:        assessment.photo_summary,
        confidence:           assessment.confidence,
        ai_available:         assessment.ai_available,
      }, 201);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR') {
        return apiError(res, err.status || 400, 'validation_error', err.message);
      }
      console.error('[api/v1/smart-specials/assess]', err);
      return apiError(res, 500, 'server_error', 'Failed to assess photo.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/smart-specials/history — last 30 assessments
// Scope: smart_specials:read
// ---------------------------------------------------------------------------

router.get(
  '/smart-specials/history',
  requireScope('smart_specials:read'),
  async (req, res) => {
    try {
      const history = await getSmartHistory(req.apiKey.businessId);
      return apiSuccess(res, history);
    } catch (err) {
      console.error('[api/v1/smart-specials/history]', err);
      return apiError(res, 500, 'server_error', 'Failed to fetch assessment history.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/insights/daily — AI-generated daily footfall insights
// Scope: stats:read
// ---------------------------------------------------------------------------

router.get(
  '/insights/daily',
  requireScope('stats:read'),
  [
    query('date').optional().isISO8601().withMessage('date must be YYYY-MM-DD format'),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const result = await generateDailyInsights(
        req.apiKey.businessId,
        req.query.date || null
      );
      return apiSuccess(res, result);
    } catch (err) {
      console.error('[api/v1/insights/daily]', err);
      return apiError(res, 500, 'server_error', 'Failed to generate insights.');
    }
  }
);

module.exports = router;
