import client from './client';

export const login = (email, password) =>
  client.post('/api/auth/login', { email, password }).then((r) => r.data);

export const verifyLogin2FA = (tempToken, totpCode) =>
  client.post('/api/auth/login/verify', { tempToken, totpCode }).then((r) => r.data);

export const refreshAccessToken = (refreshToken) =>
  client.post('/api/auth/refresh', { refreshToken }).then((r) => r.data);

export const registerBusiness = (ownerFields, businessFields) => {
  const formData = new FormData();
  Object.entries(ownerFields).forEach(([k, v]) => v != null && formData.append(k, v));
  formData.append('businessName',     businessFields.name     || '');
  formData.append('businessCategory', businessFields.category || '');
  formData.append('address',          businessFields.address  || '');
  formData.append('city',             businessFields.city     || '');
  if (businessFields.lat  != null) formData.append('lat',           businessFields.lat);
  if (businessFields.lng  != null) formData.append('lng',           businessFields.lng);
  if (businessFields.website)      formData.append('website',       businessFields.website);
  if (businessFields.phone)        formData.append('businessPhone', businessFields.phone);
  if (businessFields.logoFile)     formData.append('logo',          businessFields.logoFile);
  if (businessFields.coverFile)    formData.append('cover',         businessFields.coverFile);
  return client.post('/api/auth/business/register', formData).then((r) => r.data);
};

export const verifySetup2FA = (userId, token) =>
  client.post('/api/auth/verify-2fa', { userId, token }).then((r) => r.data);

export const resendOtp = (userId, purpose) =>
  client.post('/api/auth/resend-otp', { userId, purpose }).then((r) => r.data);
