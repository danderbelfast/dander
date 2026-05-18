'use strict';

/**
 * apiAuth.js — API key authentication, scope checking, and rate limiting.
 *
 * authenticateApiKey   Validates the API key from X-API-Key header or
 *                      Authorization: Bearer prefix. Attaches req.apiKey
 *                      with { id, businessId, scopes, label }.
 *
 * requireScope(scope)  Returns middleware that checks req.apiKey.scopes
 *                      includes the required scope.
 *
 * apiRateLimiter       100 requests/minute per API key, in-memory store.
 *                      Sets X-RateLimit-* headers and returns 429 when exceeded.
 */

const crypto = require('crypto');
const pool   = require('../db/pool');

// ---------------------------------------------------------------------------
// Response helpers (consistent format across all API routes)
// ---------------------------------------------------------------------------

function apiError(res, status, error, message) {
  return res.status(status).json({ error, message, status });
}

function apiSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    data,
    meta: {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  });
}

// ---------------------------------------------------------------------------
// Hash helper — keys are stored as SHA-256 hashes, never plaintext
// ---------------------------------------------------------------------------

function hashKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ---------------------------------------------------------------------------
// authenticateApiKey
// ---------------------------------------------------------------------------

async function authenticateApiKey(req, res, next) {
  const raw = req.headers['x-api-key']
    || (req.headers.authorization?.startsWith('Bearer dsk_')
        ? req.headers.authorization.slice(7).trim()
        : null);

  if (!raw) {
    return apiError(res, 401, 'missing_api_key',
      'An API key is required. Pass it via the X-API-Key header.');
  }

  const hash = hashKey(raw);

  try {
    const { rows } = await pool.query(
      `SELECT id, business_id, scopes, label, is_active
       FROM api_keys WHERE key_hash = $1`,
      [hash]
    );

    if (rows.length === 0) {
      return apiError(res, 401, 'invalid_api_key',
        'The provided API key is not valid.');
    }

    const key = rows[0];

    if (!key.is_active) {
      return apiError(res, 401, 'api_key_revoked',
        'This API key has been revoked.');
    }

    req.apiKey = {
      id:         key.id,
      businessId: key.business_id,
      scopes:     key.scopes || [],
      label:      key.label,
    };

    pool.query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [key.id]
    ).catch(() => {});

    next();
  } catch (err) {
    console.error('[apiAuth] DB error:', err.message);
    return apiError(res, 500, 'server_error', 'Internal server error.');
  }
}

// ---------------------------------------------------------------------------
// requireScope(scope)
// ---------------------------------------------------------------------------

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.apiKey) {
      return apiError(res, 401, 'missing_api_key',
        'Authentication required before scope check.');
    }

    if (!req.apiKey.scopes.includes(scope)) {
      return apiError(res, 403, 'insufficient_scope',
        `This API key does not have permission for this action. Required: ${scope}`);
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Rate limiter — 100 req/min per API key, in-memory
// ---------------------------------------------------------------------------

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;
const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS * 2) buckets.delete(key);
  }
}, WINDOW_MS * 5);

function apiRateLimiter(req, res, next) {
  if (!req.apiKey) return next();

  const bucketKey = `apikey:${req.apiKey.id}`;
  const now = Date.now();

  let bucket = buckets.get(bucketKey);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    bucket = { windowStart: now, count: 0 };
    buckets.set(bucketKey, bucket);
  }

  bucket.count++;

  const remaining = Math.max(0, MAX_REQUESTS - bucket.count);
  const resetAt   = Math.ceil((bucket.windowStart + WINDOW_MS) / 1000);

  res.set({
    'X-RateLimit-Limit':     String(MAX_REQUESTS),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset':     String(resetAt),
  });

  if (bucket.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return apiError(res, 429, 'rate_limited',
      `Rate limit exceeded. Try again in ${retryAfter} seconds.`);
  }

  next();
}

// ---------------------------------------------------------------------------
// HMAC signature verification (Stamplify / external webhooks)
// ---------------------------------------------------------------------------

function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-dander-signature'];
  if (!signature) {
    return apiError(res, 401, 'missing_signature',
      'X-Dander-Signature header is required.');
  }

  if (!req.apiKey?.id) {
    return apiError(res, 401, 'missing_api_key',
      'API key authentication required before signature verification.');
  }

  const secret = req._webhookSecret;
  if (!secret) {
    return apiError(res, 500, 'no_shared_secret',
      'No shared secret configured for this API key.');
  }

  const rawBody = req._rawBody;
  if (!rawBody) {
    return apiError(res, 400, 'missing_body',
      'Request body is required for signature verification.');
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const valid = crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );

  if (!valid) {
    return apiError(res, 401, 'invalid_signature',
      'Webhook signature does not match. Verify your shared secret.');
  }

  next();
}

function captureRawBody(req, _res, next) {
  if (req.method === 'POST' || req.method === 'PUT') {
    let chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      req._rawBody = Buffer.concat(chunks).toString('utf8');
      try { req.body = JSON.parse(req._rawBody); } catch {}
      next();
    });
  } else {
    next();
  }
}

async function loadWebhookSecret(req, res, next) {
  if (!req.apiKey?.id) return next();
  try {
    const { rows } = await pool.query(
      'SELECT shared_secret FROM api_keys WHERE id = $1',
      [req.apiKey.id]
    );
    req._webhookSecret = rows[0]?.shared_secret || null;
  } catch {}
  next();
}

// ---------------------------------------------------------------------------
// Webhook delivery logger
// ---------------------------------------------------------------------------

async function logWebhookDelivery({ webhookId, eventType, payload, responseStatus, responseBody, attemptNumber }) {
  try {
    await pool.query(
      `INSERT INTO webhook_deliveries
         (webhook_id, event_type, payload_json, response_status, response_body, attempt_number)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        webhookId || null,
        eventType,
        JSON.stringify(payload),
        responseStatus || null,
        responseBody || null,
        attemptNumber || 1,
      ]
    );
  } catch (err) {
    console.error('[webhook] Failed to log delivery:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  authenticateApiKey,
  requireScope,
  apiRateLimiter,
  apiError,
  apiSuccess,
  hashKey,
  verifyWebhookSignature,
  captureRawBody,
  loadWebhookSecret,
  logWebhookDelivery,
};
