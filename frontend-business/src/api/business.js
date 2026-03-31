import client from './client';

// ── Profile ────────────────────────────────────────────────
export const getProfile = () =>
  client.get('/api/business/me').then((r) => r.data);

export const updateProfile = (formData) =>
  client.put('/api/business/me', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

// ── Dashboard ──────────────────────────────────────────────
export const getDashboard = () =>
  client.get('/api/business/dashboard').then((r) => r.data);

// ── Offers ─────────────────────────────────────────────────
export const getOffers = () =>
  client.get('/api/business/offers').then((r) => r.data);

export const createOffer = (formData) =>
  client.post('/api/business/offers', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const updateOffer = (id, formData) =>
  client.put(`/api/business/offers/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const deactivateOffer = (id) =>
  client.delete(`/api/business/offers/${id}`).then((r) => r.data);

export const getOffer = (id) =>
  client.get(`/api/business/offers/${id}`).then((r) => r.data);

export const getMyOffers = () =>
  client.get('/api/business/offers').then((r) => r.data);

export const duplicateOffer = (id) =>
  client.post(`/api/business/offers/${id}/duplicate`).then((r) => r.data);

export const getOfferStats = (id) =>
  client.get(`/api/business/offers/${id}/stats`).then((r) => r.data);

// ── Staff ───────────────────────────────────────────────────
export const getStaff = () =>
  client.get('/api/business/staff').then((r) => r.data);

export const addStaff = (data) =>
  client.post('/api/business/staff', data).then((r) => r.data);

export const removeStaff = (id) =>
  client.delete(`/api/business/staff/${id}`).then((r) => r.data);
