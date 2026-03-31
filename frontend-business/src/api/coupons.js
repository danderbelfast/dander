import client from './client';

export const redeemCoupon = (code, staffPin) =>
  client.post('/api/coupons/redeem', { code, staffPin }).then((r) => r.data);
