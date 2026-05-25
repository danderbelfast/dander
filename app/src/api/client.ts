/**
 * client.ts — axios instance pointed at api.dander.io with an auth-token
 * interceptor.
 *
 * Token storage is in-memory plus AsyncStorage for persistence across
 * launches. AuthContext owns the lifecycle (set on login, clear on
 * logout, restore on app boot).
 */

import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '../env';

const TOKEN_KEY = 'dander_access_token';

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

export const client: AxiosInstance = axios.create({
  baseURL: env.API_URL,
  timeout: 15_000,
});

client.interceptors.request.use((cfg) => {
  if (_accessToken) cfg.headers.Authorization = `Bearer ${_accessToken}`;
  return cfg;
});
