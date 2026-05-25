/**
 * auth.ts — login / register endpoints.
 *
 * The backend's response shape isn't pinned in code here — the AuthContext
 * narrows what it needs from `data` (accessToken, refreshToken, user).
 */

import { client } from './client';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

export const login = (payload: LoginPayload) =>
  client.post('/api/auth/login', payload).then((r) => r.data);

export const register = (payload: RegisterPayload) =>
  client.post('/api/auth/register', payload).then((r) => r.data);
