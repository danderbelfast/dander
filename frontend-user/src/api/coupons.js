import client from './client';

export const generateCoupon = ({ offerId, lat, lng }) =>
  client.post('/api/coupons/generate', { offerId, lat, lng }).then((r) => r.data);

export const getMyCoupons = () =>
  client.get('/api/coupons/mine').then((r) => r.data);
