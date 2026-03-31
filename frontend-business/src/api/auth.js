import client from './client';

export const login = (email, password) =>
  client.post('/api/auth/login', { email, password }).then((r) => r.data);

export const verifyLogin2FA = (tempToken, totpCode) =>
  client.post('/api/auth/login/verify', { tempToken, totpCode }).then((r) => r.data);

export const refreshAccessToken = (refreshToken) =>
  client.post('/api/auth/refresh', { refreshToken }).then((r) => r.data);

export const registerBusiness = (ownerFields, businessFields) =>
  client.post('/api/auth/business/register', {
    ...ownerFields,
    businessName:     businessFields.name,
    businessCategory: businessFields.category,
    address:          businessFields.address,
    city:             businessFields.city,
    lat:              businessFields.lat,
    lng:              businessFields.lng,
    website:          businessFields.website,
    businessPhone:    businessFields.phone,
  }).then((r) => r.data);

export const verifySetup2FA = (userId, token) =>
  client.post('/api/auth/verify-2fa', { userId, token }).then((r) => r.data);

export const resendOtp = (userId, purpose) =>
  client.post('/api/auth/resend-otp', { userId, purpose }).then((r) => r.data);
