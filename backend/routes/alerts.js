'use strict';

/**
 * alerts.js — business-facing queue alert API.
 *
 *   GET  /api/alerts/queue           — unacknowledged alerts, newest first
 *   GET  /api/alerts/queue/count     — bell-badge count
 *   POST /api/alerts/queue/:id/acknowledge — clear one
 *
 * The webhook (POST /api/webhooks/phone-counter) is the only writer.
 * Alerts are debounced server-side: a steady-state busy queue only
 * inserts one row per 10-minute window per (business, zone). Once an
 * operator acknowledges, the next still-over-threshold reading after
 * the window can produce a fresh alert.
 */

const { Router } = require('express');
const pool = require('../db/pool');
const { requireBusiness } = require('../middleware/auth');

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/alerts/queue
// ---------------------------------------------------------------------------

router.get('/queue', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, zone_name, queue_depth, alerted_at, device_id
         FROM queue_alerts
        WHERE business_id = $1
          AND acknowledged_at IS NULL
        ORDER BY alerted_at DESC
        LIMIT 100`,
      [req.business.id]
    );
    return res.status(200).json({ success: true, alerts: rows });
  } catch (err) {
    console.error('[alerts/queue list]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load alerts.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/alerts/queue/count
// ---------------------------------------------------------------------------

router.get('/queue/count', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM queue_alerts
        WHERE business_id = $1
          AND acknowledged_at IS NULL`,
      [req.business.id]
    );
    return res.status(200).json({ success: true, count: rows[0]?.count ?? 0 });
  } catch (err) {
    console.error('[alerts/queue count]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load alert count.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/alerts/queue/:id/acknowledge
// ---------------------------------------------------------------------------

router.post('/queue/:id/acknowledge', requireBusiness, async (req, res) => {
  const id = String(req.params.id || '');
  if (!id) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'id is required.' });
  }
  try {
    const { rowCount } = await pool.query(
      `UPDATE queue_alerts
          SET acknowledged_at = NOW()
        WHERE id = $1
          AND business_id = $2
          AND acknowledged_at IS NULL`,
      [id, req.business.id]
    );
    if (rowCount === 0) {
      // Either not ours, not found, or already acked — treat all three the
      // same to avoid leaking whether the id exists for another business.
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Alert not found or already acknowledged.' });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[alerts/queue acknowledge]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to acknowledge alert.' });
  }
});

module.exports = router;
