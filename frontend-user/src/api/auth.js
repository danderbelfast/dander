import client from './client';

export const register = (data) =>
  client.post('/api/auth/register', data).then((r) => r.data);

export const verifySetup2FA = (userId, token) =>
  client.post('/api/auth/verify-2fa', { userId, token }).then((r) => r.data);

export const login = (email, password) =>
  client.post('/api/auth/login', { email, password }).then((r) => r.data);

export const verifyLogin2FA = (tempToken, totpCode) =>
  client.post('/api/auth/login/verify', { tempToken, totpCode }).then((r) => r.data);

export const refreshAccessToken = (refreshToken) =>
  client.post('/api/auth/refresh', { refreshToken }).then((r) => r.data);

export const resendOtp = (userId, purpose) =>
  client.post('/api/auth/resend-otp', { userId, purpose }).then((r) => r.data);

export const registerBusiness = (data) =>
  client.post('/api/auth/business/register', data).then((r) => r.data);

export const forgotPassword = (email) =>
  client.post('/api/auth/forgot-password', { email }).then((r) => r.data);

export const resetPassword = (userId, code, newPassword) =>
  client.post('/api/auth/reset-password', { userId, code, newPassword }).then((r) => r.data);
