/**
 * client.ts — axios instance pointed at api.dander.io with an auth-token
 * interceptor.
 *
 * Token storage is in-memory plus AsyncStorage for persistence across
 * launches. AuthContext owns the lifecycle (set on login, clear on
 * logout, restore on app boot).
 *
 * On a 401 from a request that *was* carrying a Bearer token, we treat
 * the session as expired:
 *   1. Clear the access token (memory + AsyncStorage).
 *   2. Clear the user blob from AsyncStorage.
 *   3. Call the registered failure handler so AuthContext can drop its
 *      in-memory user and route to /login.
 *
 * Unauthenticated 401s (bad password on /api/auth/login, bad OTP on
 * /api/auth/login/verify, etc.) pass straight through — those requests
 * never have an Authorization header, so they don't trip this path.
 */

import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '../env';

const TOKEN_KEY = 'dander_access_token';
const USER_KEY  = 'dander_auth_user';   // mirrors AuthContext.USER_KEY

let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
  if (token) AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
  else       AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export async function restoreAccessToken(): Promise<string | null> {
  try {
    const t = await AsyncStorage.getItem(TOKEN_KEY);
    if (t) _accessToken = t;
    return _accessToken;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth-failure handler — registered by AuthContext so the response
// interceptor can trigger a logout + nav without importing React code
// (which would create a circular dep).
// ---------------------------------------------------------------------------

type AuthFailureHandler = () => void;
let authFailureHandler: AuthFailureHandler | null = null;

export function registerAuthFailureHandler(fn: AuthFailureHandler | null): void {
  authFailureHandler = fn;
}

// Prevents a burst of parallel 401s from triggering N alerts / N navs.
let signoutInFlight = false;

export const client: AxiosInstance = axios.create({
  baseURL: env.API_URL,
  timeout: 15_000,
});

client.interceptors.request.use((cfg) => {
  if (_accessToken) cfg.headers.Authorization = `Bearer ${_accessToken}`;
  return cfg;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status   = error?.response?.status;
    const code     = (error?.response?.data as { code?: string } | undefined)?.code;
    const hadAuth  = !!error?.config?.headers?.Authorization;

    const tokenExpired = (status === 401 || code === 'TOKEN_EXPIRED') && hadAuth;

    if (tokenExpired && !signoutInFlight) {
      signoutInFlight = true;
      setAccessToken(null);
      AsyncStorage.removeItem(USER_KEY).catch(() => {});
      try { authFailureHandler?.(); } catch { /* swallow */ }
      // Re-arm after a short window so a fresh sign-in can re-trigger
      // the handler if a *different* token expires later in the session.
      setTimeout(() => { signoutInFlight = false; }, 5_000);
    }

    return Promise.reject(error);
  },
);
