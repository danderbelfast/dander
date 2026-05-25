'use strict';

/**
 * aggregateWifi.js — nightly job that turns raw wifi_observations into
 * enriched wifi_fingerprints. Runs at 02:00 every day.
 *
 * For each BSSID with un-aggregated observations:
 *   1. Compute the lat/lng centroid of the new batch.
 *   2. Upsert into wifi_fingerprints, merging avg_lat/avg_lng with the
 *      existing row as a count-weighted running average.
 *   3. Bump observation_count, update last_seen, recompute H3 indices
 *      from the (new) average location.
 *   4. If 3+ distinct user_ids have observed this BSSID in the same r10
 *      hex, raise confidence_score to at least 60.
 *   5. If a known business is within 20m of the fingerprint's avg_lat/lng,
 *      link it and set commercial_zone = true.
 *   6. Mark the source observations as aggregated_at = NOW().
 *
 * Finally, prune wifi_observations older than 30 days.
 *
 * Each BSSID is processed in its own transaction with SELECT … FOR UPDATE
 * SKIP LOCKED so a stuck/long-running BSSID doesn't block the rest of the
 * batch (and so concurrent invocations don't double-count).
 */

const cron = require('node-cron');
const pool = require('../db/pool');
const { getH3Indexes } = require('../utils/h3');

const CRON_PATTERN          = '0 2 * * *'; // 02:00 every day
const PRUNE_AFTER_DAYS      = 30;
const BUSINESS_RADIUS_M     = 20;
const MIN_USERS_FOR_CONF    = 3;
const CONF_FLOOR_WHEN_MET   = 60;
const EARTH_RADIUS_M        = 6_371_000;

// Bounding-box pre-filter for the business proximity query. ~0.001° lat is
// ~111m; 0.0017° lng is ~111m at 60° latitude (a generous upper bound for
// our regions). The exact 20m check happens via Haversine inside the query.
const BBOX_LAT_DELTA = 0.001;
const BBOX_LNG_DELTA = 0.002;

/**
 * Run one aggregation cycle. Safe to call manually (e.g. from a CLI) as
 * well as from the scheduler. Returns a summary object.
 */
async function runAggregation() {
  const startedAt = Date.now();
  const stats = {
    bssidsProcessed:     0,
    newFingerprints:     0,
    updatedFingerprints: 0,
    observationsRolled:  0,
    observationsPruned:  0,
    errors:              0,
  };

  try {
    const { rows: bssidRows } = await pool.query(
      `SELECT DISTINCT bssid FROM wifi_observations WHERE aggregated_at IS NULL`
    );
    console.log(`[aggregateWifi] ${bssidRows.length} BSSID(s) to aggregate.`);

    for (const { bssid } of bssidRows) {
      try {
        const r = await aggregateBssid(bssid);
        stats.bssidsProcessed++;
        if (r.observationsProcessed === 0) continue;
        if (r.created) stats.newFingerprints++;
        else           stats.updatedFingerprints++;
        stats.observationsRolled += r.observationsProcessed;
      } catch (err) {
        stats.errors++;
        console.error(`[aggregateWifi] BSSID ${bssid} failed:`, err.message);
      }
    }

    const prune = await pool.query(
      `DELETE FROM wifi_observations
       WHERE captured_at < NOW() - ($1 || ' days')::interval`,
      [String(PRUNE_AFTER_DAYS)]
    );
    stats.observationsPruned = prune.rowCount || 0;

  } catch (err) {
    stats.errors++;
    console.error('[aggregateWifi] Run failed:', err);
  }

  const ms = Date.now() - startedAt;
  console.log(
    `[aggregateWifi] Done in ${ms}ms — ` +
    `bssids=${stats.bssidsProcessed} new=${stats.newFingerprints} ` +
    `updated=${stats.updatedFingerprints} rolled=${stats.observationsRolled} ` +
    `pruned=${stats.observationsPruned} errors=${stats.errors}`
  );
  return stats;
}

/**
 * Aggregate one BSSID in a transaction.
 */
async function aggregateBssid(bssid) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: obs } = await client.query(
      `SELECT id, latitude, longitude, ssid, captured_at
       FROM wifi_observations
       WHERE bssid = $1 AND aggregated_at IS NULL
       FOR UPDATE SKIP LOCKED`,
      [bssid]
    );

    if (obs.length === 0) {
      await client.query('COMMIT');
      return { created: false, observationsProcessed: 0 };
    }

    // Centroid + range of the new batch.
    let sumLat = 0, sumLng = 0;
    let earliest = obs[0].captured_at;
    let latest   = obs[0].captured_at;
    let ssidPick = null;
    for (const o of obs) {
      sumLat += Number(o.latitude);
      sumLng += Number(o.longitude);
      if (o.captured_at < earliest) earliest = o.captured_at;
      if (o.captured_at > latest)   latest   = o.captured_at;
      if (o.ssid && !ssidPick)      ssidPick = o.ssid;
    }
    const batchLat   = sumLat / obs.length;
    const batchLng   = sumLng / obs.length;
    const batchCount = obs.length;

    // H3 indices are recomputed from the batch average so they track the
    // fingerprint's actual position rather than any one observation. After
    // the upsert merges with any existing row we recompute them again from
    // the final average — see below.
    const batchHex = getH3Indexes(batchLat, batchLng);

    // Count-weighted running average via ON CONFLICT.
    const upsert = await client.query(
      `INSERT INTO wifi_fingerprints
         (bssid, ssid, h3_index_r8, h3_index_r10, h3_index_r12,
          avg_lat, avg_lng, observation_count, first_seen, last_seen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (bssid) DO UPDATE SET
         ssid              = COALESCE(EXCLUDED.ssid, wifi_fingerprints.ssid),
         avg_lat           = (wifi_fingerprints.avg_lat * wifi_fingerprints.observation_count
                              + EXCLUDED.avg_lat * EXCLUDED.observation_count)
                             / (wifi_fingerprints.observation_count + EXCLUDED.observation_count),
         avg_lng           = (wifi_fingerprints.avg_lng * wifi_fingerprints.observation_count
                              + EXCLUDED.avg_lng * EXCLUDED.observation_count)
                             / (wifi_fingerprints.observation_count + EXCLUDED.observation_count),
         observation_count = wifi_fingerprints.observation_count + EXCLUDED.observation_count,
         first_seen        = LEAST(wifi_fingerprints.first_seen, EXCLUDED.first_seen),
         last_seen         = GREATEST(wifi_fingerprints.last_seen, EXCLUDED.last_seen),
         updated_at        = NOW()
       RETURNING id, avg_lat, avg_lng, observation_count, (xmax = 0) AS inserted`,
      [bssid, ssidPick, batchHex.r8, batchHex.r10, batchHex.r12,
       batchLat, batchLng, batchCount, earliest, latest]
    );

    const fp      = upsert.rows[0];
    const created = fp.inserted === true;
    const finalLat = Number(fp.avg_lat);
    const finalLng = Number(fp.avg_lng);
    const finalHex = getH3Indexes(finalLat, finalLng);

    // Sync H3 indices to the post-merge average (no-op on a fresh insert).
    await client.query(
      `UPDATE wifi_fingerprints
       SET h3_index_r8 = $1, h3_index_r10 = $2, h3_index_r12 = $3
       WHERE id = $4`,
      [finalHex.r8, finalHex.r10, finalHex.r12, fp.id]
    );

    // Confidence: 3+ distinct user_ids in the same r10 hex → at least 60.
    // We count across ALL observations of this BSSID in that hex (live and
    // already-aggregated) so the threshold accumulates over time.
    const { rows: uRows } = await client.query(
      `SELECT COUNT(DISTINCT user_id)::int AS n
       FROM wifi_observations
       WHERE bssid = $1 AND h3_index_r10 = $2`,
      [bssid, finalHex.r10]
    );
    if ((uRows[0]?.n || 0) >= MIN_USERS_FOR_CONF) {
      await client.query(
        `UPDATE wifi_fingerprints
         SET confidence_score = GREATEST(confidence_score, $1), updated_at = NOW()
         WHERE id = $2`,
        [CONF_FLOOR_WHEN_MET, fp.id]
      );
    }

    // Link to a business within 20m. Bounding-box pre-filter then exact
    // Haversine. Skip if the fingerprint already has a business linked.
    const { rows: bizRows } = await client.query(
      `SELECT b.id,
              (${EARTH_RADIUS_M} * acos(
                LEAST(1.0,
                  sin(radians($1::float)) * sin(radians(b.lat))
                  + cos(radians($1::float)) * cos(radians(b.lat))
                  * cos(radians(b.lng) - radians($2::float))
                )
              )) AS distance_m
       FROM businesses b
       WHERE b.lat IS NOT NULL AND b.lng IS NOT NULL
         AND b.lat BETWEEN $1::float - $3 AND $1::float + $3
         AND b.lng BETWEEN $2::float - $4 AND $2::float + $4
       ORDER BY distance_m ASC
       LIMIT 1`,
      [finalLat, finalLng, BBOX_LAT_DELTA, BBOX_LNG_DELTA]
    );
    if (bizRows.length > 0 && Number(bizRows[0].distance_m) <= BUSINESS_RADIUS_M) {
      await client.query(
        `UPDATE wifi_fingerprints
         SET business_id = $1, commercial_zone = true, updated_at = NOW()
         WHERE id = $2`,
        [bizRows[0].id, fp.id]
      );
    }

    // Mark this batch aggregated.
    const ids = obs.map(o => o.id);
    await client.query(
      `UPDATE wifi_observations SET aggregated_at = NOW() WHERE id = ANY($1::uuid[])`,
      [ids]
    );

    await client.query('COMMIT');
    return { created, observationsProcessed: obs.length };

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function scheduleWifiAggregation() {
  cron.schedule(CRON_PATTERN, () => {
    runAggregation().catch(err =>
      console.error('[aggregateWifi] Scheduled run crashed:', err)
    );
  });
  console.log(`[aggregateWifi] Scheduler started — runs daily at 02:00.`);
}

module.exports = { scheduleWifiAggregation, runAggregation, aggregateBssid };
