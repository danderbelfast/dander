'use strict';

/**
 * auth.js — Express authentication & authorisation middleware
 *
 * requireAuth       Verifies the JWT and attaches the decoded user to req.user.
 * requireBusiness   Extends requireAuth; confirms the caller owns an active business
 *                   and attaches it to req.business.
 * requireAdmin      Extends requireAuth; confirms the JWT carries role = 'admin'.
 */

const jwt  = require('jsonwebtoken');
const pool = require('../db/pool');

const JWT_SECRET = process.env.JWT_SECRET;

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/**
 * Extracts the Bearer token from the Authorization header.
 * Returns null if the header is absent or malformed.
 */
function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/**
 * Consistent JSON error response.
 */
function deny(res, status, code, message) {
  return res.status(status).json({ success: false, code, message });
}

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

/**
 * Verifies the JWT in the Authorization header.
 * On success, attaches the decoded payload to req.user:
 *   { id, email, role }
 */
async function requireAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return deny(res, 401, 'MISSING_TOKEN', 'Authentication token is required.');
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return deny(res, 401, 'TOKEN_EXPIRED', 'Your session has expired. Please log in again.');
    }
    return deny(res, 401, 'INVALID_TOKEN', 'Invalid authentication token.');
  }

  // Guard against temp tokens (purpose: 'totp_verify') being used as full auth
  if (payload.purpose && payload.purpose !== undefined) {
    return deny(res, 401, 'INVALID_TOKEN', 'This token cannot be used for authentication.');
  }

  // Confirm the account is still active (DB round-trip on every request — swap
  // for a Redis cache if latency becomes a concern at scale)
  const { rows } = await pool.query(
    'SELECT id, email, is_active, role FROM users WHERE id = $1',
    [payload.sub]
  ).catch(() => ({ rows: [] }));

  if (rows.length === 0 || !rows[0].is_active) {
    return deny(res, 401, 'ACCOUNT_INACTIVE', 'This account is inactive or does not exist.');
  }

  req.user = {
    id:    rows[0].id,
    email: rows[0].email,
    role:  rows[0].role ?? payload.role ?? 'user',
  };

  return next();
}

// ---------------------------------------------------------------------------
// requireBusiness
// ---------------------------------------------------------------------------

/**
 * Extends requireAuth.
 * Confirms the authenticated user owns at least one active business.
 * Attaches the first active owned business to req.business.
 *
 * If businessId is provided as a route param, query param, or request body field,
 * that specific business is validated instead (ownership is still enforced).
 */
async function requireBusiness(req, res, next) {
  // Run the JWT check first
  await new Promise((resolve, reject) => {
    requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
  }).catch(() => {}); // requireAuth already sent the response on failure

  // If requireAuth sent a response (user not attached), stop here
  if (!req.user) return;

  const requestedId =
    req.params.businessId ||
    req.query.businessId  ||
    req.body?.businessId  ||
    null;

  let query, params;

  if (requestedId) {
    query  = `SELECT id, name, status, is_verified
              FROM businesses
              WHERE id = $1 AND owner_id = $2`;
    params = [requestedId, req.user.id];
  } else {
    query  = `SELECT id, name, status, is_verified
              FROM businesses
              WHERE owner_id = $1
              ORDER BY created_at
              LIMIT 1`;
    params = [req.user.id];
  }

  const { rows } = await pool.query(query, params).catch(() => ({ rows: [] }));

  if (rows.length === 0) {
    return deny(
      res, 403, 'NO_BUSINESS',
      'You do not own a business associated with this account.'
    );
  }

  const business = rows[0];

  if (business.status === 'suspended') {
    return deny(
      res, 403, 'BUSINESS_SUSPENDED',
      'This business account has been suspended. Contact support.'
    );
  }

  if (business.status === 'pending') {
    return deny(
      res, 403, 'BUSINESS_PENDING',
      'This business is awaiting approval by the platform team.'
    );
  }

  req.business = {
    id:         business.id,
    name:       business.name,
    status:     business.status,
    isVerified: business.is_verified,
  };

  return next();
}

// ---------------------------------------------------------------------------
// requireAdmin
// ---------------------------------------------------------------------------

/**
 * Extends requireAuth.
 * Only passes when the JWT carries role = 'admin'.
 *
 * Admin role is set at login time based on the `role` column in the users table.
 * To bootstrap the first admin, set role = 'admin' directly in the DB, or
 * implement an admin-invite flow protected by ADMIN_SECRET_KEY from .env.
 */
async function requireAdmin(req, res, next) {
  await new Promise((resolve, reject) => {
    requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
  }).catch(() => {});

  if (!req.user) return;

  if (req.user.role !== 'admin') {
    return deny(
      res, 403, 'FORBIDDEN',
      'Administrator access is required to perform this action.'
    );
  }

  return next();
}

// ---------------------------------------------------------------------------
// optionalAuth
// ---------------------------------------------------------------------------

/**
 * Like requireAuth but never blocks the request.
 * If a valid token is present, attaches req.user; otherwise req.user stays undefined.
 */
async function optionalAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.purpose) return next();
    const { rows } = await pool.query(
      'SELECT id, email, is_active, role FROM users WHERE id = $1',
      [payload.sub]
    ).catch(() => ({ rows: [] }));
    if (rows.length > 0 && rows[0].is_active) {
      req.user = { id: rows[0].id, email: rows[0].email, role: rows[0].role ?? 'user' };
    }
  } catch {
    // ignore invalid / expired token
  }
  return next();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { requireAuth, requireBusiness, requireAdmin, optionalAuth };
