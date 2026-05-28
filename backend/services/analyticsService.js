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
     WHERE business_id = $1 ORDER BY zone_number`,
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
  const DAYS_BACK = 14; // Reduced for faster generation
  
  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  try {
    // Get or create device
    const { rows: existing } = await pool.query(
      'SELECT id, device_id FROM kilo_devices WHERE business_id = $1 LIMIT 1',
      [businessId]
    );
    let deviceSn;
    
    if (existing.length > 0) {
      deviceSn = existing[0].device_id;
    } else {
      deviceSn = `kilo_test_${Date.now()}`;
      await pool.query(
        `INSERT INTO kilo_devices (business_id, device_id, label, status, device_type, first_reading_at, last_reading_at)
         VALUES ($1, $2, $3, 'active', 'people_counter', NOW() - INTERVAL '${DAYS_BACK} days', NOW())`,
        [businessId, deviceSn, 'Test Device']
      );
    }

    // Seed zones if not exists
    const zones = [
      { number: 1, name: 'Main Entrance', type: 'counting' },
      { number: 2, name: 'Seating Area', type: 'dwell' },
      { number: 3, name: 'Counter', type: 'counting' },
    ];
    for (const z of zones) {
      await pool.query(
        `INSERT INTO kilo_zone_configs (business_id, device_sn, zone_number, zone_name, zone_type)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (device_sn, zone_number) DO NOTHING`,
        [businessId, deviceSn, z.number, z.name, z.type]
      );
    }

    // Generate readings - batch per day for efficiency
    const now = new Date();
    let readingsInserted = 0;
    
    for (let d = DAYS_BACK; d >= 0; d--) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      date.setHours(0, 0, 0, 0);

      // Collect all readings for this day in arrays, then insert in one query per hour
      for (let hour = 8; hour < 20; hour++) {
        const ts = new Date(date);
        ts.setHours(hour, 0, 0, 0);
        const tsStr = ts.toISOString();

        const baseRates = { 8: 5, 9: 12, 10: 18, 11: 25, 12: 35, 13: 35, 14: 28, 15: 22, 16: 20, 17: 22, 18: 28, 19: 15 };
        const base = baseRates[hour] || 10;
        const entries = Math.max(0, base + rand(-5, 5));
        const exits = Math.max(0, entries - rand(-3, 3));
        const occupancy = Math.max(0, rand(5, 25));

        // Insert all 3 zones in one multi-row statement
        await pool.query(
          `INSERT INTO kilo_people_counting
             (business_id, device_sn, zone_number, timestamp, interval_seconds, entries, exits, occupancy)
           VALUES 
             ($1, $2, 1, $3, 3600, $4, $5, $6),
             ($1, $2, 2, $3, 3600, $7, $8, $9),
             ($1, $2, 3, $3, 3600, $10, $11, $12)
           ON CONFLICT (business_id, device_sn, timestamp, zone_number) DO NOTHING`,
          [
            businessId, deviceSn, tsStr,
            entries, exits, occupancy,                           // Zone 1
            Math.round(entries * 0.6), Math.max(0, Math.round(entries * 0.6) - 1), Math.round(occupancy * 0.7),  // Zone 2
            Math.round(entries * 0.8), Math.round(entries * 0.8), rand(1, 5)  // Zone 3
          ]
        );
        readingsInserted += 3;
      }
    }

    return { generated: true, readingsInserted, message: `Generated ${readingsInserted} test readings for ${DAYS_BACK} days` };
  } catch (err) {
    console.error('[generatePlaceholderData]', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// FootfallCam — sourced from footfallcam_readings (one row per device event;
// count_in / count_out / occupancy are 0/1 flags). All windowing is in UTC to
// stay consistent with the rest of the platform.
// ---------------------------------------------------------------------------

async function getFootfallSummary(businessId, date) {
  const day = date || new Date().toISOString().slice(0, 10);

  const [todayRes, peakRes, hourRes, yestRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(count_in), 0)::int  AS entries,
              COALESCE(SUM(count_out), 0)::int AS exits
         FROM footfallcam_readings
        WHERE business_id = $1
          AND (timestamp AT TIME ZONE 'UTC')::date = $2::date`,
      [businessId, day]
    ),
    pool.query(
      `SELECT date_part('hour', timestamp AT TIME ZONE 'UTC')::int AS hour,
              SUM(count_in)::int AS entries
         FROM footfallcam_readings
        WHERE business_id = $1
          AND (timestamp AT TIME ZONE 'UTC')::date = $2::date
          AND count_in = 1
        GROUP BY hour
        ORDER BY entries DESC, hour ASC
        LIMIT 1`,
      [businessId, day]
    ),
    pool.query(
      `SELECT COALESCE(SUM(count_in), 0)::int AS entries
         FROM footfallcam_readings
        WHERE business_id = $1
          AND (timestamp AT TIME ZONE 'UTC') >= date_trunc('hour', (NOW() AT TIME ZONE 'UTC'))`,
      [businessId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(count_in), 0)::int AS entries
         FROM footfallcam_readings
        WHERE business_id = $1
          AND (timestamp AT TIME ZONE 'UTC')::date = ($2::date - INTERVAL '1 day')::date`,
      [businessId, day]
    ),
  ]);

  const entriesToday     = todayRes.rows[0].entries;
  const exitsToday       = todayRes.rows[0].exits;
  const entriesYesterday = yestRes.rows[0].entries;
  const vsYesterdayPct   = entriesYesterday > 0
    ? Math.round(((entriesToday - entriesYesterday) / entriesYesterday) * 100)
    : null;

  return {
    date:             day,
    entriesToday,
    exitsToday,
    currentOccupancy: Math.max(0, entriesToday - exitsToday),
    entriesThisHour:  hourRes.rows[0].entries,
    peakHour:         peakRes.rows[0] ? peakRes.rows[0].hour : null,  // 0-23 UTC, or null
    entriesYesterday,
    vsYesterdayPct,                                                   // null if no baseline
  };
}

async function getHourlyFootfall(businessId, date) {
  const day = date || new Date().toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT date_part('hour', timestamp AT TIME ZONE 'UTC')::int AS hour,
            COALESCE(SUM(count_in), 0)::int  AS entries,
            COALESCE(SUM(count_out), 0)::int AS exits
       FROM footfallcam_readings
      WHERE business_id = $1
        AND (timestamp AT TIME ZONE 'UTC')::date = $2::date
      GROUP BY hour`,
    [businessId, day]
  );

  // Fill every hour 0-23 so the chart axis is continuous.
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  const out = [];
  for (let h = 0; h < 24; h++) {
    const r = byHour.get(h);
    out.push({ hour: h, entries: r ? r.entries : 0, exits: r ? r.exits : 0 });
  }
  return out;
}

module.exports = {
  getDashboard, getCurrentStatus, generatePlaceholderData,
  getFootfallSummary, getHourlyFootfall,
};
