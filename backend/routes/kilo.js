'use strict';

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');

const pool = require('../db/pool');
const { requireBusiness } = require('../middleware/auth');
const { dispatchEvent } = require('../services/webhookService');

const router = Router();

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
    body('footfall_count').optional().isInt({ min: 0 }),
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
          footfall_count: req.body.footfall_count ?? null,
        });
      }

      return ok(res, {
        device: updated[0],
        first_reading: isFirstReading,
      });
    } catch (err) {
      console.error('[kilo/devices/:deviceId/reading POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to record reading.');
    }
  }
);

module.exports = router;
