import client from './client';

export const login = (email, password) =>
  client.post('/api/auth/login', { email, password }).then((r) => r.data);

export const verifyLogin2FA = (tempToken, totpCode) =>
  client.post('/api/auth/login/verify', { tempToken, totpCode }).then((r) => r.data);
