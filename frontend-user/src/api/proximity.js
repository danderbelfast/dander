import client from './client';

// Award points for a check-in tap. Requires an authenticated session — the
// shared client attaches the Bearer token and refreshes on 401.
export const nfcCheckin = ({ node, business }) =>
  client
    .post('/api/proximity/nfc-checkin', { node_device_id: node, business_id: Number(business) })
    .then((r) => r.data);
