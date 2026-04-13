'use strict';

const pool = require('../db/pool');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateParams(from, to) {
  const f = from || '1970-01-01';
  const t = to   || '2099-12-31';
  return [f, t];
}

// ---------------------------------------------------------------------------
// Business-level profit
// ---------------------------------------------------------------------------

async function getBusinessROI(businessId, { from, to } = {}) {
  const [f, t] = dateParams(from, to);

  const { rows } = await pool.query(`
    SELECT
      COUNT(DISTINCT o.id) FILTER (WHERE o.cost_price IS NOT NULL AND o.offer_price IS NOT NULL)
        AS offers_with_pricing,
      COUNT(c.id)           AS total_redemptions,
      COALESCE(SUM(o.offer_price), 0)                                 AS total_revenue,
      COALESCE(SUM(o.cost_price), 0)                                  AS total_cost,
      COALESCE(SUM(o.offer_price - o.cost_price), 0)                  AS total_profit
    FROM coupons c
    JOIN offers o ON o.id = c.offer_id
    WHERE o.business_id = $1
      AND c.status = 'redeemed'
      AND c.redeemed_at >= $2::date
      AND c.redeemed_at <  ($3::date + INTERVAL '1 day')
      AND o.cost_price IS NOT NULL
      AND o.offer_price IS NOT NULL
  `, [businessId, f, t]);

  const r = rows[0] || {};
  const redemptions = parseInt(r.total_redemptions || 0, 10);
  const revenue     = parseFloat(r.total_revenue  || 0);
  const cost        = parseFloat(r.total_cost     || 0);
  const profit      = parseFloat(r.total_profit   || 0);

  return {
    offers_with_pricing: parseInt(r.offers_with_pricing || 0, 10),
    total_redemptions:   redemptions,
    total_revenue:       revenue,
    total_cost:          cost,
    total_profit:        profit,
    avg_profit_per_redemption: redemptions > 0 ? profit / redemptions : 0,
  };
}

async function getOfferProfitTable(businessId, { from, to } = {}) {
  const [f, t] = dateParams(from, to);

  const { rows } = await pool.query(`
    SELECT
      o.id, o.title, o.cost_price, o.offer_price, o.selling_price, o.is_active,
      COUNT(c.id)::int                                                        AS redemptions,
      COALESCE(SUM(o.offer_price), 0)::numeric(12,2)                         AS revenue,
      COALESCE(SUM(o.cost_price), 0)::numeric(12,2)                          AS cost,
      COALESCE(SUM(o.offer_price - o.cost_price), 0)::numeric(12,2)          AS gross_profit
    FROM offers o
    LEFT JOIN coupons c ON c.offer_id = o.id
      AND c.status = 'redeemed'
      AND c.redeemed_at >= $2::date
      AND c.redeemed_at <  ($3::date + INTERVAL '1 day')
    WHERE o.business_id = $1
    GROUP BY o.id
    ORDER BY gross_profit DESC NULLS LAST
  `, [businessId, f, t]);

  return rows.map(r => ({
    ...r,
    redemptions:           parseInt(r.redemptions, 10),
    revenue:               parseFloat(r.revenue),
    cost:                  parseFloat(r.cost),
    gross_profit:          parseFloat(r.gross_profit),
    profit_per_redemption: r.cost_price && r.offer_price
      ? parseFloat(r.offer_price) - parseFloat(r.cost_price)
      : null,
    has_pricing: r.cost_price != null && r.offer_price != null,
  }));
}

async function getDailyProfitChart(businessId, { from, to } = {}) {
  const [f, t] = dateParams(from, to);

  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(c.redeemed_at, 'YYYY-MM-DD') AS day,
      COALESCE(SUM(o.offer_price - o.cost_price), 0)::numeric(12,2) AS profit,
      COUNT(c.id)::int AS redemptions
    FROM coupons c
    JOIN offers o ON o.id = c.offer_id
    WHERE o.business_id = $1
      AND c.status = 'redeemed'
      AND c.redeemed_at >= $2::date
      AND c.redeemed_at <  ($3::date + INTERVAL '1 day')
      AND o.cost_price IS NOT NULL
      AND o.offer_price IS NOT NULL
    GROUP BY day
    ORDER BY day
  `, [businessId, f, t]);

  return rows.map(r => ({ day: r.day, profit: parseFloat(r.profit), redemptions: r.redemptions }));
}

async function getOfferProfitBreakdown(offerId, businessId) {
  const { rows } = await pool.query(`
    SELECT
      o.id, o.title, o.cost_price, o.offer_price, o.selling_price,
      o.current_redemptions,
      COUNT(c.id)::int AS redeemed_count
    FROM offers o
    LEFT JOIN coupons c ON c.offer_id = o.id AND c.status = 'redeemed'
    WHERE o.id = $1 AND o.business_id = $2
    GROUP BY o.id
  `, [offerId, businessId]);

  if (rows.length === 0) {
    const err = new Error('Offer not found.');
    err.status = 404;
    throw err;
  }

  const o = rows[0];
  const hasPricing = o.cost_price != null && o.offer_price != null;
  const redemptions = parseInt(o.redeemed_count, 10);

  if (!hasPricing) {
    return { has_pricing: false, offer_id: o.id, title: o.title, redemptions };
  }

  const offerPrice = parseFloat(o.offer_price);
  const costPrice  = parseFloat(o.cost_price);
  const revenue    = offerPrice * redemptions;
  const cost       = costPrice  * redemptions;

  return {
    has_pricing: true,
    offer_id:    o.id,
    title:       o.title,
    redemptions,
    offer_price: offerPrice,
    cost_price:  costPrice,
    selling_price: o.selling_price ? parseFloat(o.selling_price) : null,
    revenue_generated:      revenue,
    cost_of_offers:         cost,
    gross_profit:           revenue - cost,
    additional_profit:      revenue - cost,
    profit_per_redemption:  offerPrice - costPrice,
  };
}

// ---------------------------------------------------------------------------
// Platform-level profit (admin)
// ---------------------------------------------------------------------------

async function getPlatformROI({ from, to } = {}) {
  const [f, t] = dateParams(from, to);

  const { rows } = await pool.query(`
    SELECT
      COUNT(c.id)::int                                    AS total_redemptions,
      COALESCE(SUM(o.offer_price), 0)::numeric(12,2)     AS total_revenue,
      COALESCE(SUM(o.cost_price), 0)::numeric(12,2)      AS total_cost,
      COALESCE(SUM(o.offer_price - o.cost_price), 0)::numeric(12,2) AS total_profit
    FROM coupons c
    JOIN offers o ON o.id = c.offer_id
    WHERE c.status = 'redeemed'
      AND c.redeemed_at >= $1::date
      AND c.redeemed_at <  ($2::date + INTERVAL '1 day')
      AND o.cost_price IS NOT NULL
      AND o.offer_price IS NOT NULL
  `, [f, t]);

  const r = rows[0] || {};
  const redemptions = parseInt(r.total_redemptions || 0, 10);
  const profit      = parseFloat(r.total_profit || 0);

  // Best performing business
  const { rows: bizRows } = await pool.query(`
    SELECT b.name,
      COALESCE(SUM(o.offer_price - o.cost_price), 0)::numeric(12,2) AS profit
    FROM coupons c
    JOIN offers o ON o.id = c.offer_id
    JOIN businesses b ON b.id = o.business_id
    WHERE c.status = 'redeemed'
      AND c.redeemed_at >= $1::date AND c.redeemed_at < ($2::date + INTERVAL '1 day')
      AND o.cost_price IS NOT NULL AND o.offer_price IS NOT NULL
    GROUP BY b.id ORDER BY profit DESC LIMIT 1
  `, [f, t]);

  // Best performing offer
  const { rows: offerRows } = await pool.query(`
    SELECT o.title,
      COALESCE(SUM(o.offer_price - o.cost_price), 0)::numeric(12,2) AS profit
    FROM coupons c
    JOIN offers o ON o.id = c.offer_id
    WHERE c.status = 'redeemed'
      AND c.redeemed_at >= $1::date AND c.redeemed_at < ($2::date + INTERVAL '1 day')
      AND o.cost_price IS NOT NULL AND o.offer_price IS NOT NULL
    GROUP BY o.id ORDER BY profit DESC LIMIT 1
  `, [f, t]);

  return {
    total_redemptions:   redemptions,
    total_revenue:       parseFloat(r.total_revenue || 0),
    total_cost:          parseFloat(r.total_cost || 0),
    total_profit:        profit,
    avg_profit_per_redemption: redemptions > 0 ? profit / redemptions : 0,
    best_business:       bizRows[0]   ? { name: bizRows[0].name,  profit: parseFloat(bizRows[0].profit) }  : null,
    best_offer:          offerRows[0] ? { name: offerRows[0].title, profit: parseFloat(offerRows[0].profit) } : null,
  };
}

async function getDailyPlatformProfitChart({ from, to } = {}) {
  const [f, t] = dateParams(from, to);

  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(c.redeemed_at, 'YYYY-MM-DD') AS day,
      COALESCE(SUM(o.offer_price - o.cost_price), 0)::numeric(12,2) AS profit,
      COUNT(c.id)::int AS redemptions
    FROM coupons c
    JOIN offers o ON o.id = c.offer_id
    WHERE c.status = 'redeemed'
      AND c.redeemed_at >= $1::date AND c.redeemed_at < ($2::date + INTERVAL '1 day')
      AND o.cost_price IS NOT NULL AND o.offer_price IS NOT NULL
    GROUP BY day ORDER BY day
  `, [f, t]);

  return rows.map(r => ({ day: r.day, profit: parseFloat(r.profit), redemptions: r.redemptions }));
}

async function getPlatformBusinessTable({ from, to } = {}) {
  const [f, t] = dateParams(from, to);

  const { rows } = await pool.query(`
    SELECT
      b.id, b.name, b.category, b.created_at,
      COUNT(DISTINCT o.id)::int AS offer_count,
      COUNT(c.id)::int AS redemptions,
      COALESCE(SUM(o.offer_price) FILTER (WHERE o.cost_price IS NOT NULL), 0)::numeric(12,2) AS revenue,
      COALESCE(SUM(o.offer_price - o.cost_price) FILTER (WHERE o.cost_price IS NOT NULL), 0)::numeric(12,2) AS profit
    FROM businesses b
    LEFT JOIN offers o ON o.business_id = b.id
    LEFT JOIN coupons c ON c.offer_id = o.id AND c.status = 'redeemed'
      AND c.redeemed_at >= $1::date AND c.redeemed_at < ($2::date + INTERVAL '1 day')
    WHERE b.status = 'active'
    GROUP BY b.id
    ORDER BY profit DESC NULLS LAST
  `, [f, t]);

  return rows.map(r => ({
    ...r,
    redemptions:  parseInt(r.redemptions, 10),
    offer_count:  parseInt(r.offer_count, 10),
    revenue:      parseFloat(r.revenue),
    profit:       parseFloat(r.profit),
  }));
}

async function getBusinessOfferProfit(businessId, { from, to } = {}) {
  const [f, t] = dateParams(from, to);

  const { rows } = await pool.query(`
    SELECT
      o.id, o.title, o.cost_price, o.offer_price, o.is_active,
      COUNT(c.id)::int AS redemptions,
      COALESCE(SUM(o.offer_price) FILTER (WHERE o.cost_price IS NOT NULL), 0)::numeric(12,2) AS revenue,
      COALESCE(SUM(o.cost_price) FILTER (WHERE o.cost_price IS NOT NULL), 0)::numeric(12,2)  AS cost,
      COALESCE(SUM(o.offer_price - o.cost_price) FILTER (WHERE o.cost_price IS NOT NULL), 0)::numeric(12,2) AS gross_profit
    FROM offers o
    LEFT JOIN coupons c ON c.offer_id = o.id AND c.status = 'redeemed'
      AND c.redeemed_at >= $2::date AND c.redeemed_at < ($3::date + INTERVAL '1 day')
    WHERE o.business_id = $1
    GROUP BY o.id
    ORDER BY gross_profit DESC NULLS LAST
  `, [businessId, f, t]);

  return rows.map(r => ({
    ...r,
    redemptions:  parseInt(r.redemptions, 10),
    revenue:      parseFloat(r.revenue),
    cost:         parseFloat(r.cost),
    gross_profit: parseFloat(r.gross_profit),
    has_pricing:  r.cost_price != null && r.offer_price != null,
  }));
}

// ---------------------------------------------------------------------------
// CSV generation helpers
// ---------------------------------------------------------------------------

function toCSV(rows) {
  if (rows.length === 0) return 'No data';
  const headers = Object.keys(rows[0]).join(',');
  const body = rows.map(r =>
    Object.values(r).map(v => v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`).join(',')
  );
  return [headers, ...body].join('\n');
}

async function generateBusinessProfitCSV(businessId, { from, to } = {}) {
  const rows = await getOfferProfitTable(businessId, { from, to });
  return toCSV(rows.map(r => ({
    'Offer': r.title,
    'Redemptions': r.redemptions,
    'Revenue (£)': r.revenue.toFixed(2),
    'Cost (£)': r.cost.toFixed(2),
    'Gross Profit (£)': r.gross_profit.toFixed(2),
    'Profit per Redemption (£)': r.profit_per_redemption != null ? r.profit_per_redemption.toFixed(2) : '—',
    'Pricing Data': r.has_pricing ? 'Yes' : 'No',
  })));
}

async function generatePlatformProfitCSV({ from, to } = {}) {
  const rows = await getPlatformBusinessTable({ from, to });
  return toCSV(rows.map(r => ({
    'Business': r.name,
    'Category': r.category || '',
    'Redemptions': r.redemptions,
    'Revenue (£)': r.revenue.toFixed(2),
    'Profit (£)': r.profit.toFixed(2),
    'Offers': r.offer_count,
    'Joined': r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
  })));
}

module.exports = {
  getBusinessROI,
  getOfferProfitTable,
  getDailyProfitChart,
  getOfferProfitBreakdown,
  getPlatformROI,
  getDailyPlatformProfitChart,
  getPlatformBusinessTable,
  getBusinessOfferProfit,
  generateBusinessProfitCSV,
  generatePlatformProfitCSV,
};
