'use strict';

/**
 * positionHeatmap.js — BT trilateration + position heatmap aggregation.
 *
 * Every 5 minutes:
 *   - Find businesses with 3+ active nodes (phone_counter_readings rows
 *     in the last 5 min, grouped by zone_name).
 *   - For each, pull anonymous_ids seen by 3+ nodes in bt_position_log.
 *   - Estimate position via weighted centroid of node grid positions
 *     (weights = 1/distance). Map distance via the log-distance path
 *     loss model from RSSI.
 *   - Snap to a 10x10 grid cell. Upsert into position_heatmap with a
 *     running average of dwell-in-window.
 *
 * Every hour:
 *   - Prune bt_position_log rows older than 24 hours.
 *
 * Node positions for the PoC come from zone_type — real floor-plan
 * mapping is a future feature. Positions:
 *   entrance → (0, 5)   till     → (9, 5)
 *   display  → (5, 9)   general  → (5, 0)
 */

const cron = require('node-cron');
const pool = require('../db/pool');

const ZONE_POSITIONS = {
  entrance: { x: 0, y: 5 },
  till:     { x: 9, y: 5 },
  display:  { x: 5, y: 9 },
  general:  { x: 5, y: 0 },
};

// Log-distance path-loss model. tx_power = expected RSSI at 1m;
// n = path-loss exponent (~2 free space, ~3-4 cluttered indoor).
// Returns metres — the absolute scale doesn't matter for centroid
// weights, only the relative ratios between nodes.
function rssiToDistance(rssi) {
  if (rssi == null || !Number.isFinite(rssi)) return 10;
  const txPower = -59;
  const n = 2.5;
  return Math.pow(10, (txPower - rssi) / (10 * n));
}

function positionFor(zoneType) {
  if (!zoneType) return null;
  return ZONE_POSITIONS[zoneType.toLowerCase()] || null;
}

// Weighted centroid trilateration. Not a true LS solver — but for a
// PoC that wants to map "this person is somewhere near these 3 nodes"
// to a 10x10 grid cell, centroid is honest about its precision and
// has no failure modes (no matrix to ill-condition).
function trilaterate(observations) {
  let wx = 0, wy = 0, wsum = 0;
  for (const o of observations) {
    const d = Math.max(rssiToDistance(o.rssi), 0.1);
    const w = 1 / d;
    wx += w * o.x;
    wy += w * o.y;
    wsum += w;
  }
  if (wsum === 0) return null;
  return { x: wx / wsum, y: wy / wsum };
}

function toGridCell(p) {
  return {
    x: Math.max(0, Math.min(9, Math.round(p.x))),
    y: Math.max(0, Math.min(9, Math.round(p.y))),
  };
}

/**
 * Returns businesses that currently have 3+ active nodes — defined as
 * 3+ distinct zone_names with rows in phone_counter_readings within
 * the trailing 5-minute window.
 */
async function activeBusinesses() {
  const { rows } = await pool.query(`
    SELECT business_id
    FROM (
      SELECT business_id, zone_name
      FROM phone_counter_readings
      WHERE business_id IS NOT NULL
        AND zone_name IS NOT NULL
        AND timestamp > NOW() - INTERVAL '5 minutes'
      GROUP BY business_id, zone_name
    ) z
    GROUP BY business_id
    HAVING COUNT(*) >= 3
  `);
  return rows.map(r => r.business_id);
}

/**
 * Latest known zone_type for each active zone in the last 5 min.
 * (Zones can in theory change type via re-pairing — we take the most
 * recent reading as authoritative.)
 */
async function zoneLayout(businessId) {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (zone_name) zone_name, zone_type
    FROM phone_counter_readings
    WHERE business_id = $1
      AND zone_name IS NOT NULL
      AND zone_type IS NOT NULL
      AND timestamp > NOW() - INTERVAL '5 minutes'
    ORDER BY zone_name, timestamp DESC
  `, [businessId]);

  const layout = new Map();
  for (const r of rows) {
    const pos = positionFor(r.zone_type);
    if (pos) layout.set(r.zone_name, { ...pos, type: r.zone_type });
  }
  return layout;
}

/**
 * One row per (anonymous_id, zone_name) for the trailing 5 min, with
 * average RSSI and first/last sighting times for dwell calc.
 */
async function recentSightings(businessId) {
  const { rows } = await pool.query(`
    SELECT anonymous_id,
           zone_name,
           AVG(rssi)::float       AS avg_rssi,
           MIN(recorded_at)       AS first_seen,
           MAX(recorded_at)       AS last_seen
    FROM bt_position_log
    WHERE business_id = $1
      AND recorded_at > NOW() - INTERVAL '5 minutes'
    GROUP BY anonymous_id, zone_name
  `, [businessId]);
  return rows;
}

/**
 * Upsert a cell hit into position_heatmap. Runs a Welford-style
 * running average for avg_dwell_seconds:
 *   new_avg = (old_avg * old_density + dwell) / (old_density + 1)
 */
async function recordCellHit(businessId, cell, dwellSeconds) {
  await pool.query(`
    INSERT INTO position_heatmap
      (business_id, hour_bucket, grid_x, grid_y, density, avg_dwell_seconds)
    VALUES
      ($1, date_trunc('hour', NOW()), $2, $3, 1, $4)
    ON CONFLICT (business_id, hour_bucket, grid_x, grid_y) DO UPDATE
      SET density = position_heatmap.density + 1,
          avg_dwell_seconds = CASE
            WHEN position_heatmap.avg_dwell_seconds IS NULL THEN $4
            ELSE (position_heatmap.avg_dwell_seconds * position_heatmap.density + $4)
                 / (position_heatmap.density + 1)
          END
  `, [businessId, cell.x, cell.y, dwellSeconds]);
}

async function processBusiness(businessId) {
  const layout = await zoneLayout(businessId);
  if (layout.size < 3) return 0;          // belt-and-braces

  const sightings = await recentSightings(businessId);

  // Group by anonymous_id.
  const byId = new Map();
  for (const s of sightings) {
    const pos = layout.get(s.zone_name);
    if (!pos) continue;                    // node has no resolved position
    let g = byId.get(s.anonymous_id);
    if (!g) { g = { obs: [], first: s.first_seen, last: s.last_seen }; byId.set(s.anonymous_id, g); }
    g.obs.push({ x: pos.x, y: pos.y, rssi: s.avg_rssi });
    if (s.first_seen < g.first) g.first = s.first_seen;
    if (s.last_seen  > g.last)  g.last  = s.last_seen;
  }

  let hits = 0;
  for (const [/* anonId */, g] of byId.entries()) {
    if (g.obs.length < 3) continue;        // need 3+ nodes for trilateration
    const point = trilaterate(g.obs);
    if (!point) continue;
    const cell = toGridCell(point);
    const dwellSec = Math.max(0,
      (new Date(g.last).getTime() - new Date(g.first).getTime()) / 1000);
    await recordCellHit(businessId, cell, dwellSec);
    hits++;
  }
  return hits;
}

async function runTrilateration() {
  const businessIds = await activeBusinesses();
  if (businessIds.length === 0) return { businesses: 0, cells: 0 };
  let total = 0;
  for (const id of businessIds) {
    try {
      total += await processBusiness(id);
    } catch (err) {
      console.error(`[positionHeatmap] business ${id} failed:`, err.message);
    }
  }
  return { businesses: businessIds.length, cells: total };
}

async function prunePositionLog() {
  const { rowCount } = await pool.query(`
    DELETE FROM bt_position_log
    WHERE recorded_at < NOW() - INTERVAL '24 hours'
  `);
  return rowCount;
}

function scheduleTrilateration() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const { businesses, cells } = await runTrilateration();
      if (businesses > 0) {
        console.log(`[positionHeatmap] trilateration: ${cells} cell hits across ${businesses} business(es).`);
      }
    } catch (err) {
      console.error('[positionHeatmap] trilateration cycle failed:', err.message);
    }
  });
  console.log('[positionHeatmap] Trilateration scheduler started — every 5 minutes.');
}

function schedulePositionLogPrune() {
  cron.schedule('17 * * * *', async () => {
    try {
      const n = await prunePositionLog();
      if (n > 0) console.log(`[positionHeatmap] pruned ${n} bt_position_log row(s) older than 24h.`);
    } catch (err) {
      console.error('[positionHeatmap] prune failed:', err.message);
    }
  });
  console.log('[positionHeatmap] Prune scheduler started — hourly at :17.');
}

module.exports = {
  scheduleTrilateration,
  schedulePositionLogPrune,
  runTrilateration,
  prunePositionLog,
  // exposed for unit-style sanity tests
  rssiToDistance,
  trilaterate,
  toGridCell,
  ZONE_POSITIONS,
};
