'use strict';

/**
 * retentionCron.js — daily cleanup of node telemetry under
 * GDPR Article 5(1)(e) ("storage limitation").
 *
 * Retention horizon comes from config.PHONE_COUNTER_RETENTION_DAYS
 * (default 395 days = 13 months — covers year-over-year seasonal
 * comparisons while not retaining indefinitely). Set 0 to disable.
 *
 * Schedule: daily at 03:30 UTC. Off-peak for the Belfast trial and
 * for any UK shop using the dashboard; analytics queries spanning the
 * cleared window run a few seconds slower while indexes update,
 * which we'd rather happen at 3:30am than during opening hours.
 *
 * bt_position_log has its own 24-hour TTL in positionHeatmap.js:207
 * — this cron does NOT touch that table.
 */

const cron = require('node-cron');
const pool = require('../db/pool');
const config = require('../src/config');

async function pruneOldReadings() {
  const days = config.PHONE_COUNTER_RETENTION_DAYS;
  if (!Number.isFinite(days) || days <= 0) {
    return { skipped: true, reason: 'retention disabled (PHONE_COUNTER_RETENTION_DAYS<=0)' };
  }
  const { rowCount } = await pool.query(
    `DELETE FROM phone_counter_readings
      WHERE timestamp < NOW() - ($1 * INTERVAL '1 day')`,
    [days]
  );
  return { skipped: false, days, deleted: rowCount };
}

function scheduleRetention() {
  const days = config.PHONE_COUNTER_RETENTION_DAYS;
  if (!Number.isFinite(days) || days <= 0) {
    console.log('[retention] phone_counter_readings retention DISABLED (PHONE_COUNTER_RETENTION_DAYS<=0)');
    return;
  }
  cron.schedule('30 3 * * *', async () => {
    try {
      const result = await pruneOldReadings();
      if (result.skipped) {
        console.log(`[retention] skipped: ${result.reason}`);
      } else if (result.deleted > 0) {
        console.log(`[retention] pruned ${result.deleted} phone_counter_readings row(s) older than ${result.days} days.`);
      }
    } catch (err) {
      console.error('[retention] prune failed:', err.message);
    }
  });
  console.log(`[retention] Retention scheduler started — daily 03:30 UTC, ${days}-day horizon for phone_counter_readings.`);
}

module.exports = { scheduleRetention, pruneOldReadings };
