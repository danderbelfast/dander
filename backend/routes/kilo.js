'use strict';

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');

const pool = require('../db/pool');
const { requireBusiness } = require('../middleware/auth');
const { dispatchEvent } = require('../services/webhookService');

const router = Router();

// In-memory quiet state per device — tracks when footfall drops below threshold
const quietState = new Map();

const FOOTFALL_THRESHOLD = parseInt(process.env.KILO_FOOTFALL_THRESHOLD, 10) || 10;

router.use(requireBusiness);

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}
function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}
function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg); return false; }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/kilo/devices — register a new device
// ---------------------------------------------------------------------------

router.post(
  '/devices',
  [
    body('device_id').notEmpty().trim().withMessage('device_id is required.'),
    body('label').optional().trim().isLength({ max: 100 }),
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
    body('meta').optional().isObject(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { device_id, label, lat, lng, meta } = req.body;

      const existing = await pool.query(
        'SELECT id FROM kilo_devices WHERE device_id = $1', [device_id]
      );
      if (existing.rows.length > 0) {
        return fail(res, 409, 'DEVICE_EXISTS', 'A device with this ID is already registered.');
      }

      const { rows } = await pool.query(
        `INSERT INTO kilo_devices (business_id, device_id, label, lat, lng, meta)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.business.id, device_id, label || null, lat || null, lng || null, meta || {}]
      );
      return ok(res, { device: rows[0] }, 201);
    } catch (err) {
      console.error('[kilo/devices POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to register device.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/kilo/devices — list devices for this business
// ---------------------------------------------------------------------------

router.get('/devices', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM kilo_devices
       WHERE business_id = $1 AND status != 'decommissioned'
       ORDER BY created_at DESC`,
      [req.business.id]
    );
    return ok(res, { devices: rows });
  } catch (err) {
    console.error('[kilo/devices GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to list devices.');
  }
});

// ---------------------------------------------------------------------------
// PUT /api/kilo/devices/:id — update device (label, location, meta)
// ---------------------------------------------------------------------------

router.put(
  '/devices/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('Invalid device ID.'),
    body('label').optional().trim().isLength({ max: 100 }),
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
    body('meta').optional().isObject(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const fields = [];
      const values = [];
      let idx = 1;

      for (const key of ['label', 'lat', 'lng', 'meta']) {
        if (req.body[key] !== undefined) {
          fields.push(`${key} = $${idx++}`);
          values.push(key === 'meta' ? JSON.stringify(req.body[key]) : req.body[key]);
        }
      }

      if (fields.length === 0) {
        return fail(res, 400, 'VALIDATION_ERROR', 'No fields to update.');
      }

      values.push(req.params.id, req.business.id);
      const { rows } = await pool.query(
        `UPDATE kilo_devices SET ${fields.join(', ')}
         WHERE id = $${idx} AND business_id = $${idx + 1}
         RETURNING *`,
        values
      );

      if (rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Device not found.');
      return ok(res, { device: rows[0] });
    } catch (err) {
      console.error('[kilo/devices PUT]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to update device.');
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/kilo/devices/:id — decommission device (soft delete)
// ---------------------------------------------------------------------------

router.delete(
  '/devices/:id',
  [param('id').isInt({ min: 1 }).withMessage('Invalid device ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rowCount } = await pool.query(
        `UPDATE kilo_devices SET status = 'decommissioned'
         WHERE id = $1 AND business_id = $2`,
        [req.params.id, req.business.id]
      );
      if (rowCount === 0) return fail(res, 404, 'NOT_FOUND', 'Device not found.');
      return ok(res, { message: 'Device decommissioned.' });
    } catch (err) {
      console.error('[kilo/devices DELETE]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to decommission device.');
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/kilo/devices/:deviceId/reading — record a sensor reading
// Transitions assigned → active on first reading
// ---------------------------------------------------------------------------

router.post(
  '/devices/:deviceId/reading',
  [
    param('deviceId').notEmpty().withMessage('Device ID is required.'),
    body('reading_value').isNumeric().withMessage('reading_value is required.'),
    body('device_type').optional().isString(),
    body('unit').optional().isString(),
    body('meta').optional().isObject(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const { rows } = await pool.query(
        `SELECT * FROM kilo_devices
         WHERE device_id = $1 AND business_id = $2 AND status != 'decommissioned'`,
        [req.params.deviceId, req.business.id]
      );

      if (rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Device not found.');

      const device = rows[0];
      const isFirstReading = device.status === 'assigned';
      const now = new Date().toISOString();
      const deviceType = req.body.device_type || device.device_type || 'people_counter';

      // Store reading
      const { rows: readingRows } = await pool.query(
        `INSERT INTO sensor_readings (device_id, business_id, device_type, reading_value, unit, meta, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [device.id, req.business.id, deviceType, req.body.reading_value, req.body.unit || 'count', req.body.meta || {}, now]
      );

      // Update device state
      const updates = { last_reading_at: now };
      if (isFirstReading) {
        updates.status = 'active';
        updates.first_reading_at = now;
      }

      const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
      const vals = Object.values(updates);
      vals.push(device.id);

      const { rows: updated } = await pool.query(
        `UPDATE kilo_devices SET ${setClauses.join(', ')}
         WHERE id = $${vals.length} RETURNING *`,
        vals
      );

      if (isFirstReading) {
        dispatchEvent(req.business.id, 'device.first_reading', {
          device_id: device.device_id,
          business_id: req.business.id,
          label: device.label,
          first_reading_at: now,
          reading_value: req.body.reading_value,
        });
      }

      // Build footfall context if this is a people_counter
      let footfall = null;
      if (deviceType === 'people_counter') {
        const ts = new Date(now);
        const dow = ts.getDay();
        const hour = ts.getHours();

        const { rows: bl } = await pool.query(
          `SELECT avg_footfall, sample_count FROM footfall_baselines
           WHERE business_id = $1 AND day_of_week = $2 AND hour_slot = $3`,
          [req.business.id, dow, hour]
        );

        const { rows: dataAge } = await pool.query(
          `SELECT
             MIN(recorded_at) AS earliest,
             COUNT(DISTINCT DATE(recorded_at))::int AS distinct_days
           FROM sensor_readings
           WHERE business_id = $1 AND device_type = 'people_counter'`,
          [req.business.id]
        );

        const earliest = dataAge[0]?.earliest;
        let weeksOfData = 0;
        let dataConfidence = 'low';
        if (earliest) {
          weeksOfData = Math.floor((Date.now() - new Date(earliest).getTime()) / (7 * 24 * 60 * 60 * 1000));
          if (weeksOfData >= 4) dataConfidence = 'high';
          else if (weeksOfData >= 2) dataConfidence = 'medium';
        }

        const baseline = bl[0] || null;
        const current = parseFloat(req.body.reading_value);
        const avg = baseline ? parseFloat(baseline.avg_footfall) : null;

        const isQuiet = current < FOOTFALL_THRESHOLD;
        const statusLabel = avg == null ? 'no_baseline'
          : current < avg * 0.6 ? 'quiet'
          : current > avg * 1.4 ? 'busy'
          : 'normal';

        footfall = {
          current_count: current,
          baseline_avg: avg,
          deviation: avg != null ? parseFloat((current - avg).toFixed(1)) : null,
          deviation_pct: avg != null && avg > 0 ? parseFloat((((current - avg) / avg) * 100).toFixed(1)) : null,
          status: statusLabel,
          data_confidence: dataConfidence,
          weeks_of_data: weeksOfData,
          sample_count: baseline?.sample_count || 0,
        };

        // Footfall alert / recovery dispatch
        const stateKey = `${req.business.id}:${device.device_id}`;
        const prev = quietState.get(stateKey) || { isQuiet: false, since: null };

        if (isQuiet && !prev.isQuiet) {
          quietState.set(stateKey, { isQuiet: true, since: new Date() });
          dispatchEvent(req.business.id, 'footfall.alert', {
            device_id: device.device_id,
            business_id: req.business.id,
            status: 'quiet',
            current_count: current,
            threshold: FOOTFALL_THRESHOLD,
            baseline_avg: avg,
          });
        } else if (!isQuiet && prev.isQuiet) {
          const quietMinutes = prev.since
            ? Math.round((Date.now() - prev.since.getTime()) / 60000)
            : 0;
          quietState.set(stateKey, { isQuiet: false, since: null });
          dispatchEvent(req.business.id, 'footfall.recovery', {
            device_id: device.device_id,
            business_id: req.business.id,
            status: 'recovered',
            current_count: current,
            threshold: FOOTFALL_THRESHOLD,
            quiet_duration_minutes: quietMinutes,
          });
        }
      }

      return ok(res, {
        reading: readingRows[0],
        device: updated[0],
        first_reading: isFirstReading,
        footfall,
      });
    } catch (err) {
      console.error('[kilo/devices/:deviceId/reading POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to record reading.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/kilo/baselines — get footfall baselines for this business
// ---------------------------------------------------------------------------

router.get('/baselines', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT day_of_week, hour_slot, avg_footfall, sample_count, last_calculated_at
       FROM footfall_baselines
       WHERE business_id = $1
       ORDER BY day_of_week, hour_slot`,
      [req.business.id]
    );

    const { rows: dataAge } = await pool.query(
      `SELECT MIN(recorded_at) AS earliest
       FROM sensor_readings
       WHERE business_id = $1 AND device_type = 'people_counter'`,
      [req.business.id]
    );
    const earliest = dataAge[0]?.earliest;
    let weeksOfData = 0;
    let dataConfidence = 'low';
    if (earliest) {
      weeksOfData = Math.floor((Date.now() - new Date(earliest).getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weeksOfData >= 4) dataConfidence = 'high';
      else if (weeksOfData >= 2) dataConfidence = 'medium';
    }

    return ok(res, { baselines: rows, data_confidence: dataConfidence, weeks_of_data: weeksOfData });
  } catch (err) {
    console.error('[kilo/baselines GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch baselines.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/kilo/baselines/recalculate — recalculate from last 56 days
// AVG(reading_value) grouped by DOW + hour for people_counter devices
// ---------------------------------------------------------------------------

router.post('/baselines/recalculate', async (req, res) => {
  try {
    const bizId = req.business.id;

    const { rows: slots } = await pool.query(
      `SELECT
         EXTRACT(DOW FROM recorded_at)::int  AS day_of_week,
         EXTRACT(HOUR FROM recorded_at)::int AS hour_slot,
         ROUND(AVG(reading_value), 2)        AS avg_footfall,
         COUNT(*)::int                       AS sample_count
       FROM sensor_readings
       WHERE business_id = $1
         AND device_type = 'people_counter'
         AND recorded_at >= NOW() - INTERVAL '56 days'
       GROUP BY day_of_week, hour_slot
       ORDER BY day_of_week, hour_slot`,
      [bizId]
    );

    let updated = 0;
    for (const slot of slots) {
      await pool.query(
        `INSERT INTO footfall_baselines (business_id, day_of_week, hour_slot, avg_footfall, sample_count, last_calculated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (business_id, day_of_week, hour_slot)
         DO UPDATE SET avg_footfall = $4, sample_count = $5, last_calculated_at = NOW()`,
        [bizId, slot.day_of_week, slot.hour_slot, slot.avg_footfall, slot.sample_count]
      );
      updated++;
    }

    return ok(res, { recalculated: true, slots_updated: updated });
  } catch (err) {
    console.error('[kilo/baselines/recalculate POST]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to recalculate baselines.');
  }
});

module.exports = router;
