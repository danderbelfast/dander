'use strict';

/**
 * devices.js — business-facing device management for FootfallCam sensors.
 *
 *   POST /api/devices/footfallcam/register  — link a serial to the business
 *   GET  /api/devices/footfallcam/live      — latest reading per device
 *   GET  /api/devices/footfallcam           — all devices + reading counts
 *
 * All require a business JWT (requireBusiness attaches req.business).
 */

const { Router } = require('express');
const pool = require('../db/pool');
const { requireBusiness } = require('../middleware/auth');

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/devices/footfallcam/register
// body: { device_serial, device_name? }
// ---------------------------------------------------------------------------

router.post('/footfallcam/register', requireBusiness, async (req, res) => {
  const { device_serial, device_name } = req.body || {};
  if (!device_serial || typeof device_serial !== 'string') {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'device_serial is required.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO footfallcam_devices (device_serial, business_id, device_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (device_serial) DO UPDATE
         SET business_id = EXCLUDED.business_id,
             device_name = COALESCE(EXCLUDED.device_name, footfallcam_devices.device_name),
             is_active   = true,
             updated_at  = NOW()
       RETURNING *`,
      [device_serial.trim(), req.business.id, device_name || null]
    );
    return res.status(200).json({ success: true, device: rows[0] });
  } catch (err) {
    console.error('[devices/footfallcam/register]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to register device.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/devices/footfallcam/live
// Most recent reading per device for this business.
// ---------------------------------------------------------------------------

router.get('/footfallcam/live', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (d.device_serial)
              d.device_serial,
              d.device_name,
              d.last_seen,
              r.timestamp    AS reading_timestamp,
              r.count_in,
              r.count_out,
              r.occupancy,
              r.wifi_devices
         FROM footfallcam_devices d
         LEFT JOIN footfallcam_readings r ON r.device_serial = d.device_serial
        WHERE d.business_id = $1
        ORDER BY d.device_serial, r.timestamp DESC NULLS LAST`,
      [req.business.id]
    );

    const devices = rows.map((row) => ({
      device_serial: row.device_serial,
      device_name:   row.device_name,
      last_seen:     row.last_seen,
      latest_reading: row.reading_timestamp
        ? {
            timestamp:    row.reading_timestamp,
            count_in:     row.count_in,
            count_out:    row.count_out,
            occupancy:    row.occupancy,
            wifi_devices: row.wifi_devices,
          }
        : null,
    }));

    return res.status(200).json({ success: true, devices });
  } catch (err) {
    console.error('[devices/footfallcam/live]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to fetch live data.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/devices/footfallcam
// All devices linked to this business + lifetime reading counts.
// ---------------------------------------------------------------------------

router.get('/footfallcam', requireBusiness, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*,
              COALESCE(r.reading_count, 0)::int AS reading_count,
              r.last_reading_at
         FROM footfallcam_devices d
         LEFT JOIN (
           SELECT device_serial,
                  COUNT(*)        AS reading_count,
                  MAX(timestamp)  AS last_reading_at
             FROM footfallcam_readings
            WHERE business_id = $1
            GROUP BY device_serial
         ) r ON r.device_serial = d.device_serial
        WHERE d.business_id = $1
        ORDER BY d.created_at DESC`,
      [req.business.id]
    );
    return res.status(200).json({ success: true, devices: rows });
  } catch (err) {
    console.error('[devices/footfallcam GET]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to fetch devices.' });
  }
});

module.exports = router;
