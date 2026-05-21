'use strict';

const { Router } = require('express');
const crypto = require('crypto');
const pool   = require('../db/pool');

const router = Router();

function verifyKiloSignature(req, res, next) {
  const secret = process.env.KILO_API_KEY;
  if (!secret) return next();

  const signature = req.headers['x-kilo-signature'] || req.headers['x-dander-signature'];
  if (!signature) return next();

  const expected = crypto.createHmac('sha256', secret).update(req._rawBody || '').digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return res.status(401).json({ error: 'invalid_signature' });
    }
  } catch {
    return res.status(401).json({ error: 'invalid_signature' });
  }
  next();
}

// ---------------------------------------------------------------------------
// POST /api/kilo/webhook — receives push data from Kilo IoT platform
// ---------------------------------------------------------------------------

router.post('/webhook', verifyKiloSignature, async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'invalid_json', message: 'Request body must be valid JSON.' });
  }

  const deviceSn = payload.device_sn || payload.sn || payload.device_serial;
  if (!deviceSn) {
    return res.status(400).json({ error: 'missing_device_sn', message: 'device_sn is required.' });
  }

  let businessId = null;
  let readingsInserted = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Look up business by device_sn
    const { rows: deviceRows } = await client.query(
      `SELECT business_id FROM kilo_devices WHERE device_id = $1 AND status != 'decommissioned'
       UNION
       SELECT business_id FROM kilo_device_status WHERE device_sn = $1`,
      [deviceSn]
    );

    if (deviceRows.length > 0) {
      businessId = deviceRows[0].business_id;
    } else {
      console.warn(`[kilo/webhook] Unknown device_sn: ${deviceSn} — processing without business_id`);
    }

    // 2. Process line_total_data (zone-level people counting)
    const lineTotalData = payload.line_total_data || payload.line_data || [];
    for (const line of (Array.isArray(lineTotalData) ? lineTotalData : [])) {
      const ts = line.timestamp || line.time || payload.timestamp || new Date().toISOString();
      const zoneNum = line.line_number || line.zone_number || 1;

      await client.query(
        `INSERT INTO kilo_people_counting
           (business_id, device_sn, zone_number, timestamp, interval_seconds,
            entries, exits, occupancy, male_count, female_count,
            adult_count, child_count, passersby, staff_count,
            staff_avg_dwell_time, effective_audience, avg_attention_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (business_id, device_sn, timestamp, zone_number)
         DO UPDATE SET
           entries = EXCLUDED.entries, exits = EXCLUDED.exits,
           occupancy = EXCLUDED.occupancy, male_count = EXCLUDED.male_count,
           female_count = EXCLUDED.female_count, adult_count = EXCLUDED.adult_count,
           child_count = EXCLUDED.child_count, passersby = EXCLUDED.passersby,
           staff_count = EXCLUDED.staff_count, staff_avg_dwell_time = EXCLUDED.staff_avg_dwell_time,
           effective_audience = EXCLUDED.effective_audience, avg_attention_time = EXCLUDED.avg_attention_time`,
        [
          businessId, deviceSn, zoneNum, ts,
          line.interval || line.interval_seconds || 900,
          line.in || line.entries || 0,
          line.out || line.exits || 0,
          line.occupancy || 0,
          line.male || line.male_count || 0,
          line.female || line.female_count || 0,
          line.adult || line.adult_count || 0,
          line.child || line.child_count || 0,
          line.passersby || 0,
          line.staff || line.staff_count || 0,
          line.staff_avg_dwell_time || 0,
          line.effective_audience || 0,
          line.avg_attention_time || 0,
        ]
      );
      readingsInserted++;
    }

    // 3. Process region_data (region counting + dwell times)
    const regionData = payload.region_data || {};
    const regionCounts = regionData.region_count_data || [];
    const dwellTimes = regionData.dwell_time_data || [];
    const dwellMap = {};
    for (const d of (Array.isArray(dwellTimes) ? dwellTimes : [])) {
      dwellMap[d.region_number || d.zone_number] = d;
    }

    for (const region of (Array.isArray(regionCounts) ? regionCounts : [])) {
      const ts = region.timestamp || payload.timestamp || new Date().toISOString();
      const zoneNum = region.region_number || region.zone_number || 1;
      const dwell = dwellMap[zoneNum] || {};

      await client.query(
        `INSERT INTO kilo_people_counting
           (business_id, device_sn, zone_number, timestamp, interval_seconds,
            entries, exits, occupancy, passersby,
            effective_audience, avg_attention_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (business_id, device_sn, timestamp, zone_number)
         DO UPDATE SET
           entries = EXCLUDED.entries, exits = EXCLUDED.exits,
           occupancy = EXCLUDED.occupancy, passersby = EXCLUDED.passersby,
           effective_audience = EXCLUDED.effective_audience,
           avg_attention_time = EXCLUDED.avg_attention_time`,
        [
          businessId, deviceSn, zoneNum, ts,
          region.interval || 900,
          region.in || region.entries || 0,
          region.out || region.exits || 0,
          region.occupancy || region.count || 0,
          region.passersby || 0,
          dwell.effective_audience || 0,
          dwell.avg_attention_time || dwell.avg_dwell_time || 0,
        ]
      );
      readingsInserted++;
    }

    // 4. Also write to sensor_readings for baseline/insights compatibility
    const totalEntries = lineTotalData.reduce?.((s, l) => s + (l.in || l.entries || 0), 0) || 0;
    if (businessId && totalEntries > 0) {
      const { rows: devRows } = await client.query(
        `SELECT id FROM kilo_devices WHERE device_id = $1 AND business_id = $2`,
        [deviceSn, businessId]
      );
      if (devRows.length > 0) {
        await client.query(
          `INSERT INTO sensor_readings (device_id, business_id, device_type, reading_value, unit, meta, recorded_at)
           VALUES ($1, $2, 'people_counter', $3, 'count', '{}', NOW())`,
          [devRows[0].id, businessId, totalEntries]
        );
      }
    }

    // 5. Update device status
    const deviceInfo = payload.device_info || payload;
    await client.query(
      `INSERT INTO kilo_device_status
         (business_id, device_sn, device_name, device_mac, firmware_version,
          hardware_version, ip_address, last_seen, running_time_hours,
          network_status, iccid, imei, cell_id, lac)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12, $13)
       ON CONFLICT (device_sn) DO UPDATE SET
         last_seen = NOW(),
         device_name = COALESCE(EXCLUDED.device_name, kilo_device_status.device_name),
         firmware_version = COALESCE(EXCLUDED.firmware_version, kilo_device_status.firmware_version),
         hardware_version = COALESCE(EXCLUDED.hardware_version, kilo_device_status.hardware_version),
         ip_address = COALESCE(EXCLUDED.ip_address, kilo_device_status.ip_address),
         running_time_hours = COALESCE(EXCLUDED.running_time_hours, kilo_device_status.running_time_hours),
         network_status = COALESCE(EXCLUDED.network_status, kilo_device_status.network_status),
         iccid = COALESCE(EXCLUDED.iccid, kilo_device_status.iccid),
         imei = COALESCE(EXCLUDED.imei, kilo_device_status.imei),
         cell_id = COALESCE(EXCLUDED.cell_id, kilo_device_status.cell_id),
         lac = COALESCE(EXCLUDED.lac, kilo_device_status.lac)`,
      [
        businessId,
        deviceSn,
        deviceInfo.device_name || deviceInfo.name || null,
        deviceInfo.device_mac || deviceInfo.mac || null,
        deviceInfo.firmware_version || deviceInfo.fw || null,
        deviceInfo.hardware_version || deviceInfo.hw || null,
        deviceInfo.ip_address || deviceInfo.ip || null,
        deviceInfo.running_time_hours || deviceInfo.uptime || null,
        deviceInfo.network_status || 'online',
        deviceInfo.iccid || null,
        deviceInfo.imei || null,
        deviceInfo.cell_id || null,
        deviceInfo.lac || null,
      ]
    );

    await client.query('COMMIT');

    return res.json({ status: 'processed', readings_inserted: readingsInserted });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[kilo/webhook] Processing error:', err.message);
    return res.status(500).json({ error: 'processing_failed', message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
