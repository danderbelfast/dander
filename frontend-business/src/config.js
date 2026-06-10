// ============================================================
//  config.js — single source of truth for every env-driven value
//  the business dashboard consumes.
//
//  Every value reads from import.meta.env and falls back to its
//  production default so a staging Netlify deploy is a pure env-var
//  operation (set VITE_API_URL=https://staging-api.dander.io etc in
//  Netlify → Environment variables and redeploy).
// ============================================================

const env = import.meta.env || {};

function trim(s) {
  return typeof s === 'string' ? s.replace(/\/+$/, '') : s;
}

// API origin (REST + Socket.IO transport). Local dev: empty string
// so the Vite proxy can rewrite /api → http://localhost:4000.
export const API_URL = trim(env.VITE_API_URL || 'http://localhost:4000');

// Brand / platform name shown in titles, headers, copy. Defaults to
// 'Dander' so a white-label staging environment can rebrand without
// code edits.
export const PLATFORM_NAME = env.VITE_PLATFORM_NAME || 'Dander';

export default { API_URL, PLATFORM_NAME };
