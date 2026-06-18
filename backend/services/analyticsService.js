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

// Node-data source for the realtime endpoint. Mirrors the response
// shape of the kilo path so the dashboard's RealtimeTab consumes both
// without branching. Each recent_zones row gets zone_name populated;
// the frontend already prefers zone_name over zone_number when
// rendering. Capacity / low-footfall alerts are deferred because they
// need a per-zone baseline that doesn't exist for node uploads yet.
async function getCurrentStatusFromNodes(businessId) {
  const [zones, hourly, devices, occupancyRow, queueAlerts] = await Promise.all([
    // Active zones: one row per node-name, with last 30-min entries/exits
    // and today's net occupancy (count_in - count_out, clamped to >=0).
    pool.query(
      `WITH today AS (
         SELECT zone_name,
                COALESCE(SUM(count_in),  0)::int AS entries_today,
                COALESCE(SUM(count_out), 0)::int AS exits_today
           FROM phone_counter_readings
          WHERE business_id = $1
            AND zone_name IS NOT NULL
            AND timestamp::date = CURRENT_DATE
          GROUP BY zone_name
       ),
       recent AS (
         SELECT zone_name,
                (array_agg(zone_type ORDER BY timestamp DESC)
                   FILTER (WHERE zone_type IS NOT NULL))[1] AS zone_type,
                COALESCE(SUM(count_in),  0)::int AS entries,
                COALESCE(SUM(count_out), 0)::int AS exits,
                MAX(timestamp)                    AS last_seen
           FROM phone_counter_readings
          WHERE business_id = $1
            AND zone_name IS NOT NULL
            AND timestamp > NOW() - INTERVAL '30 minutes'
          GROUP BY zone_name
       )
       SELECT r.zone_name,
              r.zone_type,
              r.entries,
              r.exits,
              GREATEST(0, COALESCE(t.entries_today, 0) - COALESCE(t.exits_today, 0)) AS occupancy,
              r.last_seen AS timestamp
         FROM recent r
         LEFT JOIN today t USING (zone_name)
        ORDER BY r.zone_name`,
      [businessId]
    ),
    // Today's hourly activity — sum of count_in per hour today.
    pool.query(
      `SELECT EXTRACT(HOUR FROM timestamp)::int AS hour,
              COALESCE(SUM(count_in), 0)::int   AS entries
         FROM phone_counter_readings
        WHERE business_id = $1
          AND timestamp::date = CURRENT_DATE
        GROUP BY hour ORDER BY hour`,
      [businessId]
    ),
    // Devices: latest reading per device joined to its assigned name.
    // online = uploaded within last 2 minutes (matches /api/nodes).
    pool.query(
      `SELECT DISTINCT ON (r.device_id)
              r.device_id,
              COALESCE(c.zone_name, r.zone_name) AS device_name,
              r.app_version                      AS firmware_version,
              r.timestamp                        AS last_seen,
              CASE WHEN r.timestamp > NOW() - INTERVAL '2 minutes'
                   THEN 'online' ELSE 'offline' END AS network_status
         FROM phone_counter_readings r
         LEFT JOIN node_commands c ON c.device_id = r.device_id
        WHERE r.business_id = $1
          AND r.device_id IS NOT NULL
          AND r.timestamp > NOW() - INTERVAL '24 hours'
        ORDER BY r.device_id, r.timestamp DESC`,
      [businessId]
    ),
    // Current occupancy. Prefer entrance-typed zones if any exist
    // (counts strangers walking through the door, the canonical
    // "people inside" question). Fall back to all-zones net flow for
    // workshop-style setups with no entrance node.
    pool.query(
      `SELECT
         GREATEST(0,
           COALESCE(SUM(count_in)  FILTER (WHERE zone_type = 'entrance'), 0)
         - COALESCE(SUM(count_out) FILTER (WHERE zone_type = 'entrance'), 0)
         )::int AS entrance_occupancy,
         GREATEST(0,
           COALESCE(SUM(count_in), 0) - COALESCE(SUM(count_out), 0)
         )::int AS all_zones_occupancy,
         COUNT(DISTINCT zone_name) FILTER (WHERE zone_type = 'entrance')::int AS entrance_zone_count
       FROM phone_counter_readings
       WHERE business_id = $1
         AND timestamp::date = CURRENT_DATE`,
      [businessId]
    ),
    // Live queue alerts — fired by the node's queue-depth logic and
    // debounced 10m by the webhook handler. 15m window so an alert
    // that fired just before the user opens the tab is still visible.
    pool.query(
      `SELECT zone_name, device_id, queue_depth, alerted_at
         FROM queue_alerts
        WHERE business_id = $1
          AND acknowledged_at IS NULL
          AND alerted_at > NOW() - INTERVAL '15 minutes'
        ORDER BY alerted_at DESC
        LIMIT 5`,
      [businessId]
    ),
  ]);

  const occRow = occupancyRow.rows[0] || {};
  const currentOccupancy = occRow.entrance_zone_count > 0
    ? occRow.entrance_occupancy
    : occRow.all_zones_occupancy;

  const alerts = [];

  // Device offline — any node that's been silent >30m but uploaded
  // earlier today is treated as offline. (A node that never uploaded
  // today simply isn't returned by the devices query.)
  for (const dev of devices.rows) {
    const ago = Date.now() - new Date(dev.last_seen).getTime();
    if (ago > 30 * 60_000) {
      alerts.push({ type: 'device_offline', device: dev.device_id, last_seen: dev.last_seen });
    }
  }

  // Queue forming — server-driven so the frontend doesn't need to
  // re-derive from the per-zone occupancy figures.
  for (const q of queueAlerts.rows) {
    alerts.push({
      type: 'queue',
      message: `Queue forming at ${q.zone_name || 'till'} (${q.queue_depth} waiting)`,
    });
  }

  // Out-of-hours activity. Same threshold as the previous client-side
  // check (7am – 10pm = the "normal" window). Only fires when there
  // is actual movement, not just an idle node still online.
  const hour = new Date().getHours();
  const recentEntries = zones.rows.reduce((s, z) => s + (z.entries || 0), 0);
  if ((hour < 7 || hour > 22) && recentEntries > 0) {
    alerts.push({ type: 'after_hours', message: 'Unusual out-of-hours activity detected' });
  }

  const status = zones.rows.length === 0 && currentOccupancy === 0 ? 'no_data' : 'normal';

  return {
    status,
    current_occupancy: currentOccupancy,
    current_entries: recentEntries,
    baseline_expected: null,
    last_reading_at: devices.rows[0]?.last_seen || null,
    today_activity: hourly.rows,
    recent_zones: zones.rows,
    devices: devices.rows,
    alerts,
  };
}

async function getCurrentStatus(businessId) {
  // Source auto-detection. If any node has uploaded a reading in the
  // last 24h, we treat this business as a node-only setup and skip the
  // kilo path entirely — even if stale kilo rows still exist. The user
  // operating a TapProve Node fleet would otherwise see empty
  // realtime data because kilo_people_counting isn't being written.
  const { rows: nodeProbe } = await pool.query(
    `SELECT 1 FROM phone_counter_readings
      WHERE business_id = $1
        AND timestamp > NOW() - INTERVAL '24 hours'
      LIMIT 1`,
    [businessId]
  );
  if (nodeProbe.length > 0) {
    return getCurrentStatusFromNodes(businessId);
  }

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

// ---------------------------------------------------------------------------
// Live zones (Dander Node phone counter)
// ---------------------------------------------------------------------------
// A zone is "active" if it reported within the last 2 minutes. Within that
// window we sum count_in / count_out (each reading is a delta), and pick
// the latest noise_label / wifi / bluetooth / lux for the at-a-glance card.

async function getLiveZones(businessId) {
  const { rows } = await pool.query(
    `WITH win AS (
       SELECT *
         FROM phone_counter_readings
        WHERE business_id = $1
          AND timestamp > NOW() - INTERVAL '2 minutes'
          AND zone_name IS NOT NULL
     )
     SELECT
       zone_name,
       (array_agg(zone_type   ORDER BY timestamp DESC) FILTER (WHERE zone_type IS NOT NULL))[1] AS zone_type,
       (array_agg(noise_label ORDER BY timestamp DESC) FILTER (WHERE noise_label IS NOT NULL))[1] AS noise_label,
       (array_agg(till_mode   ORDER BY timestamp DESC) FILTER (WHERE till_mode   IS NOT NULL))[1] AS till_mode,
       -- queue_depth / queue_alert are latest (not summed) — they're
       -- live state, not deltas.
       (array_agg(queue_depth ORDER BY timestamp DESC) FILTER (WHERE queue_depth IS NOT NULL))[1] AS queue_depth,
       (array_agg(queue_alert ORDER BY timestamp DESC) FILTER (WHERE queue_alert IS NOT NULL))[1] AS queue_alert,
       COALESCE(SUM(count_in), 0)::int  AS count_in,
       COALESCE(SUM(count_out), 0)::int AS count_out,
       AVG(noise_db)::float       AS noise_db,
       MAX(wifi_count)::int       AS wifi_count,
       COALESCE(SUM(bluetooth_count), 0)::int AS bluetooth_count,
       AVG(light_lux)::float      AS light_lux,
       MAX(timestamp)             AS last_seen
     FROM win
     GROUP BY zone_name
     ORDER BY zone_name`,
    [businessId]
  );
  return rows;
}

module.exports = {
  getDashboard, getCurrentStatus, generatePlaceholderData,
  getFootfallSummary, getHourlyFootfall,
  getLiveZones,
};
