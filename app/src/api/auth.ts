/**
 * auth.ts — Dander auth endpoints.
 *
 * Both login and register are 2-step flows: the first call triggers an email
 * OTP and the second call verifies it. Login returns a tempToken to bind the
 * second step to the first; register returns a userId.
 */

import { client } from './client';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email:     string;
  password:  string;
  firstName: string;
  lastName:  string;
  phone?:    string;
}

export interface LoginInitResponse {
  success:     true;
  requires2FA: true;
  tempToken:   string;
}

export interface RegisterInitResponse {
  success: true;
  message: string;
  userId:  number;
}

export interface AuthUser {
  id:        number;
  email:     string;
  firstName: string | null;
  lastName:  string | null;
  avatarUrl: string | null;
  role:      string;
}

export interface LoginCompleteResponse {
  success:      true;
  accessToken:  string;
  refreshToken: string;
  expiresIn:    string;
  user:         AuthUser;
}

export const login = (payload: LoginPayload) =>
  client.post<LoginInitResponse>('/api/auth/login', payload).then((r) => r.data);

export const verifyLoginOtp = (tempToken: string, totpCode: string) =>
  client
    .post<LoginCompleteResponse>('/api/auth/login/verify', { tempToken, totpCode })
    .then((r) => r.data);

export const register = (payload: RegisterPayload) =>
  client.post<RegisterInitResponse>('/api/auth/register', payload).then((r) => r.data);

export interface RegisterVerifyResponse extends LoginCompleteResponse {
  verified: true;
  message:  string;
}

export const verifyRegisterOtp = (userId: number, token: string) =>
  client
    .post<RegisterVerifyResponse>('/api/auth/verify-2fa', { userId, token })
    .then((r) => r.data);

export const resendOtp = (userId: number, purpose: 'register' | 'login' | 'reset_password') =>
  client
    .post<{ success: true; message: string }>('/api/auth/resend-otp', { userId, purpose })
    .then((r) => r.data);
