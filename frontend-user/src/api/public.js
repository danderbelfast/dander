import client from './client';

// Unauthenticated business summary used by the stranger landing: business name,
// today's active offer (or null), visitor count.
export const getStrangerDisplay = (businessId) =>
  client.get(`/api/public/business/${Number(businessId)}/stranger-display`).then((r) => r.data);

// Best-effort: fire the in-store kiosk "new visitor" display. Never throws —
// a failure here must not affect the landing page.
export const fireStrangerVisit = ({ node, business }) =>
  client
    .post('/api/public/nfc-stranger', { node_device_id: node, business_id: Number(business) })
    .then(() => undefined)
    .catch(() => undefined);

// All active offers for a business (+ name/logo). Unauthenticated — powers the
// web business offers page.
export const getBusinessOffers = (businessId) =>
  client.get(`/api/public/business/${Number(businessId)}/offers`).then((r) => r.data);
