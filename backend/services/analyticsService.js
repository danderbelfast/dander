'use strict';

const pool = require('../db/pool');

async function getDashboard(businessId, { from, to, zone } = {}) {
  const dateFrom = from || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const dateTo = to || new Date().toISOString().slice(0, 10);
  const zoneFilter = zone ? 'AND zone_number = $4' : '';
  const params = zone ? [businessId, dateFrom, dateTo, zone] : [businessId, dateFrom, dateTo];

  const [summary, hourly, daily, zones, demographics, topHours] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(SUM(entries), 0)::int AS total_entries,
         COALESCE(SUM(exits), 0)::int AS total_exits,
         ROUND(AVG(occupancy), 1) AS avg_occupancy,
         MAX(occupancy)::int AS peak_occupancy,
         COALESCE(SUM(passersby), 0)::int AS total_passersby,
         CASE WHEN SUM(passersby) > 0
           THEN ROUND((SUM(entries)::numeric / NULLIF(SUM(passersby), 0)) * 100, 1)
           ELSE 0 END AS conversion_rate,
         ROUND(AVG(avg_attention_time), 1) AS avg_dwell_seconds,
         COUNT(DISTINCT DATE(timestamp))::int AS days_tracked
       FROM kilo_people_counting
       WHERE business_id = $1
         AND timestamp BETWEEN $2::date AND $3::date + INTERVAL '1 day'
         ${zoneFilter}`,
      params
    ),
    pool.query(
      `SELECT EXTRACT(HOUR FROM timestamp)::int AS hour,
              ROUND(AVG(entries), 1) AS avg_entries,
              ROUND(AVG(exits), 1) AS avg_exits,
              ROUND(AVG(occupancy), 1) AS avg_occupancy
       FROM kilo_people_counting
       WHERE business_id = $1
         AND timestamp BETWEEN $2::date AND $3::date + INTERVAL '1 day'
         ${zoneFilter}
       GROUP BY hour ORDER BY hour`,
      params
    ),
    pool.query(
      `SELECT DATE(timestamp) AS day,
              SUM(entries)::int AS entries,
              SUM(exits)::int AS exits,
              ROUND(AVG(occupancy), 1) AS avg_occupancy,
              MAX(occupancy)::int AS peak_occupancy
       FROM kilo_people_counting
       WHERE business_id = $1
         AND timestamp BETWEEN $2::date AND $3::date + INTERVAL '1 day'
         ${zoneFilter}
       GROUP BY day ORDER BY day`,
      params
    ),
    pool.query(
      `SELECT zone_number,
              COALESCE(SUM(entries), 0)::int AS entries,
              ROUND(AVG(occupancy), 1) AS avg_occupancy,
              ROUND(AVG(avg_attention_time), 1) AS avg_dwell
       FROM kilo_people_counting
       WHERE business_id = $1
         AND timestamp BETWEEN $2::date AND $3::date + INTERVAL '1 day'
       GROUP BY zone_number ORDER BY zone_number`,
      [businessId, dateFrom, dateTo]
    ),
    pool.query(
      `SELECT
         COALESCE(SUM(male_count), 0)::int AS male,
         COALESCE(SUM(female_count), 0)::int AS female,
         COALESCE(SUM(adult_count), 0)::int AS adults,
         COALESCE(SUM(child_count), 0)::int AS children,
         COALESCE(SUM(staff_count), 0)::int AS staff
       FROM kilo_people_counting
       WHERE business_id = $1
         AND timestamp BETWEEN $2::date AND $3::date + INTERVAL '1 day'
         ${zoneFilter}`,
      params
    ),
    pool.query(
      `SELECT EXTRACT(HOUR FROM timestamp)::int AS hour,
              SUM(entries)::int AS total_entries
       FROM kilo_people_counting
       WHERE business_id = $1
         AND timestamp BETWEEN $2::date AND $3::date + INTERVAL '1 day'
         ${zoneFilter}
       GROUP BY hour ORDER BY total_entries DESC LIMIT 3`,
      params
    ),
  ]);

  const zoneConfigs = await pool.query(
    `SELECT zone_number, zone_name, zone_type FROM kilo_zone_configs
     WHERE business_id = $1 AND is_active = true ORDER BY zone_number`,
    [businessId]
  );
  const zoneMap = {};
  for (const z of zoneConfigs.rows) zoneMap[z.zone_number] = z;

  return {
    period: { from: dateFrom, to: dateTo },
    summary: summary.rows[0],
    hourly_breakdown: hourly.rows,
    daily_breakdown: daily.rows,
    zones: zones.rows.map(z => ({
      ...z,
      zone_name: zoneMap[z.zone_number]?.zone_name || `Zone ${z.zone_number}`,
      zone_type: zoneMap[z.zone_number]?.zone_type || 'counting',
    })),
    demographics: demographics.rows[0],
    peak_hours: topHours.rows,
  };
}

async function getCurrentStatus(businessId) {
  const [latest, occupancy, recentActivity, devices] = await Promise.all([
    pool.query(
      `SELECT * FROM kilo_people_counting
       WHERE business_id = $1
       ORDER BY timestamp DESC LIMIT 1`,
      [businessId]
    ),
    pool.query(
      `SELECT zone_number, occupancy, entries, exits, timestamp
       FROM kilo_people_counting
       WHERE business_id = $1
         AND timestamp >= NOW() - INTERVAL '30 minutes'
       ORDER BY timestamp DESC`,
      [businessId]
    ),
    pool.query(
      `SELECT EXTRACT(HOUR FROM timestamp)::int AS hour,
              SUM(entries)::int AS entries
       FROM kilo_people_counting
       WHERE business_id = $1
         AND DATE(timestamp) = CURRENT_DATE
       GROUP BY hour ORDER BY hour`,
      [businessId]
    ),
    pool.query(
      `SELECT device_sn, device_name, last_seen, network_status, firmware_version
       FROM kilo_device_status
       WHERE business_id = $1`,
      [businessId]
    ),
  ]);

  const baseline = await pool.query(
    `SELECT avg_footfall FROM footfall_baselines
     WHERE business_id = $1 AND day_of_week = EXTRACT(DOW FROM NOW())::int
       AND hour_slot = EXTRACT(HOUR FROM NOW())::int`,
    [businessId]
  );

  const currentBaseline = baseline.rows[0]?.avg_footfall ? parseFloat(baseline.rows[0].avg_footfall) : null;
  const latestReading = latest.rows[0] || null;
  const currentEntries = latestReading ? latestReading.entries : 0;

  let status = 'no_data';
  if (currentBaseline != null && latestReading) {
    if (currentEntries < currentBaseline * 0.6) status = 'quiet';
    else if (currentEntries > currentBaseline * 1.4) status = 'busy';
    else status = 'normal';
  }

  const alerts = [];
  for (const dev of devices.rows) {
    if (dev.last_seen && (Date.now() - new Date(dev.last_seen).getTime()) > 30 * 60000) {
      alerts.push({ type: 'device_offline', device: dev.device_sn, last_seen: dev.last_seen });
    }
  }
  if (status === 'quiet') {
    alerts.push({ type: 'low_footfall', current: currentEntries, baseline: currentBaseline });
  }

  return {
    status,
    current_occupancy: latestReading?.occupancy || 0,
    current_entries: currentEntries,
    baseline_expected: currentBaseline,
    last_reading_at: latestReading?.timestamp || null,
    today_activity: recentActivity.rows,
    recent_zones: occupancy.rows.slice(0, 6),
    devices: devices.rows,
    alerts,
  };
}

async function generatePlaceholderData(businessId) {
  const seedScript = require('../scripts/seed-kilo-data');
  return { generated: true, message: 'Use seed-kilo-data.js script for full placeholder data.' };
}

module.exports = { getDashboard, getCurrentStatus, generatePlaceholderData };
