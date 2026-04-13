'use strict';

const pool = require('../db/pool');

/**
 * Check if a business is currently open.
 * Returns { isOpen, opensAt, closesAt, nextOpenTime, minutesUntilClose }
 */
async function isBusinessOpen(businessId, datetime = new Date()) {
  const date = new Date(datetime);
  const dateStr = date.toISOString().slice(0, 10);
  const dayOfWeek = date.getDay(); // 0=Sun
  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  // Check special hours first (date override)
  const { rows: special } = await pool.query(
    'SELECT * FROM special_hours WHERE business_id = $1 AND date = $2',
    [businessId, dateStr]
  );

  let hours = null;

  if (special.length > 0) {
    hours = special[0];
  } else {
    const { rows: regular } = await pool.query(
      'SELECT * FROM business_hours WHERE business_id = $1 AND day_of_week = $2',
      [businessId, dayOfWeek]
    );
    hours = regular[0] || null;
  }

  // No hours configured = assume open 24/7
  if (!hours) {
    return { isOpen: true, hoursConfigured: false, opensAt: null, closesAt: null, nextOpenTime: null, minutesUntilClose: null };
  }

  if (hours.is_closed) {
    const nextOpen = await getNextOpenTime(businessId, date);
    return { isOpen: false, hoursConfigured: true, opensAt: null, closesAt: null, nextOpenTime: nextOpen, minutesUntilClose: null };
  }

  const opens = formatTime(hours.opens_at);
  const closes = formatTime(hours.closes_at);

  if (!opens || !closes) {
    return { isOpen: true, hoursConfigured: true, opensAt: opens, closesAt: closes, nextOpenTime: null, minutesUntilClose: null };
  }

  const isOpen = timeStr >= opens && timeStr < closes;
  let minutesUntilClose = null;

  if (isOpen) {
    const [ch, cm] = closes.split(':').map(Number);
    const [nh, nm] = [date.getHours(), date.getMinutes()];
    minutesUntilClose = (ch * 60 + cm) - (nh * 60 + nm);
  }

  let nextOpenTime = null;
  if (!isOpen) {
    if (timeStr < opens) {
      nextOpenTime = `Today at ${opens}`;
    } else {
      nextOpenTime = await getNextOpenTime(businessId, date);
    }
  }

  return { isOpen, hoursConfigured: true, opensAt: opens, closesAt: closes, nextOpenTime, minutesUntilClose };
}

function formatTime(t) {
  if (!t) return null;
  // pg returns time as "HH:MM:SS" or "HH:MM"
  return String(t).slice(0, 5);
}

async function getNextOpenTime(businessId, fromDate) {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (let i = 1; i <= 7; i++) {
    const next = new Date(fromDate);
    next.setDate(next.getDate() + i);
    const dayName = DAYS[next.getDay()];
    const dateStr = next.toISOString().slice(0, 10);

    // Check special hours
    const { rows: special } = await pool.query(
      'SELECT * FROM special_hours WHERE business_id = $1 AND date = $2',
      [businessId, dateStr]
    );
    if (special.length > 0) {
      if (!special[0].is_closed && special[0].opens_at) {
        return `${dayName} at ${formatTime(special[0].opens_at)}`;
      }
      continue;
    }

    const { rows: regular } = await pool.query(
      'SELECT * FROM business_hours WHERE business_id = $1 AND day_of_week = $2',
      [businessId, next.getDay()]
    );
    if (regular.length > 0 && !regular[0].is_closed && regular[0].opens_at) {
      return `${dayName} at ${formatTime(regular[0].opens_at)}`;
    }
    if (regular.length === 0) {
      // No hours set for this day = assumed open
      return `${dayName}`;
    }
  }
  return null;
}

/**
 * Get all regular hours for a business.
 */
async function getBusinessHours(businessId) {
  const { rows } = await pool.query(
    'SELECT day_of_week, opens_at, closes_at, is_closed FROM business_hours WHERE business_id = $1 ORDER BY day_of_week',
    [businessId]
  );
  return rows.map(r => ({
    day_of_week: r.day_of_week,
    opens_at: formatTime(r.opens_at),
    closes_at: formatTime(r.closes_at),
    is_closed: r.is_closed,
  }));
}

/**
 * Get special hours for a business.
 */
async function getSpecialHours(businessId) {
  const { rows } = await pool.query(
    'SELECT id, date, opens_at, closes_at, is_closed, label FROM special_hours WHERE business_id = $1 ORDER BY date',
    [businessId]
  );
  return rows.map(r => ({
    ...r,
    opens_at: formatTime(r.opens_at),
    closes_at: formatTime(r.closes_at),
  }));
}

/**
 * Save regular hours (upsert all 7 days).
 */
async function saveBusinessHours(businessId, hours) {
  for (const h of hours) {
    await pool.query(`
      INSERT INTO business_hours (business_id, day_of_week, opens_at, closes_at, is_closed, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT ON CONSTRAINT uq_biz_day
      DO UPDATE SET opens_at = $3, closes_at = $4, is_closed = $5, updated_at = NOW()
    `, [businessId, h.day_of_week, h.opens_at || null, h.closes_at || null, Boolean(h.is_closed)]);
  }
}

/**
 * Add a special hours date.
 */
async function addSpecialHours(businessId, { date, opens_at, closes_at, is_closed, label }) {
  const { rows } = await pool.query(`
    INSERT INTO special_hours (business_id, date, opens_at, closes_at, is_closed, label)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT ON CONSTRAINT uq_biz_special_date
    DO UPDATE SET opens_at = $3, closes_at = $4, is_closed = $5, label = $6
    RETURNING *
  `, [businessId, date, opens_at || null, closes_at || null, Boolean(is_closed), label || null]);
  return rows[0];
}

/**
 * Delete a special hours date.
 */
async function deleteSpecialHours(businessId, id) {
  const { rowCount } = await pool.query(
    'DELETE FROM special_hours WHERE id = $1 AND business_id = $2',
    [id, businessId]
  );
  return rowCount > 0;
}

/**
 * Build a countdown label for an offer, factoring in business hours.
 */
function buildCountdownLabel(offer, businessStatus) {
  const now = Date.now();
  const labels = [];

  // Coupons remaining
  if (offer.max_redemptions) {
    const remaining = offer.max_redemptions - (offer.current_redemptions || 0);
    if (remaining <= 10 && remaining > 0) {
      labels.push({ text: `${remaining} coupon${remaining !== 1 ? 's' : ''} left`, urgency: remaining <= 3 ? 'red' : 'amber', minutes: remaining * 10 });
    }
  }

  // Offer expiry
  if (offer.expires_at) {
    const expiresMs = new Date(offer.expires_at).getTime() - now;
    const expiresMin = Math.floor(expiresMs / 60000);
    if (expiresMin > 0 && expiresMin <= 1440) {
      const h = Math.floor(expiresMin / 60);
      const m = expiresMin % 60;
      const text = h > 0 ? `Deal ends in ${h}h ${m}m` : `Deal ends in ${m}m`;
      const urgency = expiresMin <= 15 ? 'pulse' : expiresMin <= 60 ? 'red' : expiresMin <= 120 ? 'amber' : 'green';
      labels.push({ text, urgency, minutes: expiresMin });
    }
  }

  // Business closing
  if (businessStatus?.isOpen && businessStatus.minutesUntilClose != null) {
    const min = businessStatus.minutesUntilClose;
    if (min > 0 && min <= 180) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      const text = min <= 30 ? 'Closing soon' : h > 0 ? `Closes in ${h}h ${m}m` : `Closes in ${m}m`;
      const urgency = min <= 15 ? 'pulse' : min <= 30 ? 'red' : min <= 60 ? 'amber' : 'green';
      labels.push({ text, urgency, minutes: min });
    }
  }

  if (labels.length === 0) return null;
  // Return the most urgent (lowest minutes)
  labels.sort((a, b) => a.minutes - b.minutes);
  return labels[0];
}

module.exports = {
  isBusinessOpen,
  getBusinessHours,
  getSpecialHours,
  saveBusinessHours,
  addSpecialHours,
  deleteSpecialHours,
  buildCountdownLabel,
};
