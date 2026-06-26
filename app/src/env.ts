/**
 * env.ts — single source of truth for runtime configuration.
 *
 * Expo only exposes process.env vars prefixed EXPO_PUBLIC_ to client
 * bundles. Read them once here so the rest of the app imports a typed
 * object instead of touching process.env directly.
 */

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://api.tapprove.io')
  .replace(/\/+$/, ''); // trim trailing slash

// Public web origin — used to build shareable /o/:id links (recipients get the
// OG preview + the web flow). Staging builds set this to the staging frontend.
const PUBLIC_APP_URL = (process.env.EXPO_PUBLIC_APP_URL || 'https://tapprove.io')
  .replace(/\/+$/, '');

export const env = {
  API_URL,
  PUBLIC_APP_URL,
} as const;
