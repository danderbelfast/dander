import client from './client';

export const getVapidPublicKey = () =>
  client.get('/api/push/vapid-public-key').then((r) => r.data.publicKey);

export const subscribePush = (subscription) =>
  client.post('/api/push/subscribe', subscription).then((r) => r.data);

export const unsubscribePush = (endpoint) =>
  client.delete('/api/push/subscribe', { data: { endpoint } }).then((r) => r.data);

export const updateLocation = (lat, lng) =>
  client.post('/api/users/location', { lat, lng }).then((r) => r.data);
