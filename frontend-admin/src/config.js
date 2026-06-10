// ============================================================
//  config.js — single source of truth for env-driven values in
//  the admin panel.
// ============================================================

const env = import.meta.env || {};

function trim(s) {
  return typeof s === 'string' ? s.replace(/\/+$/, '') : s;
}

export const API_URL = trim(env.VITE_API_URL || 'http://localhost:4000');
export const PLATFORM_NAME = env.VITE_PLATFORM_NAME || 'Dander';

export default { API_URL, PLATFORM_NAME };
