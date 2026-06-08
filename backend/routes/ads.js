// ============================================================
//  /api/ads — ad surface + click tracking.
//
//  POST /:id/click  (requireAuth)
//    Records the click as the start of an attribution chain. The
//    subsequent entry-conversion / qualified-sale transitions happen
//    inside routes/proximity.js (nfc-checkin) and routes/till.js
//    (award-points) via services/adAttribution.js.
//
//  GET /conversions (requireBusiness)
//    Per-ad funnel rollup for the dashboard's /conversions page.
//    Click → entry-visit → qualified sale, plus commission accrued.
// ============================================================

const { Router } = require('express');
const pool = require('../db/pool');
const { requireAuth, requireBusiness } = require('../middleware/auth');

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/ads/:id/click
// ---------------------------------------------------------------------------

router.post('/:id/click', requireAuth, async (req, res) => {
  const adId = parseInt(req.params.id, 10);
  if (!Number.isFinite(adId) || adId <= 0) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'invalid ad id.' });
  }

  try {
    const { rows: adRows } = await pool.query(
      'SELECT id, business_id, is_active, expires_at FROM ads WHERE id = $1 LIMIT 1',
      [adId]
    );
    if (adRows.length === 0) {
      return res.status(404).json({ success: false, code: 'AD_NOT_FOUND' });
    }
    const ad = adRows[0];
    if (!ad.is_active || (ad.expires_at && new Date(ad.expires_at) < new Date())) {
      return res.status(410).json({ success: false, code: 'AD_INACTIVE' });
    }

    await pool.query(
      `INSERT INTO ad_clicks (ad_id, user_id, business_id, status)
       VALUES ($1, $2, $3, 'clicked')`,
      [adId, req.user.id, ad.business_id]
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[ads/click]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to record click.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/ads/conversions
// ---------------------------------------------------------------------------

router.get('/conversions', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         a.id                                                AS ad_id,
         a.title                                             AS ad_title,
         a.is_active,
         COUNT(ac.id)                                        AS clicks,
         COUNT(*) FILTER (WHERE ac.status IN ('entry_conversion','qualified_sale')) AS entry_conversions,
         COUNT(*) FILTER (WHERE ac.status = 'qualified_sale') AS qualified_sales,
         COALESCE(SUM(ac.sale_amount), 0)                     AS sale_value_total,
         COALESCE(SUM(ac.commission_amount), 0)               AS commission_tracked
       FROM ads a
       LEFT JOIN ad_clicks ac ON ac.ad_id = a.id
       WHERE a.business_id = $1
       GROUP BY a.id, a.title, a.is_active
       ORDER BY a.created_at DESC`,
      [req.business.id]
    );

    const ads = rows.map((r) => {
      const clicks       = Number(r.clicks)            || 0;
      const entries      = Number(r.entry_conversions) || 0;
      const sales        = Number(r.qualified_sales)   || 0;
      const saleValue    = Number(r.sale_value_total)  || 0;
      const commission   = Number(r.commission_tracked)|| 0;
      const click2visit  = clicks  > 0 ? entries / clicks  : 0;
      const visit2sale   = entries > 0 ? sales   / entries : 0;
      return {
        ad_id:              r.ad_id,
        ad_title:           r.ad_title,
        is_active:          r.is_active,
        clicks,
        entry_conversions:  entries,
        qualified_sales:    sales,
        sale_value_total:   saleValue,
        commission_tracked: commission,
        click_to_visit:     Math.round(click2visit * 10000) / 100,  // %
        visit_to_sale:      Math.round(visit2sale  * 10000) / 100,  // %
      };
    });

    return res.status(200).json({ success: true, ads });
  } catch (err) {
    console.error('[ads/conversions]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load conversions.' });
  }
});

module.exports = router;
