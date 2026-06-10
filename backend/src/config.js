'use strict';

// ============================================================
//  config.js — single source of truth for every URL / origin /
//  brand string the backend emits.
//
//  Every value falls back to its current production default, so
//  flipping prod → staging is exclusively an env-var operation
//  (set USER_APP_URL=https://staging.dander.io etc on Railway and
//  restart — zero code edits required).
//
//  Imported by routes/public.js, routes/v1.js, services/billingService,
//  services/notificationService, services/offerLabels.
// ============================================================

require('dotenv').config();

const PORT      = parseInt(process.env.PORT || '4000', 10);
const NODE_ENV  = process.env.NODE_ENV || 'development';

// External URLs the API hands out in payloads, OG images, and outbound
// notifications. Pick names carefully — these end up in SMS, push and
// email so the wrong one in staging would still be visible to users.
const USER_APP_URL     = trimTrailingSlash(process.env.USER_APP_URL     || 'https://dander.io');
const BUSINESS_APP_URL = trimTrailingSlash(process.env.BUSINESS_APP_URL || 'https://biz.dander.io');
const ADMIN_APP_URL    = trimTrailingSlash(process.env.ADMIN_APP_URL    || 'https://admin.dander.io');
const API_PUBLIC_URL   = trimTrailingSlash(process.env.API_PUBLIC_URL   || 'https://api.dander.io');

// Stripe billing portal return — special-case because Stripe sometimes
// appends its own query params; we never trim it post-hoc.
const STRIPE_PORTAL_RETURN_URL =
  process.env.STRIPE_PORTAL_RETURN_URL || `${USER_APP_URL}/dashboard`;

// Brand strings used in outbound copy. Kept here so a white-label
// staging environment can rebrand without code edits.
const PLATFORM_NAME = process.env.PLATFORM_NAME || 'Dander';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@dander.io';
const SALES_EMAIL   = process.env.SALES_EMAIL   || 'hello@dander.io';

// Socket.IO / Express CORS allow-list. FRONTEND_URL has been a
// comma-split list since the multi-frontend split — we honour that
// shape and only fall back to localhost dev origins when unset.
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((o) => o.trim()).filter(Boolean)
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];

// Helpers callers shouldn't need to repeat.
function trimTrailingSlash(s) {
  return typeof s === 'string' ? s.replace(/\/+$/, '') : s;
}

module.exports = {
  PORT,
  NODE_ENV,
  USER_APP_URL,
  BUSINESS_APP_URL,
  ADMIN_APP_URL,
  API_PUBLIC_URL,
  STRIPE_PORTAL_RETURN_URL,
  PLATFORM_NAME,
  SUPPORT_EMAIL,
  SALES_EMAIL,
  allowedOrigins,
};
