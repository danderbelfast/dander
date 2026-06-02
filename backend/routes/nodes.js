'use strict';

/**
 * nodes.js — business-facing Dander Node device management.
 *
 *   GET  /api/nodes
 *     List paired Dander Node phones for this business with last-seen
 *     status and the current command row (if any).
 *
 *   POST /api/nodes/:device_id/commands
 *     Upsert a remote command for this device. The phone picks it up on
 *     its next 60s upload via the piggy-backed response from
 *     POST /api/webhooks/phone-counter.
 *
 * "Pairing" is implicit — a phone becomes "this business's node" the
 * first time it posts a phone-counter reading with the matching
 * business_id (which the SetupActivity flow stamps in). There's no
 * separate registration table; the source of truth is the most-recent
 * reading per device_id.
 */

const { Router } = require('express');
const pool = require('../db/pool');
const { requireBusiness } = require('../middleware/auth');

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/nodes/known           (no auth — used by the user-app BLE scanner)
//
// Returns just the device_id list of every currently-paired Dander Node
// across all businesses, plus its business_id so the user app can
// pair a sighting with the right loyalty target. No business names, no
// timestamps, no sensitive data — the scanner only needs to know
// "is this advertised device_id a Dander Node we should care about?"
// ---------------------------------------------------------------------------

router.get('/known', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (device_id) device_id, business_id
         FROM phone_counter_readings
        WHERE device_id IS NOT NULL
          AND business_id IS NOT NULL
          AND timestamp > NOW() - INTERVAL '7 days'
        ORDER BY device_id, timestamp DESC`
    );
    return res.status(200).json({ success: true, nodes: rows });
  } catch (err) {
    console.error('[nodes/known]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load known nodes.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/nodes
// ---------------------------------------------------------------------------

router.get('/', requireBusiness, async (req, res) => {
  try {
    // Latest reading per device for this business, joined to the command
    // row (if one exists). Online = last reading < 2 min ago.
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (r.device_id)
              r.device_id,
              r.zone_name,
              r.zone_type,
              r.timestamp AS last_seen,
              (NOW() - r.timestamp) < INTERVAL '2 minutes' AS online,
              COALESCE(c.counting_enabled, TRUE) AS counting_enabled,
              c.zone_name AS commanded_zone_name,
              c.zone_type AS commanded_zone_type,
              c.updated_at AS command_updated_at
         FROM phone_counter_readings r
         LEFT JOIN node_commands c ON c.device_id = r.device_id
        WHERE r.business_id = $1
          AND r.device_id IS NOT NULL
        ORDER BY r.device_id, r.timestamp DESC`,
      [req.business.id]
    );

    return res.status(200).json({ success: true, nodes: rows });
  } catch (err) {
    console.error('[nodes/list]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load nodes.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/nodes/:device_id/commands
// body: { counting_enabled?, zone_name?, zone_type?, camera_facing? }
// ---------------------------------------------------------------------------

router.post('/:device_id/commands', requireBusiness, async (req, res) => {
  const deviceId = String(req.params.device_id || '').slice(0, 100);
  if (!deviceId) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'device_id is required.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const countingEnabled = typeof body.counting_enabled === 'boolean' ? body.counting_enabled : null;
  const zoneName = typeof body.zone_name === 'string' ? body.zone_name.slice(0, 100) : null;
  const zoneType = typeof body.zone_type === 'string' ? body.zone_type.slice(0, 30)  : null;
  const cameraFacingRaw = typeof body.camera_facing === 'string' ? body.camera_facing : null;
  const cameraFacing = (cameraFacingRaw === 'front' || cameraFacingRaw === 'back') ? cameraFacingRaw : null;

  if (countingEnabled === null && zoneName === null && zoneType === null && cameraFacing === null) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'No command fields provided.' });
  }

  try {
    // Guard: device must actually be a node for *this* business — we
    // verify via a recent reading rather than a registration table.
    const own = await pool.query(
      `SELECT 1 FROM phone_counter_readings
        WHERE device_id = $1 AND business_id = $2
        LIMIT 1`,
      [deviceId, req.business.id]
    );
    if (own.rows.length === 0) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No device with that id for this business.' });
    }

    // Upsert. NULL fields in the body leave the existing value intact —
    // partial commands (e.g. just toggling counting) are common.
    const { rows } = await pool.query(
      `INSERT INTO node_commands
         (device_id, business_id, counting_enabled, zone_name, zone_type, camera_facing, updated_at)
       VALUES ($1, $2, COALESCE($3, TRUE), $4, $5, $6, NOW())
       ON CONFLICT (device_id) DO UPDATE
         SET business_id      = EXCLUDED.business_id,
             counting_enabled = COALESCE($3, node_commands.counting_enabled),
             zone_name        = COALESCE($4, node_commands.zone_name),
             zone_type        = COALESCE($5, node_commands.zone_type),
             camera_facing    = COALESCE($6, node_commands.camera_facing),
             updated_at       = NOW()
       RETURNING *`,
      [deviceId, req.business.id, countingEnabled, zoneName, zoneType, cameraFacing]
    );

    return res.status(200).json({ success: true, command: rows[0] });
  } catch (err) {
    console.error('[nodes/commands]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to upsert command.' });
  }
});

module.exports = router;
