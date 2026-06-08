// ============================================================
//  adAttribution — shared conversion-chain helpers.
//
//  Two transitions:
//    onCustomerArrived(user, business)  — bumps any 'clicked' rows
//      for this (user, business) inside the 7-day attribution window
//      to 'entry_conversion' (with entry_conversion_at = NOW()).
//
//    onCustomerPurchased(user, business, amount)
//      — bumps any 'entry_conversion' rows inside the window to
//      'qualified_sale' (sale_conversion_at, sale_amount, and a
//      tracked-only commission_amount = sale_amount * sale_rate).
//
//  Both helpers log structured lines under [ads] for audit. Nothing
//  is charged yet — commission_amount is forecasting data.
// ============================================================

const ATTRIBUTION_WINDOW = "INTERVAL '7 days'";

async function getSaleRate(client, businessId) {
  const { rows } = await client.query(
    `SELECT sale_rate FROM ad_conversion_rates WHERE business_id = $1`,
    [businessId]
  );
  if (rows.length > 0) return Number(rows[0].sale_rate);
  return 0.05;
}

async function onCustomerArrived(client, { userId, businessId }) {
  const { rows } = await client.query(
    `UPDATE ad_clicks
        SET status              = 'entry_conversion',
            entry_conversion_at = NOW()
      WHERE user_id     = $1
        AND business_id = $2
        AND status      = 'clicked'
        AND clicked_at  > NOW() - ${ATTRIBUTION_WINDOW}
    RETURNING id, ad_id`,
    [userId, businessId]
  );
  for (const r of rows) {
    console.log(`[ads] entry conversion: user ${userId}, ad ${r.ad_id}, business ${businessId}`);
  }
  return rows.length;
}

async function onCustomerPurchased(client, { userId, businessId, saleAmount }) {
  const saleRate = await getSaleRate(client, businessId);
  const amountStr = Number(saleAmount).toFixed(2);

  const { rows } = await client.query(
    `UPDATE ad_clicks
        SET status              = 'qualified_sale',
            sale_conversion_at  = NOW(),
            sale_amount         = $3,
            commission_rate     = $4,
            commission_amount   = ROUND(($3 * $4)::numeric, 2)
      WHERE user_id              = $1
        AND business_id          = $2
        AND status               = 'entry_conversion'
        AND entry_conversion_at  > NOW() - ${ATTRIBUTION_WINDOW}
    RETURNING id, ad_id, commission_amount`,
    [userId, businessId, saleAmount, saleRate]
  );

  for (const r of rows) {
    const commission = r.commission_amount != null ? Number(r.commission_amount).toFixed(2) : '0.00';
    console.log(
      `[ads] qualified sale: user ${userId}, ad ${r.ad_id}, £${amountStr}, ` +
      `commission £${commission} (not yet charged)`
    );
  }
  return rows.length;
}

module.exports = { onCustomerArrived, onCustomerPurchased };
