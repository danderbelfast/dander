'use strict';

const { Router } = require('express');
const { param, query, body, validationResult } = require('express-validator');

const pool = require('../db/pool');
const { requireAdmin }        = require('../middleware/auth');
const notificationService     = require('../services/notificationService');
const emailService            = require('../services/emailService');

const router = Router();

// Auto-migrate: add removed_by_admin column if it doesn't exist
pool.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS removed_by_admin BOOLEAN NOT NULL DEFAULT FALSE`)
  .catch(err => console.error('[admin] Failed to add removed_by_admin column:', err.message));

// All admin routes require admin JWT
router.use(requireAdmin);

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function fail(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    fail(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /api/admin/businesses
// ?status=pending|active|suspended&city=&page=&limit=
// ---------------------------------------------------------------------------

router.get(
  '/businesses',
  [
    query('status').optional().isIn(['pending', 'active', 'suspended']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const page   = parseInt(req.query.page  || '1',  10);
      const limit  = parseInt(req.query.limit || '20', 10);
      const offset = (page - 1) * limit;

      const conditions = [];
      const params     = [];
      let   p          = 1;

      if (req.query.status) { conditions.push(`b.status = $${p++}`); params.push(req.query.status); }
      if (req.query.city)   { conditions.push(`b.city ILIKE $${p++}`); params.push(`%${req.query.city}%`); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const [rows, countResult] = await Promise.all([
        pool.query(
          `SELECT
             b.id, b.name, b.category, b.city, b.status, b.is_verified,
             b.created_at, b.logo_url,
             u.email AS owner_email,
             u.first_name AS owner_first_name,
             u.last_name  AS owner_last_name,
             (SELECT COUNT(*) FROM offers o WHERE o.business_id = b.id AND o.is_active = true)
               AS active_offers,
             (SELECT COUNT(*) FROM coupons c JOIN offers o ON o.id = c.offer_id
              WHERE o.business_id = b.id AND c.status = 'redeemed')
               AS total_redeemed
           FROM  businesses b
           JOIN  users u ON u.id = b.owner_id
           ${where}
           ORDER BY b.created_at DESC
           LIMIT  $${p} OFFSET $${p + 1}`,
          [...params, limit, offset]
        ),
        pool.query(
          `SELECT COUNT(*) FROM businesses b ${where}`,
          params
        ),
      ]);

      return ok(res, {
        total:      parseInt(countResult.rows[0].count, 10),
        page,
        limit,
        businesses: rows.rows,
      });
    } catch (err) {
      console.error('[admin/businesses]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch businesses.');
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/admin/businesses/:id/approve
// ---------------------------------------------------------------------------

router.put(
  '/businesses/:id/approve',
  [param('id').isInt({ min: 1 })],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const { rows } = await pool.query(
        `UPDATE businesses
         SET    status = 'active', is_verified = true, updated_at = NOW()
         WHERE  id = $1
         RETURNING id, name, status, is_verified, owner_id`,
        [req.params.id]
      );
      if (rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Business not found.');
      const biz = rows[0];
      // Notify owner via SMS and email (non-fatal)
      pool.query('SELECT email, phone, first_name, last_name FROM users WHERE id = $1', [biz.owner_id])
        .then(({ rows: u }) => {
          if (!u[0]) return;
          const owner = u[0];
          if (owner.phone) notificationService.sendBusinessApprovedSms(owner.phone, biz.name).catch(() => {});
          emailService.sendBusinessApprovedEmail({
            ownerEmail:   owner.email,
            ownerName:    owner.first_name || owner.email,
            businessName: biz.name,
          }).catch(() => {});
        }).catch(() => {});
      return ok(res, { business: biz, message: 'Business approved.' });
    } catch (err) {
      console.error('[admin/businesses/approve]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to approve business.');
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/admin/businesses/:id/suspend
// ---------------------------------------------------------------------------

router.put(
  '/businesses/:id/suspend',
  [
    param('id').isInt({ min: 1 }),
    body('reason').optional().trim(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const { rows } = await pool.query(
        `UPDATE businesses
         SET    status = 'suspended', updated_at = NOW()
         WHERE  id = $1
         RETURNING id, name, status, owner_id`,
        [req.params.id]
      );
      if (rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Business not found.');
      // Notify owner (non-fatal)
      const biz = rows[0];
      pool.query('SELECT phone FROM users WHERE id = $1', [biz.owner_id])
        .then(({ rows: u }) => {
          if (u[0]?.phone) notificationService.sendBusinessSuspendedSms(u[0].phone, biz.name).catch(() => {});
        }).catch(() => {});
      return ok(res, { business: biz, message: 'Business suspended.' });
    } catch (err) {
      console.error('[admin/businesses/suspend]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to suspend business.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/admin/offers
// ?status=active|scheduled|expired|inactive&category=&business_id=&from=&to=&page=&limit=
// ---------------------------------------------------------------------------

router.get(
  '/offers',
  [
    query('status').optional().isIn(['active', 'scheduled', 'expired', 'inactive', 'removed']),
    query('category').optional().trim(),
    query('business_id').optional().isInt({ min: 1 }),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const page   = parseInt(req.query.page  || '1',  10);
      const limit  = parseInt(req.query.limit || '50', 10);
      const offset = (page - 1) * limit;

      const conditions = [];
      const params     = [];
      let   p          = 1;

      if (req.query.business_id) { conditions.push(`o.business_id = $${p++}`); params.push(req.query.business_id); }
      if (req.query.category)    { conditions.push(`LOWER(o.category) = LOWER($${p++})`); params.push(req.query.category); }
      if (req.query.from)        { conditions.push(`o.created_at >= $${p++}`); params.push(req.query.from); }
      if (req.query.to)          { conditions.push(`o.created_at <= $${p++}`); params.push(req.query.to); }

      // Map status → SQL condition
      const { status } = req.query;
      if (status === 'active') {
        conditions.push(`o.is_active = true AND o.removed_by_admin = false AND (o.expires_at IS NULL OR o.expires_at > NOW()) AND (o.starts_at IS NULL OR o.starts_at <= NOW())`);
      } else if (status === 'scheduled') {
        conditions.push(`o.is_active = true AND o.removed_by_admin = false AND o.starts_at IS NOT NULL AND o.starts_at > NOW()`);
      } else if (status === 'expired') {
        conditions.push(`o.expires_at IS NOT NULL AND o.expires_at < NOW()`);
      } else if (status === 'inactive') {
        conditions.push(`o.is_active = false AND o.removed_by_admin = false`);
      } else if (status === 'removed') {
        conditions.push(`o.removed_by_admin = true`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const [rows, countResult] = await Promise.all([
        pool.query(
          `SELECT
             o.id, o.title, o.offer_type, o.category, o.offer_price,
             o.max_redemptions, o.is_active,
             o.starts_at, o.expires_at, o.created_at,
             b.name AS business_name, b.city AS business_city,
             COUNT(c.id) FILTER (WHERE c.status = 'active')   AS claimed_count,
             COUNT(c.id) FILTER (WHERE c.status = 'redeemed') AS redeemed_count,
             CASE
               WHEN o.removed_by_admin THEN 'removed'
               WHEN NOT o.is_active THEN 'inactive'
               WHEN o.expires_at IS NOT NULL AND o.expires_at < NOW() THEN 'expired'
               WHEN o.starts_at IS NOT NULL AND o.starts_at > NOW() THEN 'scheduled'
               ELSE 'active'
             END AS status
           FROM  offers     o
           JOIN  businesses b ON b.id = o.business_id
           LEFT JOIN coupons c ON c.offer_id = o.id
           ${where}
           GROUP BY o.id, b.name, b.city
           ORDER BY o.created_at DESC
           LIMIT  $${p} OFFSET $${p + 1}`,
          [...params, limit, offset]
        ),
        pool.query(`SELECT COUNT(*) FROM offers o ${where}`, params),
      ]);

      return ok(res, {
        total:  parseInt(countResult.rows[0].count, 10),
        page,
        limit,
        offers: rows.rows,
      });
    } catch (err) {
      console.error('[admin/offers]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch offers.');
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/admin/offers/:id/remove
// ---------------------------------------------------------------------------

router.put(
  '/offers/:id/remove',
  [param('id').isInt({ min: 1 })],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const { rows } = await pool.query(
        `UPDATE offers
         SET    is_active = false, removed_by_admin = true, updated_at = NOW()
         WHERE  id = $1
         RETURNING id, title, is_active`,
        [req.params.id]
      );
      if (rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Offer not found.');
      return ok(res, { offer: rows[0], message: 'Offer removed from platform.' });
    } catch (err) {
      console.error('[admin/offers/remove]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to remove offer.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/admin/users
// ?search=&is_active=&page=&limit=
// ---------------------------------------------------------------------------

router.get(
  '/users',
  [
    query('is_active').optional().isBoolean(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const page   = parseInt(req.query.page  || '1',  10);
      const limit  = parseInt(req.query.limit || '20', 10);
      const offset = (page - 1) * limit;

      const conditions = [];
      const params     = [];
      let   p          = 1;

      if (req.query.search) {
        conditions.push(`(u.email ILIKE $${p} OR u.first_name ILIKE $${p} OR u.last_name ILIKE $${p})`);
        params.push(`%${req.query.search}%`);
        p++;
      }
      if (req.query.is_active != null) {
        conditions.push(`u.is_active = $${p++}`);
        params.push(req.query.is_active === 'true');
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const [rows, countResult] = await Promise.all([
        pool.query(
          `SELECT
             u.id, u.email, u.first_name, u.last_name, u.phone,
             u.role, u.is_verified, u.is_active, u.totp_enabled,
             u.created_at,
             (SELECT COUNT(*) FROM coupons c WHERE c.user_id = u.id)   AS total_coupons,
             (SELECT COUNT(*) FROM coupons c WHERE c.user_id = u.id AND c.status = 'redeemed')
               AS total_redeemed
           FROM  users u
           ${where}
           ORDER BY u.created_at DESC
           LIMIT  $${p} OFFSET $${p + 1}`,
          [...params, limit, offset]
        ),
        pool.query(`SELECT COUNT(*) FROM users u ${where}`, params),
      ]);

      return ok(res, {
        total: parseInt(countResult.rows[0].count, 10),
        page,
        limit,
        users: rows.rows,
      });
    } catch (err) {
      console.error('[admin/users]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch users.');
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/admin/users/:id/suspend
// ---------------------------------------------------------------------------

router.put(
  '/users/:id/suspend',
  [param('id').isInt({ min: 1 })],
  async (req, res) => {
    if (!validate(req, res)) return;

    // Prevent admins from suspending themselves
    if (parseInt(req.params.id, 10) === req.user.id) {
      return fail(res, 400, 'SELF_SUSPEND', 'You cannot suspend your own account.');
    }

    try {
      const { rows } = await pool.query(
        `UPDATE users
         SET    is_active = false, updated_at = NOW()
         WHERE  id = $1
         RETURNING id, email, is_active`,
        [req.params.id]
      );
      if (rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'User not found.');
      return ok(res, { user: rows[0], message: 'User suspended.' });
    } catch (err) {
      console.error('[admin/users/suspend]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to suspend user.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/admin/stats
// ---------------------------------------------------------------------------

router.get('/stats', async (req, res) => {
  try {
    const [
      totalsResult,
      redemptionPeriodsResult,
      claimsPeriodsResult,
      newBizPeriodsResult,
      topBusinessesResult,
      topOffersResult,
      signupsResult,
      redemptionsPerDayResult,
    ] = await Promise.all([

      // Platform-wide totals
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM users)                         AS total_users,
          (SELECT COUNT(*) FROM users    WHERE is_active = true)  AS active_users,
          (SELECT COUNT(*) FROM businesses)                    AS total_businesses,
          (SELECT COUNT(*) FROM businesses WHERE status = 'active')    AS active_businesses,
          (SELECT COUNT(*) FROM businesses WHERE status = 'pending')   AS pending_businesses,
          (SELECT COUNT(*) FROM offers)                        AS total_offers,
          (SELECT COUNT(*) FROM offers   WHERE is_active = true)  AS active_offers,
          (SELECT COUNT(*) FROM coupons)                       AS total_coupons,
          (SELECT COUNT(*) FROM coupons  WHERE status = 'redeemed') AS total_redemptions
      `),

      // Redemptions today / this week / this month
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE redeemed_at >= NOW() - INTERVAL '1 day')   AS today,
          COUNT(*) FILTER (WHERE redeemed_at >= NOW() - INTERVAL '7 days')  AS this_week,
          COUNT(*) FILTER (WHERE redeemed_at >= NOW() - INTERVAL '30 days') AS this_month
        FROM coupons
        WHERE status = 'redeemed'
      `),

      // Coupons claimed (issued) today / this week / this month
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')   AS today,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS this_week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS this_month
        FROM coupons
      `),

      // New businesses registered today / this week / this month
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')   AS today,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS this_week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS this_month
        FROM businesses
      `),

      // Top 5 businesses by actual counter redemptions
      pool.query(`
        SELECT
          b.id, b.name, b.city, b.logo_url,
          COUNT(c.id) FILTER (WHERE c.status = 'redeemed') AS total_redeemed
        FROM  businesses b
        LEFT JOIN offers  o ON o.business_id = b.id
        LEFT JOIN coupons c ON c.offer_id    = o.id
        WHERE b.status = 'active'
        GROUP BY b.id
        ORDER BY total_redeemed DESC
        LIMIT 5
      `),

      // Top 5 offers by actual counter redemptions
      pool.query(`
        SELECT
          o.id, o.title, o.offer_type,
          COUNT(c.id) FILTER (WHERE c.status = 'redeemed') AS total_redeemed,
          b.name AS business_name
        FROM  offers     o
        JOIN  businesses b ON b.id = o.business_id
        LEFT JOIN coupons c ON c.offer_id = o.id
        GROUP BY o.id, b.name
        ORDER BY total_redeemed DESC
        LIMIT 5
      `),

      // New user signups per day — last 30 days
      pool.query(`
        SELECT
          TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
          COUNT(*)::int                      AS signups
        FROM  users
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY date
        ORDER BY date ASC
      `),

      // Counter redemptions per day — last 30 days
      pool.query(`
        SELECT
          TO_CHAR(redeemed_at, 'YYYY-MM-DD') AS date,
          COUNT(*)::int                        AS redemptions
        FROM  coupons
        WHERE status = 'redeemed' AND redeemed_at >= NOW() - INTERVAL '30 days'
        GROUP BY date
        ORDER BY date ASC
      `),
    ]);

    const totals    = totalsResult.rows[0];
    const periods   = redemptionPeriodsResult.rows[0];
    const claims    = claimsPeriodsResult.rows[0];
    const newBiz    = newBizPeriodsResult.rows[0];

    return ok(res, {
      stats: {
        users: {
          total:  parseInt(totals.total_users,    10),
          active: parseInt(totals.active_users,   10),
        },
        businesses: {
          total:   parseInt(totals.total_businesses,   10),
          active:  parseInt(totals.active_businesses,  10),
          pending: parseInt(totals.pending_businesses, 10),
        },
        offers: {
          total:  parseInt(totals.total_offers,  10),
          active: parseInt(totals.active_offers, 10),
        },
        coupons: {
          total:       parseInt(totals.total_coupons,      10),
          redeemed:    parseInt(totals.total_redemptions,  10),
        },
        redemptions: {
          today:      parseInt(periods.today,      10),
          this_week:  parseInt(periods.this_week,  10),
          this_month: parseInt(periods.this_month, 10),
        },
        claims: {
          today:      parseInt(claims.today,      10),
          this_week:  parseInt(claims.this_week,  10),
          this_month: parseInt(claims.this_month, 10),
        },
        new_businesses: {
          today:      parseInt(newBiz.today,      10),
          this_week:  parseInt(newBiz.this_week,  10),
          this_month: parseInt(newBiz.this_month, 10),
        },
        top_businesses:        topBusinessesResult.rows,
        top_offers:            topOffersResult.rows,
        signups_last_30d:      signupsResult.rows,
        redemptions_last_30d:  redemptionsPerDayResult.rows,
      },
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch platform stats.');
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/businesses/:id  (detail + offers + redemption history)
// ---------------------------------------------------------------------------

router.get(
  '/businesses/:id',
  [param('id').isInt({ min: 1 })],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const [bizRows, offersRows, redemRows] = await Promise.all([
        pool.query(
          `SELECT b.*, u.email AS owner_email, u.first_name AS owner_first_name, u.last_name AS owner_last_name
           FROM businesses b JOIN users u ON u.id = b.owner_id WHERE b.id = $1`,
          [req.params.id]
        ),
        pool.query(
          `SELECT o.id, o.title, o.category, o.is_active, o.max_redemptions, o.expires_at, o.created_at,
             COUNT(c.id) FILTER (WHERE c.status = 'active')   AS claimed_count,
             COUNT(c.id) FILTER (WHERE c.status = 'redeemed') AS redeemed_count
           FROM offers o
           LEFT JOIN coupons c ON c.offer_id = o.id
           WHERE o.business_id = $1
           GROUP BY o.id
           ORDER BY o.created_at DESC`,
          [req.params.id]
        ),
        pool.query(
          `SELECT c.id, c.code, c.redeemed_at, o.title AS offer_title
           FROM coupons c JOIN offers o ON o.id = c.offer_id
           WHERE o.business_id = $1 AND c.status = 'redeemed'
           ORDER BY c.redeemed_at DESC LIMIT 20`,
          [req.params.id]
        ),
      ]);
      if (bizRows.rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Business not found.');
      const b = bizRows.rows[0];
      return ok(res, {
        business: {
          id: b.id, name: b.name, category: b.category, status: b.status,
          address: b.address, city: b.city, phone: b.phone, website: b.website,
          description: b.description, logoUrl: b.logo_url, coverUrl: b.cover_url,
          latitude: b.latitude, longitude: b.longitude, createdAt: b.created_at,
          ownerEmail: b.owner_email,
          ownerFirstName: b.owner_first_name, ownerLastName: b.owner_last_name,
        },
        offers: offersRows.rows.map((o) => ({
          id: o.id, title: o.title, category: o.category,
          status: o.is_active ? 'active' : 'inactive',
          viewCount: 0,
          claimedCount:  parseInt(o.claimed_count,  10) || 0,
          redeemedCount: parseInt(o.redeemed_count, 10) || 0,
        })),
        recentRedemptions: redemRows.rows.map((r) => ({
          id: r.id, code: r.code, offerTitle: r.offer_title, redeemedAt: r.redeemed_at,
        })),
      });
    } catch (err) {
      console.error('[admin/businesses/:id]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch business details.');
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/admin/map  (active business locations for map pins)
// ---------------------------------------------------------------------------

router.get('/map', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        b.id, b.name, b.category, b.lat, b.lng,
        (SELECT COUNT(*) FROM offers o WHERE o.business_id = b.id AND o.is_active = true) AS active_offers,
        COALESCE(SUM(o.current_redemptions), 0) AS redemptions
      FROM businesses b
      LEFT JOIN offers o ON o.business_id = b.id
      WHERE b.status = 'active' AND b.lat IS NOT NULL AND b.lng IS NOT NULL
      GROUP BY b.id
    `);
    return ok(res, {
      businesses: rows.map((b) => ({
        id: b.id, name: b.name, category: b.category,
        latitude: parseFloat(b.lat), longitude: parseFloat(b.lng),
        activeOffers: parseInt(b.active_offers, 10),
        redemptions:  parseInt(b.redemptions, 10),
      })),
    });
  } catch (err) {
    console.error('[admin/map]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch map data.');
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/reports
// ---------------------------------------------------------------------------

router.get('/reports', async (req, res) => {
  try {
    const [catRows, typeRows, growthRows, dailyRows, dailyClaimedRows] = await Promise.all([
      pool.query(`
        SELECT o.category, COUNT(c.id)::int AS redemptions
        FROM   coupons c
        JOIN   offers o ON o.id = c.offer_id
        WHERE  c.status = 'redeemed' AND o.category IS NOT NULL
        GROUP  BY o.category ORDER BY redemptions DESC
      `),
      pool.query(`
        SELECT offer_type AS type, COUNT(*)::int AS count
        FROM   offers WHERE offer_type IS NOT NULL
        GROUP  BY offer_type ORDER BY count DESC
      `),
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YY') AS month,
          COUNT(*)                                             AS total,
          COUNT(*) FILTER (WHERE status = 'active')           AS active,
          COUNT(*) FILTER (WHERE status = 'pending')          AS pending
        FROM businesses
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at) ASC
        LIMIT 12
      `),
      pool.query(`
        SELECT
          TO_CHAR(redeemed_at, 'YYYY-MM-DD') AS day,
          COUNT(*)::int                       AS redemptions
        FROM   coupons
        WHERE  status = 'redeemed' AND redeemed_at >= NOW() - INTERVAL '30 days'
        GROUP  BY day ORDER BY day ASC
      `),
      pool.query(`
        SELECT
          TO_CHAR(created_at, 'YYYY-MM-DD') AS day,
          COUNT(*)::int                      AS claimed
        FROM   coupons
        WHERE  created_at >= NOW() - INTERVAL '30 days'
        GROUP  BY day ORDER BY day ASC
      `),
    ]);

    // Merge claimed and redeemed by day
    const claimedByDay = Object.fromEntries(dailyClaimedRows.rows.map((r) => [r.day.slice(5), r.claimed]));
    const dailyActivity = dailyRows.rows.map((r) => ({
      day: r.day.slice(5),
      redeemed: r.redemptions,
      claimed: claimedByDay[r.day.slice(5)] ?? 0,
    }));
    // Include days that have claims but no redemptions
    dailyClaimedRows.rows.forEach((r) => {
      const key = r.day.slice(5);
      if (!dailyActivity.find((d) => d.day === key)) {
        dailyActivity.push({ day: key, redeemed: 0, claimed: r.claimed });
      }
    });
    dailyActivity.sort((a, b) => a.day.localeCompare(b.day));

    return ok(res, {
      categoryBreakdown:  catRows.rows.map((r) => ({ category: r.category, redemptions: r.redemptions })),
      offerTypeBreakdown: typeRows.rows.map((r) => ({ type: r.type, count: r.count })),
      businessGrowth:     growthRows.rows.map((r) => ({
        month: r.month,
        total:   parseInt(r.total, 10),
        active:  parseInt(r.active, 10),
        pending: parseInt(r.pending, 10),
      })),
      dailyActivity,
    });
  } catch (err) {
    console.error('[admin/reports]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to build reports.');
  }
});

// ---------------------------------------------------------------------------
// Profit & ROI endpoints
// ---------------------------------------------------------------------------

const profitService = require('../services/profitService');

router.get('/stats/profit', async (req, res) => {
  try {
    const data = await profitService.getPlatformROI({ from: req.query.from, to: req.query.to });
    return ok(res, { profit: data });
  } catch (err) {
    console.error('[admin/stats/profit]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch platform profit stats.');
  }
});

router.get('/stats/profit/chart', async (req, res) => {
  try {
    const chart = await profitService.getDailyPlatformProfitChart({ from: req.query.from, to: req.query.to });
    return ok(res, { chart });
  } catch (err) {
    console.error('[admin/stats/profit/chart]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch profit chart.');
  }
});

router.get('/businesses/:id/profit', async (req, res) => {
  try {
    const offers = await profitService.getBusinessOfferProfit(
      parseInt(req.params.id, 10), { from: req.query.from, to: req.query.to }
    );
    return ok(res, { offers });
  } catch (err) {
    console.error('[admin/businesses/:id/profit]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch business profit.');
  }
});

router.get('/reports/profit', async (req, res) => {
  try {
    const { from, to } = req.query;
    const [summary, businesses, chart] = await Promise.all([
      profitService.getPlatformROI({ from, to }),
      profitService.getPlatformBusinessTable({ from, to }),
      profitService.getDailyPlatformProfitChart({ from, to }),
    ]);
    return ok(res, { summary, businesses, chart });
  } catch (err) {
    console.error('[admin/reports/profit]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to build profit report.');
  }
});

router.get('/export/profit', async (req, res) => {
  try {
    const csv = await profitService.generatePlatformProfitCSV({
      from: req.query.from, to: req.query.to,
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="dander-platform-profit.csv"');
    return res.send(csv);
  } catch (err) {
    console.error('[admin/export/profit]', err);
    return fail(res, 500, 'SERVER_ERROR', 'CSV export failed.');
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/businesses/:id/hours
// ---------------------------------------------------------------------------

router.get('/businesses/:id/hours', async (req, res) => {
  try {
    const hoursService = require('../services/hoursService');
    const [hours, special, status] = await Promise.all([
      hoursService.getBusinessHours(parseInt(req.params.id, 10)),
      hoursService.getSpecialHours(parseInt(req.params.id, 10)),
      hoursService.isBusinessOpen(parseInt(req.params.id, 10)),
    ]);
    return ok(res, { hours, special, status });
  } catch (err) {
    console.error('[admin/businesses/:id/hours]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch hours.');
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/export/:type   (CSV download: users | businesses | redemptions)
// ---------------------------------------------------------------------------

router.get('/export/:type', async (req, res) => {
  const { type } = req.params;

  const queries = {
    users: `
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active, u.created_at,
             (SELECT COUNT(*) FROM coupons c WHERE c.user_id = u.id AND c.status = 'redeemed') AS redemptions
      FROM users u ORDER BY u.created_at DESC
    `,
    businesses: `
      SELECT b.id, b.name, b.category, b.city, b.status, b.created_at,
             u.email AS owner_email,
             (SELECT COUNT(*) FROM offers o WHERE o.business_id = b.id AND o.is_active = true) AS active_offers
      FROM businesses b JOIN users u ON u.id = b.owner_id ORDER BY b.created_at DESC
    `,
    redemptions: `
      SELECT c.id, c.code, c.redeemed_at, u.email AS user_email,
             o.title AS offer_title, b.name AS business_name
      FROM   coupons c
      JOIN   users       u ON u.id = c.user_id
      JOIN   offers      o ON o.id = c.offer_id
      JOIN   businesses  b ON b.id = o.business_id
      WHERE  c.status = 'redeemed'
      ORDER  BY c.redeemed_at DESC LIMIT 5000
    `,
  };

  if (!queries[type]) return fail(res, 400, 'INVALID_TYPE', 'Invalid export type.');

  try {
    const { rows } = await pool.query(queries[type]);
    if (rows.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="dander-${type}.csv"`);
      return res.send('No data');
    }
    const headers = Object.keys(rows[0]).join(',');
    const csv = [
      headers,
      ...rows.map((r) =>
        Object.values(r)
          .map((v) => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`))
          .join(',')
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="dander-${type}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('[admin/export]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Export failed.');
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/settings
// PUT /api/admin/settings
// ---------------------------------------------------------------------------

router.get('/settings', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM platform_settings');
    const settings = {};
    rows.forEach((r) => {
      try { settings[r.key] = JSON.parse(r.value); }
      catch { settings[r.key] = r.value; }
    });
    return ok(res, {
      platformName:          settings.platform_name             || 'Dander',
      supportEmail:          settings.support_email             || '',
      maintenanceMode:       settings.maintenance_mode          || false,
      defaultRadius:         settings.default_radius            || 500,
      adminNotificationEmail: settings.admin_notification_email || '',
      welcomeEmailSubject:   settings.welcome_email_subject     || '',
      welcomeEmailBody:      settings.welcome_email_body        || '',
    });
  } catch (err) {
    console.error('[admin/settings GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to load settings.');
  }
});

router.put('/settings', async (req, res) => {
  const { platformName, supportEmail, maintenanceMode, defaultRadius,
          adminNotificationEmail, welcomeEmailSubject, welcomeEmailBody } = req.body;
  const toUpsert = [
    ['platform_name',             platformName             !== undefined ? JSON.stringify(platformName)                  : null],
    ['support_email',             supportEmail             !== undefined ? JSON.stringify(supportEmail)                  : null],
    ['maintenance_mode',          maintenanceMode          !== undefined ? JSON.stringify(!!maintenanceMode)             : null],
    ['default_radius',            defaultRadius            !== undefined ? JSON.stringify(Number(defaultRadius))         : null],
    ['admin_notification_email',  adminNotificationEmail   !== undefined ? JSON.stringify(adminNotificationEmail)        : null],
    ['welcome_email_subject',     welcomeEmailSubject      !== undefined ? JSON.stringify(welcomeEmailSubject)           : null],
    ['welcome_email_body',        welcomeEmailBody         !== undefined ? JSON.stringify(welcomeEmailBody)              : null],
  ].filter(([, v]) => v !== null);

  try {
    await Promise.all(toUpsert.map(([key, value]) =>
      pool.query(
        `INSERT INTO platform_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
      )
    ));
    return ok(res, { message: 'Settings saved.' });
  } catch (err) {
    console.error('[admin/settings PUT]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to save settings.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/admin   (create a new admin account)
// ---------------------------------------------------------------------------

router.post(
  '/users/admin',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('firstName').notEmpty().trim(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;
    const bcrypt = require('bcrypt');
    const { email, password, firstName, lastName } = req.body;
    try {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) return fail(res, 409, 'EMAIL_TAKEN', 'Email already registered.');
      const hash = await bcrypt.hash(password, 12);
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, is_verified, is_active)
         VALUES ($1, $2, $3, $4, 'admin', true, true) RETURNING id, email, role`,
        [email, hash, firstName, lastName || '']
      );
      return ok(res, { user: rows[0], message: 'Admin account created.' }, 201);
    } catch (err) {
      console.error('[admin/users/admin]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to create admin user.');
    }
  }
);

module.exports = router;
