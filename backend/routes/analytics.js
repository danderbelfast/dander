'use strict';

const { Router } = require('express');
const { query, validationResult } = require('express-validator');

const { requireBusiness } = require('../middleware/auth');
const analytics = require('../services/analyticsService');

const router = Router();

router.use(requireBusiness);

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}
function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

// ---------------------------------------------------------------------------
// GET /api/analytics/dashboard
// ---------------------------------------------------------------------------

router.get(
  '/dashboard',
  [
    query('from').optional().isISO8601().withMessage('from must be YYYY-MM-DD'),
    query('to').optional().isISO8601().withMessage('to must be YYYY-MM-DD'),
    query('zone').optional().isInt({ min: 1 }).withMessage('zone must be a positive integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg);

    try {
      const data = await analytics.getDashboard(req.business.id, {
        from: req.query.from,
        to: req.query.to,
        zone: req.query.zone ? parseInt(req.query.zone, 10) : null,
      });
      return ok(res, { analytics: data });
    } catch (err) {
      console.error('[analytics/dashboard]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to load analytics.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/analytics/realtime
// ---------------------------------------------------------------------------

router.get('/realtime', async (req, res) => {
  try {
    const data = await analytics.getCurrentStatus(req.business.id);
    return ok(res, { realtime: data });
  } catch (err) {
    console.error('[analytics/realtime]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to load realtime data.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/analytics/placeholder — dev only
// ---------------------------------------------------------------------------

router.post('/placeholder', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return fail(res, 403, 'FORBIDDEN', 'Placeholder data generation is disabled in production.');
  }
  try {
    const result = await analytics.generatePlaceholderData(req.business.id);
    return ok(res, result);
  } catch (err) {
    console.error('[analytics/placeholder]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to generate placeholder data.');
  }
});

// ---------------------------------------------------------------------------
// GET /api/analytics/demographics
// ---------------------------------------------------------------------------

router.get(
  '/demographics',
  [
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg);

    const bizId = req.business.id;
    const from = req.query.from || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);

    try {
      const [totals, hourlyDemo, network] = await Promise.all([
        pool.query(
          `SELECT
             COALESCE(SUM(male_count), 0)::int AS male,
             COALESCE(SUM(female_count), 0)::int AS female,
             COALESCE(SUM(adult_count), 0)::int AS adults,
             COALESCE(SUM(child_count), 0)::int AS children,
             COALESCE(SUM(staff_count), 0)::int AS staff,
             COALESCE(SUM(entries), 0)::int AS total_entries
           FROM kilo_people_counting
           WHERE business_id = $1
             AND timestamp BETWEEN $2::date AND $3::date + INTERVAL '1 day'`,
          [bizId, from, to]
        ),
        pool.query(
          `SELECT
             EXTRACT(HOUR FROM timestamp)::int AS hour,
             COALESCE(SUM(male_count), 0)::int AS male,
             COALESCE(SUM(female_count), 0)::int AS female,
             COALESCE(SUM(adult_count), 0)::int AS adults,
             COALESCE(SUM(child_count), 0)::int AS children,
             COALESCE(SUM(staff_count), 0)::int AS staff
           FROM kilo_people_counting
           WHERE business_id = $1
             AND timestamp BETWEEN $2::date AND $3::date + INTERVAL '1 day'
           GROUP BY hour ORDER BY hour`,
          [bizId, from, to]
        ),
        pool.query(
          `SELECT
             COALESCE(SUM(male_count), 0)::int AS male,
             COALESCE(SUM(female_count), 0)::int AS female,
             COALESCE(SUM(adult_count), 0)::int AS adults,
             COALESCE(SUM(child_count), 0)::int AS children,
             COUNT(DISTINCT business_id)::int AS businesses_sampled
           FROM kilo_people_counting
           WHERE business_id != $1
             AND timestamp BETWEEN $2::date AND $3::date + INTERVAL '1 day'`,
          [bizId, from, to]
        ),
      ]);

      const t = totals.rows[0];
      const n = network.rows[0];
      const totalGender = (t.male || 0) + (t.female || 0);
      const netTotalGender = (n.male || 0) + (n.female || 0);

      return ok(res, {
        demographics: {
          period: { from, to },
          totals: t,
          gender_split: {
            male_pct: totalGender > 0 ? parseFloat(((t.male / totalGender) * 100).toFixed(1)) : 0,
            female_pct: totalGender > 0 ? parseFloat(((t.female / totalGender) * 100).toFixed(1)) : 0,
          },
          hourly_breakdown: hourlyDemo.rows,
          network_comparison: {
            businesses_sampled: n.businesses_sampled || 0,
            network_male_pct: netTotalGender > 0 ? parseFloat(((n.male / netTotalGender) * 100).toFixed(1)) : null,
            network_female_pct: netTotalGender > 0 ? parseFloat(((n.female / netTotalGender) * 100).toFixed(1)) : null,
            network_adult_pct: netTotalGender > 0 ? parseFloat(((n.adults / (n.adults + n.children || 1)) * 100).toFixed(1)) : null,
          },
        },
      });
    } catch (err) {
      console.error('[analytics/demographics]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to load demographics.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/analytics/zones
// ---------------------------------------------------------------------------

const pool = require('../db/pool');

router.get(
  '/zones',
  [
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg);

    const bizId = req.business.id;
    const from = req.query.from || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const to = req.query.to || new Date().toISOString().slice(0, 10);

    try {
      const [zoneStats, configs, funnel] = await Promise.all([
        pool.query(
          `SELECT
             zone_number,
             COALESCE(SUM(entries), 0)::int AS visitors,
             COALESCE(SUM(exits), 0)::int AS exits,
             ROUND(AVG(occupancy), 1) AS avg_occupancy,
             ROUND(AVG(avg_attention_time), 1) AS avg_dwell_seconds,
             ROUND(AVG(effective_audience), 1) AS avg_effective_audience,
             MAX(occupancy)::int AS peak_occupancy,
             COALESCE(SUM(passersby), 0)::int AS passersby
           FROM kilo_people_counting
           WHERE business_id = $1
             AND timestamp BETWEEN $2::date AND $3::date + INTERVAL '1 day'
           GROUP BY zone_number ORDER BY zone_number`,
          [bizId, from, to]
        ),
        pool.query(
          `SELECT zone_number, zone_name, zone_type FROM kilo_zone_configs
           WHERE business_id = $1 AND is_active = true ORDER BY zone_number`,
          [bizId]
        ),
        pool.query(
          `SELECT
             COALESCE(SUM(entries), 0)::int AS total_entries,
             COALESCE(SUM(passersby), 0)::int AS total_passersby,
             COALESCE(SUM(CASE WHEN avg_attention_time > 120 THEN entries ELSE 0 END), 0)::int AS browsed_2min,
             COALESCE(SUM(CASE WHEN avg_attention_time > 30 THEN entries ELSE 0 END), 0)::int AS stayed_30s,
             COALESCE(SUM(CASE WHEN avg_attention_time <= 30 AND entries > 0 THEN entries ELSE 0 END), 0)::int AS bounced
           FROM kilo_people_counting
           WHERE business_id = $1
             AND timestamp BETWEEN $2::date AND $3::date + INTERVAL '1 day'
             AND zone_number = 1`,
          [bizId, from, to]
        ),
      ]);

      const configMap = {};
      for (const c of configs.rows) configMap[c.zone_number] = c;

      const ranked = [...zoneStats.rows].sort((a, b) => b.visitors - a.visitors);
      const zones = zoneStats.rows.map(z => ({
        zone_number: z.zone_number,
        zone_name: configMap[z.zone_number]?.zone_name || `Zone ${z.zone_number}`,
        zone_type: configMap[z.zone_number]?.zone_type || 'counting',
        visitors: z.visitors,
        exits: z.exits,
        avg_occupancy: parseFloat(z.avg_occupancy) || 0,
        avg_dwell_seconds: parseFloat(z.avg_dwell_seconds) || 0,
        peak_occupancy: z.peak_occupancy,
        passersby: z.passersby,
        popularity_rank: ranked.findIndex(r => r.zone_number === z.zone_number) + 1,
      }));

      const f = funnel.rows[0] || {};
      const totalEntries = f.total_entries || 0;

      const redeemed = await pool.query(
        `SELECT COUNT(*)::int AS count FROM coupons c
         JOIN offers o ON o.id = c.offer_id
         WHERE o.business_id = $1 AND c.status = 'redeemed'
           AND c.redeemed_at BETWEEN $2::date AND $3::date + INTERVAL '1 day'`,
        [bizId, from, to]
      );
      const redeemedCount = redeemed.rows[0]?.count || 0;

      const journey = {
        entry: totalEntries,
        browsed_2min: f.browsed_2min || 0,
        approached_till: Math.round(totalEntries * 0.4),
        redeemed: redeemedCount,
        bounced: f.bounced || 0,
        bounce_rate: totalEntries > 0 ? parseFloat(((f.bounced / totalEntries) * 100).toFixed(1)) : 0,
      };

      return ok(res, { zones, journey, period: { from, to } });
    } catch (err) {
      console.error('[analytics/zones]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to load zone data.');
    }
  }
);

module.exports = router;
