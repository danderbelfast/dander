'use strict';

/**
 * compliance.js — business-side compliance audit endpoints.
 *
 *   GET  /api/business/compliance/status
 *     Returns the business's current acceptance state for their
 *     country's privacy signage, used by the dashboard to decide
 *     whether to gate the first-node activation flow.
 *
 *   POST /api/business/compliance/accept-signage
 *     Log a fresh acceptance — captures who, when, country, signage
 *     version, IP, and user-agent. Idempotent insertion model: every
 *     accept logs a new row (so re-acceptance after a version bump
 *     is captured as a separate audit entry rather than mutating the
 *     previous row).
 */

const { Router } = require('express');
const pool = require('../db/pool');
const { requireBusiness } = require('../middleware/auth');
const signage = require('../services/signageVersions');

const router = Router();

router.use(requireBusiness);

router.get('/status', async (req, res) => {
  try {
    const { rows: bizRows } = await pool.query(
      `SELECT country_code FROM businesses WHERE id = $1`,
      [req.business.id]
    );
    const countryCode = bizRows[0]?.country_code || 'GB';
    const signageEntry = signage.forCountry(countryCode);
    const currentVersion = signageEntry?.version || null;

    const { rows: acceptRows } = await pool.query(
      `SELECT signage_version, accepted_at
         FROM business_compliance_acceptances
        WHERE business_id = $1
        ORDER BY accepted_at DESC
        LIMIT 1`,
      [req.business.id]
    );
    const lastAcceptance = acceptRows[0] || null;

    const acceptedCurrent = lastAcceptance != null
      && currentVersion != null
      && lastAcceptance.signage_version === currentVersion;

    return res.status(200).json({
      success: true,
      country_code: countryCode,
      signage: {
        version: currentVersion,
        label: signageEntry?.label || null,
        download_url: signage.publicUrlFor(countryCode),
      },
      last_accepted_at: lastAcceptance?.accepted_at || null,
      last_accepted_version: lastAcceptance?.signage_version || null,
      // The single boolean the dashboard's gate keys off. False when:
      //   - The business has never accepted, OR
      //   - They accepted an older version than what's currently
      //     deployed for their country.
      accepted_current: !!acceptedCurrent,
    });
  } catch (err) {
    console.error('[compliance/status]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load compliance status.' });
  }
});

router.post('/accept-signage', async (req, res) => {
  try {
    const { rows: bizRows } = await pool.query(
      `SELECT country_code FROM businesses WHERE id = $1`,
      [req.business.id]
    );
    const countryCode = bizRows[0]?.country_code || 'GB';
    const signageEntry = signage.forCountry(countryCode);
    if (!signageEntry) {
      return res.status(400).json({
        success: false,
        code: 'NO_SIGNAGE_FOR_COUNTRY',
        message: `No privacy signage configured for country "${countryCode}". Contact support.`,
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, code: 'NO_USER', message: 'Acceptance requires a user identity.' });
    }

    // Best-effort context for the audit trail. Trusts the standard
    // proxy header chain since this API sits behind Railway's edge.
    const ipHeader = req.get('x-forwarded-for') || req.ip || '';
    const ip = String(ipHeader).split(',')[0].trim().slice(0, 45) || null;
    const ua = (req.get('user-agent') || '').slice(0, 1000) || null;

    await pool.query(
      `INSERT INTO business_compliance_acceptances
         (business_id, user_id, country_code, signage_version, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.business.id, userId, countryCode, signageEntry.version, ip, ua]
    );

    return res.status(200).json({
      success: true,
      accepted_version: signageEntry.version,
      country_code: countryCode,
    });
  } catch (err) {
    console.error('[compliance/accept-signage]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to record acceptance.' });
  }
});

module.exports = router;
