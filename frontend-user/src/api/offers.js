import client from './client';

export const getPublicStats = () =>
  client.get('/api/offers/stats').then((r) => r.data.stats);

export const getNearby = ({ lat, lng, radius = 2000, category, type, max_price }) => {
  const params = { lat, lng, radius };
  if (category && category !== 'All') params.category = category;
  if (type)      params.type      = type;
  if (max_price) params.max_price = max_price;
  return client.get('/api/offers/nearby', { params }).then((r) => r.data);
};

export const getOffer = (id) =>
  client.get(`/api/offers/${id}`).then((r) => r.data);

export const recordView = (id) =>
  client.post(`/api/offers/${id}/view`).then((r) => r.data);

export const saveOffer = (id) =>
  client.post(`/api/offers/${id}/save`).then((r) => r.data);

export const unsaveOffer = (id) =>
  client.delete(`/api/offers/${id}/save`).then((r) => r.data);

export const getSavedOffers = () =>
  client.get('/api/offers/saved').then((r) => r.data);
