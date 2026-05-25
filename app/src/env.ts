/**
 * env.ts — single source of truth for runtime configuration.
 *
 * Expo only exposes process.env vars prefixed EXPO_PUBLIC_ to client
 * bundles. Read them once here so the rest of the app imports a typed
 * object instead of touching process.env directly.
 */

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://api.dander.io')
  .replace(/\/+$/, ''); // trim trailing slash

export const env = {
  API_URL,
} as const;
