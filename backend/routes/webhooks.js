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

// ---------------------------------------------------------------------------
// POST /api/webhooks/phone-counter
//
// Dander Node Android PoC posts a counts-only summary here every 60s. No
// auth (proof of concept). Always 200 so the device never backs off. Null
// numeric fields are accepted as "sensor unavailable" on the device.
// ---------------------------------------------------------------------------

router.post('/phone-counter', async (req, res) => {
  const p = req.body && typeof req.body === 'object' ? req.body : {};
  console.log('[webhooks/phone-counter] payload:', JSON.stringify(p));

  try {
    const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

    let ts = p.timestamp ? new Date(p.timestamp) : new Date();
    if (Number.isNaN(ts.getTime())) ts = new Date();

    const brands = (p.bt_brands && typeof p.bt_brands === 'object') ? p.bt_brands : {};

    await pool.query(
      `INSERT INTO phone_counter_readings
         (device_id, timestamp, count_in, count_out, noise_db, noise_label,
          wifi_count, bluetooth_count, light_lux,
          business_id, zone_name, zone_type,
          avg_dwell_seconds, max_dwell_seconds,
          dwell_under_30s, dwell_30_to_2min, dwell_2_to_5min, dwell_over_5min,
          bt_apple, bt_samsung, bt_google, bt_huawei, bt_other_android,
          queue_depth, queue_alert, orientation, till_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13, $14, $15, $16, $17, $18,
               $19, $20, $21, $22, $23,
               $24, $25, $26, $27)`,
      [
        typeof p.device_id === 'string' ? p.device_id.slice(0, 100) : null,
        ts,
        num(p.count_in),
        num(p.count_out),
        num(p.noise_db),
        typeof p.noise_label === 'string' ? p.noise_label.slice(0, 20) : null,
        num(p.wifi_count),
        num(p.bluetooth_count),
        num(p.light_lux),
        num(p.business_id),
        typeof p.zone_name === 'string' ? p.zone_name.slice(0, 100) : null,
        typeof p.zone_type === 'string' ? p.zone_type.slice(0, 30)  : null,
        num(p.avg_dwell_seconds),
        num(p.max_dwell_seconds),
        num(p.dwell_under_30s),
        num(p.dwell_30_to_2min),
        num(p.dwell_2_to_5min),
        num(p.dwell_over_5min),
        num(brands.apple),
        num(brands.samsung),
        num(brands.google),
        num(brands.huawei),
        num(brands.other_android),
        num(p.queue_depth),
        typeof p.queue_alert === 'boolean' ? p.queue_alert : null,
        typeof p.orientation === 'string' ? p.orientation.slice(0, 10) : null,
        typeof p.till_mode   === 'string' ? p.till_mode.slice(0, 20)   : null,
      ]
    );

    // Queue alert: insert if and only if there's no unacknowledged
    // alert for this (business_id, zone_name) pair in the last 10 min.
    // Debouncing means a steady busy queue doesn't spam the dashboard.
    if (p.queue_alert === true) {
      const businessId = num(p.business_id);
      const zoneName   = typeof p.zone_name === 'string' ? p.zone_name.slice(0, 100) : null;
      const deviceId   = typeof p.device_id === 'string' ? p.device_id.slice(0, 100) : null;
      const depth      = num(p.queue_depth);
      if (businessId != null && zoneName) {
        const { rows: existing } = await pool.query(
          `SELECT 1 FROM queue_alerts
            WHERE business_id = $1
              AND zone_name   = $2
              AND alerted_at  > NOW() - INTERVAL '10 minutes'
              AND acknowledged_at IS NULL
            LIMIT 1`,
          [businessId, zoneName]
        );
        if (existing.length === 0) {
          await pool.query(
            `INSERT INTO queue_alerts (business_id, zone_name, device_id, queue_depth)
             VALUES ($1, $2, $3, $4)`,
            [businessId, zoneName, deviceId, depth ?? 0]
          );
          console.log(`[queue-alert] business=${businessId} zone="${zoneName}" depth=${depth}`);
        }
      }
    }

    // BT trilateration feed: each (anonymous_id, rssi) seen this window
    // gets one row in bt_position_log so the 5-min trilateration job can
    // correlate sightings across nodes. We never store raw MACs — the
    // device hashes them with a per-day salt before they arrive.
    const businessId = num(p.business_id);
    const zoneName = typeof p.zone_name === 'string' ? p.zone_name.slice(0, 100) : null;
    const devices = Array.isArray(p.bt_devices) ? p.bt_devices.slice(0, 20) : [];
    if (businessId != null && zoneName && devices.length > 0) {
      const values = [];
      const params = [];
      let i = 1;
      for (const d of devices) {
        if (!d || typeof d.anonymous_id !== 'string' || d.anonymous_id.length === 0) continue;
        values.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4})`);
        params.push(businessId, zoneName, d.anonymous_id.slice(0, 16), num(d.rssi), ts);
        i += 5;
      }
      if (values.length > 0) {
        await pool.query(
          `INSERT INTO bt_position_log (business_id, zone_name, anonymous_id, rssi, recorded_at)
           VALUES ${values.join(', ')}`,
          params
        );
      }
    }

    // Two independent piggy-back payloads on the 200 response:
    //   commands → persistent remote-control state (node_commands)
    //   display  → one-shot loyalty greeting (node_display_commands)
    // Both are attached when present so the Node can pull state +
    // render a GIF in the same network round trip.
    const responsePayload = { success: true, received: true };

    if (typeof p.device_id === 'string' && p.device_id.length > 0) {
      const deviceId = p.device_id.slice(0, 100);

      const { rows: cmdRows } = await pool.query(
        `SELECT counting_enabled, zone_name, zone_type
           FROM node_commands
          WHERE device_id = $1`,
        [deviceId]
      );
      if (cmdRows.length > 0) {
        const c = cmdRows[0];
        responsePayload.commands = {
          counting_enabled: c.counting_enabled,
          zone_name: c.zone_name,
          zone_type: c.zone_type,
        };
      }

      // Drain the oldest undelivered display command for this device.
      // We mark it delivered immediately — if the Node never actually
      // renders it (process killed, screen off) we lose that greeting
      // but never re-deliver and confuse a later visitor.
      const { rows: dispRows } = await pool.query(
        `SELECT id, command
           FROM node_display_commands
          WHERE device_id = $1 AND delivered_at IS NULL
          ORDER BY created_at ASC
          LIMIT 1`,
        [deviceId]
      );
      if (dispRows.length > 0) {
        const d = dispRows[0];
        responsePayload.display = d.command;
        await pool.query(
          `UPDATE node_display_commands SET delivered_at = NOW() WHERE id = $1`,
          [d.id]
        );
      }
    }

    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error('[webhooks/phone-counter] store failed:', err.message);
    // fall through — still 200
  }

  return res.status(200).json({ success: true, received: true });
});

module.exports = router;
