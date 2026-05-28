'use strict';

/**
 * webhooks.js — inbound device webhooks.
 *
 * POST /api/webhooks/footfallcam
 *   Receives periodic reports from FootfallCam Pro2 devices. No auth —
 *   the device pushes directly. We log the full raw body (we're still
 *   confirming the exact field names the hardware sends), store the
 *   untouched payload in raw_payload, best-effort parse the known fields,
 *   and ALWAYS return 200 so the device never backs off.
 *
 * GET /api/webhooks/footfallcam/test
 *   Reachability probe.
 */

const { Router } = require('express');
const pool = require('../db/pool');

const router = Router();

function num(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// GET /api/webhooks/footfallcam/test
// ---------------------------------------------------------------------------

router.get('/footfallcam/test', (_req, res) => {
  return res.status(200).json({ ok: true, message: 'FootfallCam webhook endpoint is ready' });
});

// ---------------------------------------------------------------------------
// POST /api/webhooks/footfallcam
// ---------------------------------------------------------------------------

router.post('/footfallcam', async (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};

  // Log everything — we need to see the real shape the device sends.
  console.log('[webhooks/footfallcam] raw payload:', JSON.stringify(payload));

  try {
    const serial =
      payload.sn || payload.serial || payload.device_sn || payload.deviceSn || null;

    if (!serial) {
      console.warn('[webhooks/footfallcam] no device serial found in payload — nothing stored.');
      return res.status(200).json({ success: true, received: true });
    }

    // Timestamp — accept several field names, fall back to now if absent/bad.
    const tsRaw = payload.time || payload.timestamp || payload.ts || null;
    let ts = tsRaw ? new Date(tsRaw) : new Date();
    if (Number.isNaN(ts.getTime())) ts = new Date();

    const countIn   = num(payload.in        ?? payload.count_in     ?? payload.countIn);
    const countOut  = num(payload.out       ?? payload.count_out    ?? payload.countOut);
    const wifi      = num(payload.wifi       ?? payload.wifi_devices ?? payload.wifiDevices);
    const occupancy = payload.occupancy != null || payload.current != null
      ? num(payload.occupancy ?? payload.current)
      : Math.max(0, countIn - countOut);

    const heatmap  = payload.heatmap ?? payload.heatmap_data ?? null;
    const queue    = payload.queue   ?? payload.queue_data   ?? null;
    const firmware = payload.firmware || payload.firmware_version || payload.fw || null;
    const ip       = req.headers['x-forwarded-for'] || req.ip || null;

    // Resolve the owning business (may be null if the device isn't registered).
    let businessId = null;
    const { rows } = await pool.query(
      'SELECT business_id FROM footfallcam_devices WHERE device_serial = $1',
      [serial]
    );
    if (rows.length > 0) {
      businessId = rows[0].business_id;
    } else {
      console.warn(`[webhooks/footfallcam] unregistered device "${serial}" — storing reading with null business_id.`);
    }

    // Store the reading. raw_payload keeps the whole body verbatim.
    await pool.query(
      `INSERT INTO footfallcam_readings
         (device_serial, business_id, timestamp, count_in, count_out, occupancy,
          wifi_devices, heatmap_data, queue_data, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [serial, businessId, ts, countIn, countOut, occupancy, wifi, heatmap, queue, payload]
    );

    // Upsert device registry — refresh last_seen + firmware/ip if present.
    await pool.query(
      `INSERT INTO footfallcam_devices (device_serial, last_seen, firmware_version, ip_address)
       VALUES ($1, NOW(), $2, $3)
       ON CONFLICT (device_serial) DO UPDATE
         SET last_seen        = NOW(),
             firmware_version = COALESCE(EXCLUDED.firmware_version, footfallcam_devices.firmware_version),
             ip_address       = COALESCE(EXCLUDED.ip_address, footfallcam_devices.ip_address),
             updated_at       = NOW()`,
      [serial, firmware, typeof ip === 'string' ? ip.slice(0, 50) : null]
    );

    return res.status(200).json({ success: true, received: true });
  } catch (err) {
    // Never reject the device — log and 200 so it keeps reporting.
    console.error('[webhooks/footfallcam] processing error:', err);
    return res.status(200).json({ success: true, received: true });
  }
});

module.exports = router;
