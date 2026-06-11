// ============================================================
//  config.js — single source of truth for every env-driven value
//  the user SPA consumes.
//
//  Every value reads from import.meta.env and falls back to a
//  production default so a staging Netlify deploy is a pure env-var
//  operation. VITE_API_URL is the most important one — it changes
//  REST + Socket.IO targets together.
// ============================================================

const env = import.meta.env || {};

function trim(s) {
  return typeof s === 'string' ? s.replace(/\/+$/, '') : s;
}

// Backend API base. Empty default lets the Vite dev proxy take over
// in local development; production sets it explicitly.
export const API_URL = trim(env.VITE_API_URL || '');

// Public origin of this SPA. Used to build share-URLs like
// https://tapprove.io/o/<offer-id> that get pasted into native share
// sheets and email clients — needs to be a publicly resolvable URL,
// not just a relative path.
export const PUBLIC_APP_URL = trim(env.VITE_PUBLIC_APP_URL || 'https://tapprove.io');

// Business portal — surfaced on the "For businesses" explainer CTA
// and in any other "Get started" link aimed at merchants.
export const BUSINESS_PORTAL_URL = trim(env.VITE_BUSINESS_PORTAL_URL || 'https://business.tapprove.io');

// Outbound contact addresses for sales / demos / support links.
export const SALES_EMAIL   = env.VITE_SALES_EMAIL   || 'hello@tapprove.io';
export const SUPPORT_EMAIL = env.VITE_SUPPORT_EMAIL || 'support@tapprove.io';

export const PLATFORM_NAME = env.VITE_PLATFORM_NAME || 'Dander';

export default {
  API_URL,
  PUBLIC_APP_URL,
  BUSINESS_PORTAL_URL,
  SALES_EMAIL,
  SUPPORT_EMAIL,
  PLATFORM_NAME,
};
