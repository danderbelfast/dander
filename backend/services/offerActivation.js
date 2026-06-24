'use strict';

// offerActivation — the offer attribution funnel (cousin of adAttribution).
//   activate / deactivate / listMyOffers — user-facing.
//   markEntryConversion / markSaleConversion — wired into check-in / till (Plan 3).
//   stitchAnonToUser — claim anon activations on login/check-in (Plan 2).

const pool = require('../db/pool');

const ATTRIBUTION_WINDOW = "INTERVAL '7 days'";

// Upsert an activation. identity is { userId } OR { anonId }. Returns the row.
async function activate(client, { offerId, channel, userId = null, anonId = null }) {
  // business_id + offer expiry are derived from the offer so the caller can't spoof them.
  const { rows: offerRows } = await client.query(
    'SELECT business_id, expires_at, is_active FROM offers WHERE id = $1',
    [offerId]
  );
  if (offerRows.length === 0) { const e = new Error('Offer not found.'); e.status = 404; throw e; }
  const { business_id, expires_at, is_active } = offerRows[0];
  if (!is_active) { const e = new Error('Offer is not active.'); e.status = 409; throw e; }

  if (userId) {
    const { rows } = await client.query(
      `INSERT INTO offer_activations (offer_id, business_id, user_id, channel, offer_expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (offer_id, user_id) WHERE user_id IS NOT NULL DO UPDATE
         SET channel = EXCLUDED.channel, activated_at = NOW(),
             status = CASE WHEN offer_activations.status = 'expired' THEN 'activated' ELSE offer_activations.status END,
             offer_expires_at = EXCLUDED.offer_expires_at
       RETURNING *`,
      [offerId, business_id, userId, channel, expires_at]
    );
    return rows[0];
  }
  const { rows } = await client.query(
    `INSERT INTO offer_activations (offer_id, business_id, anon_id, channel, offer_expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (offer_id, anon_id) WHERE anon_id IS NOT NULL AND user_id IS NULL DO UPDATE
       SET channel = EXCLUDED.channel, activated_at = NOW(), offer_expires_at = EXCLUDED.offer_expires_at
     RETURNING *`,
    [offerId, business_id, anonId, channel, expires_at]
  );
  return rows[0];
}

async function deactivate(client, { offerId, userId = null, anonId = null }) {
  if (userId) {
    await client.query('DELETE FROM offer_activations WHERE offer_id = $1 AND user_id = $2', [offerId, userId]);
  } else if (anonId) {
    await client.query('DELETE FROM offer_activations WHERE offer_id = $1 AND anon_id = $2 AND user_id IS NULL', [offerId, anonId]);
  }
}

// My Offers: the user's activations whose offer hasn't expired (auto-hide at
// offer expiry; expired rows are RETAINED in the table for analytics).
async function listMyOffers(client, userId) {
  const { rows } = await client.query(
    `SELECT a.id AS activation_id, a.channel, a.status, a.activated_at,
            o.id, o.title, o.description, o.image_url, o.offer_type,
            o.original_price, o.offer_price, o.discount_percent, o.expires_at,
            b.name AS business_name, b.logo_url AS business_logo_url
       FROM offer_activations a
       JOIN offers o      ON o.id = a.offer_id
       JOIN businesses b  ON b.id = a.business_id
      WHERE a.user_id = $1
        AND (o.expires_at IS NULL OR o.expires_at > NOW())
        AND o.is_active = TRUE
      ORDER BY a.activated_at DESC`,
    [userId]
  );
  return rows;
}

// Till tag candidate set: this user's NON-expired, still-open activations for
// ONE business, within the attribution window. Most-recent first → row[0] is the
// deterministic last-touch suggestion for the TillPanel pre-selection.
async function listActivatedForBusiness(client, { userId, businessId }) {
  const { rows } = await client.query(
    `SELECT a.offer_id AS id, a.status, a.activated_at,
            o.title, o.description, o.offer_type,
            o.original_price, o.offer_price, o.discount_percent
       FROM offer_activations a
       JOIN offers o ON o.id = a.offer_id
      WHERE a.user_id = $1 AND a.business_id = $2
        AND a.status IN ('activated', 'entry_conversion')
        AND a.activated_at > NOW() - ${ATTRIBUTION_WINDOW}
        AND o.is_active = TRUE
        AND (o.expires_at IS NULL OR o.expires_at > NOW())
      ORDER BY a.activated_at DESC`,
    [userId, businessId]
  );
  return rows;
}

// On check-in: open activations for this user+business → entry_conversion.
async function markEntryConversion(client, { userId, businessId }) {
  const { rows } = await client.query(
    `UPDATE offer_activations
        SET status = 'entry_conversion', entry_conversion_at = NOW()
      WHERE user_id = $1 AND business_id = $2
        AND status = 'activated'
        AND activated_at > NOW() - ${ATTRIBUTION_WINDOW}
    RETURNING id, offer_id`,
    [userId, businessId]
  );
  return rows.length;
}

// On till purchase: a staff-tagged offer (deterministic) → qualified_sale.
// If offerId is null, last-touch backfill across this user's open rows.
async function markSaleConversion(client, { userId, businessId, offerId = null, saleAmount }) {
  const amount = Number(saleAmount);
  if (offerId) {
    const { rows } = await client.query(
      `UPDATE offer_activations
          SET status = 'qualified_sale', sale_conversion_at = NOW(), sale_amount = $4
        WHERE user_id = $1 AND business_id = $2 AND offer_id = $3
          AND status IN ('activated', 'entry_conversion')
          AND activated_at > NOW() - ${ATTRIBUTION_WINDOW}
      RETURNING id`,
      [userId, businessId, offerId, amount]
    );
    return rows.length;
  }
  const { rows } = await client.query(
    `UPDATE offer_activations
        SET status = 'qualified_sale', sale_conversion_at = NOW(), sale_amount = $3
      WHERE id = (
        SELECT id FROM offer_activations
         WHERE user_id = $1 AND business_id = $2
           AND status IN ('activated', 'entry_conversion')
           AND activated_at > NOW() - ${ATTRIBUTION_WINDOW}
         ORDER BY activated_at DESC LIMIT 1
      )
    RETURNING id`,
    [userId, businessId, amount]
  );
  return rows.length;
}

// On login / check-in: claim this device's anon activations for the user,
// skipping any the user already has for the same offer.
async function stitchAnonToUser(client, { anonId, userId }) {
  if (!anonId) return 0;
  const { rows } = await client.query(
    `UPDATE offer_activations a
        SET user_id = $2, anon_id = NULL
      WHERE a.anon_id = $1 AND a.user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM offer_activations b
           WHERE b.offer_id = a.offer_id AND b.user_id = $2
        )
    RETURNING id`,
    [anonId, userId]
  );
  await client.query('DELETE FROM offer_activations WHERE anon_id = $1 AND user_id IS NULL', [anonId]);
  return rows.length;
}

module.exports = {
  activate, deactivate, listMyOffers, listActivatedForBusiness,
  markEntryConversion, markSaleConversion, stitchAnonToUser,
};
