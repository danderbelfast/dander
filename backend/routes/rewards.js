// ============================================================
//  Dander · GET /api/business/:id/rewards
//  Returns { name, sector, fill, level, add, leveledUp, firstVisit }
//
//  Two modes:
//   1. Display-only (no customer):
//        GET /api/business/:id/rewards
//   2. Live check-in:
//        GET /api/business/:id/rewards?customer=<user_id>
//
//  Mount with:  app.use('/api/business', require('./routes/rewards'));
//
//  Schema adaptation (vs the rewards-pack reference):
//    - `businesses` keyed by INTEGER `id` (not TEXT `business_id`).
//    - Config lives in `business_loyalty_settings` (not `business_loyalty`);
//      it has `points_per_visit` but NO `points_per_level`, so the level
//      dial falls back to DEFAULT_PPL on every business.
//    - Running totals live in `business_loyalty_points` (not
//      `customer_points`) with `points` / `last_visit_date` columns and
//      an INTEGER `user_id` (so ?customer= must be an integer user_id;
//      the route rejects anything else cleanly).
// ============================================================

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { pointsToJar } = require('../lib/pointsToJar');

const DEFAULT_PPL = 100;   // points per level — no DB column for this, fallback always
const DEFAULT_PPV = 20;    // points per visit — fallback when no settings row

router.get('/:id/rewards', async (req, res) => {
  const businessId = parseInt(req.params.id, 10);
  if (Number.isNaN(businessId)) {
    return res.status(400).json({ error: 'business_id_must_be_integer' });
  }
  const customerParam = req.query.customer || null;

  const client = await pool.connect();
  try {
    // ---- 1. Business name + sector (always needed) ----
    const bizQ = await client.query(
      `SELECT name, COALESCE(sector, 'retail') AS sector
         FROM businesses
        WHERE id = $1`,
      [businessId]
    );
    if (bizQ.rowCount === 0) {
      return res.status(404).json({ error: 'business_not_found' });
    }
    const { name, sector } = bizQ.rows[0];

    // ---- 2. Loyalty dials for this business (with fallback) ----
    // business_loyalty_settings has points_per_visit but not points_per_level,
    // so the level dial always comes from DEFAULT_PPL.
    const cfgQ = await client.query(
      `SELECT points_per_visit
         FROM business_loyalty_settings
        WHERE business_id = $1`,
      [businessId]
    );
    const ppl = DEFAULT_PPL;
    const ppv = cfgQ.rows[0]?.points_per_visit || DEFAULT_PPV;

    // ---- 3a. Display-only: no customer => zeroed jar ----
    if (!customerParam) {
      return res.json({
        name, sector,
        fill: 0, level: 1, add: 0,
        leveledUp: false, firstVisit: false, displayOnly: true
      });
    }

    // ---- 3b. Live check-in: customer must be a valid user_id integer ----
    const userId = parseInt(customerParam, 10);
    if (Number.isNaN(userId) || String(userId) !== String(customerParam).trim()) {
      return res.status(400).json({ error: 'customer_must_be_integer_user_id' });
    }

    await client.query('BEGIN');

    // Same-day guard runs SERVER-SIDE via CURRENT_DATE so the comparison
    // happens in the DB's session timezone (Railway = Etc/UTC). Doing it
    // in JS with `.toISOString().slice(0,10)` would skew on any non-UTC
    // client because node-postgres deserialises DATE at midnight LOCAL,
    // not midnight UTC — that's the bug the first round of testing hit.
    const ptsQ = await client.query(
      `SELECT points AS total_points,
              (last_visit_date = CURRENT_DATE) AS already_today
         FROM business_loyalty_points
        WHERE user_id = $1 AND business_id = $2
        FOR UPDATE`,
      [userId, businessId]
    );

    const existing = ptsQ.rows[0];
    const previousTotal = existing ? existing.total_points : 0;
    const alreadyToday = !!existing?.already_today;

    let added = 0;
    let newTotal = previousTotal;

    if (!alreadyToday) {
      added = ppv;
      newTotal = previousTotal + ppv;
      await client.query(
        `INSERT INTO business_loyalty_points
              (user_id, business_id, points, total_visits, last_visit_date, last_visit_at)
              VALUES ($1, $2, $3, 1, CURRENT_DATE, now())
         ON CONFLICT (business_id, user_id)
         DO UPDATE SET points          = $3,
                       total_visits    = business_loyalty_points.total_visits + 1,
                       last_visit_date = CURRENT_DATE,
                       last_visit_at   = now()`,
        [userId, businessId, newTotal]
      );
    }

    await client.query('COMMIT');

    // ---- 4. Convert totals -> jar state ----
    const jar = pointsToJar(previousTotal, newTotal, ppl);

    return res.json({
      name,
      sector,
      fill: jar.previousFill,                 // page animates FROM here...
      add: jar.newFill - jar.previousFill,    // ...by this much (0 if repeat today)
      level: jar.level,
      leveledUp: jar.leveledUp,
      firstVisit: jar.firstVisit,
      repeatToday: alreadyToday,
      added
    });

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[rewards route]', err);
    return res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

module.exports = router;
