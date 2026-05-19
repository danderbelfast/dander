'use strict';

const pool = require('../db/pool');

const FRESHNESS_THRESHOLDS = {
  high:   { label: 'Use today',        discount: 40, hours: 4 },
  medium: { label: 'Use within 2 days', discount: 25, hours: 48 },
  low:    { label: 'Good for now',      discount: 10, hours: 168 },
};

function detectItemsFromLabels(labels, inventoryItems) {
  const matched = [];
  for (const item of inventoryItems) {
    const name = item.name.toLowerCase();
    for (const label of labels) {
      if (label.toLowerCase().includes(name) || name.includes(label.toLowerCase())) {
        matched.push({
          inventory_id: item.id,
          name: item.name,
          category: item.category,
          is_perishable: item.is_perishable,
          confidence: 0.85,
          matched_label: label,
        });
        break;
      }
    }
  }
  return matched;
}

function generateFreshnessFlags(items) {
  return items
    .filter(i => i.is_perishable)
    .map(item => ({
      item_name: item.name,
      urgency: 'high',
      ...FRESHNESS_THRESHOLDS.high,
    }));
}

function generateSuggestedOffers(items, freshnessFlags, businessName) {
  const suggestions = [];

  for (const flag of freshnessFlags) {
    suggestions.push({
      title: `${flag.discount}% off ${flag.item_name} — ${flag.label.toLowerCase()}`,
      offer_type: 'percentage',
      discount_percent: flag.discount,
      category: items.find(i => i.name === flag.item_name)?.category || 'Food & Drink',
      reason: `Perishable item flagged: ${flag.label}`,
      urgency: flag.urgency,
    });
  }

  const nonPerishable = items.filter(i => !i.is_perishable);
  if (nonPerishable.length > 0) {
    const item = nonPerishable[0];
    suggestions.push({
      title: `Special on ${item.name} today`,
      offer_type: 'percentage',
      discount_percent: 15,
      category: item.category || 'Retail & Shopping',
      reason: 'Detected in stock — drive footfall',
      urgency: 'low',
    });
  }

  return suggestions;
}

async function assessPhoto(businessId, photoUrl, detectedLabels) {
  const { rows: inventory } = await pool.query(
    `SELECT id, name, category, is_perishable
     FROM inventory_items
     WHERE business_id = $1 AND is_active = true
     ORDER BY sort_order`,
    [businessId]
  );

  const labels = detectedLabels && detectedLabels.length > 0
    ? detectedLabels
    : inventory.map(i => i.name);

  const items = detectItemsFromLabels(labels, inventory);
  const freshnessFlags = generateFreshnessFlags(items);
  const suggestedOffers = generateSuggestedOffers(items, freshnessFlags);

  const { rows } = await pool.query(
    `INSERT INTO photo_assessments
       (business_id, photo_url, items_detected, freshness_flags, suggested_offers, offers_approved)
     VALUES ($1, $2, $3, $4, $5, 0)
     RETURNING *`,
    [businessId, photoUrl, JSON.stringify(items), JSON.stringify(freshnessFlags), JSON.stringify(suggestedOffers)]
  );

  return rows[0];
}

async function getHistory(businessId, limit = 30) {
  const { rows } = await pool.query(
    `SELECT * FROM photo_assessments
     WHERE business_id = $1
     ORDER BY assessed_at DESC
     LIMIT $2`,
    [businessId, limit]
  );
  return rows;
}

module.exports = { assessPhoto, getHistory };
