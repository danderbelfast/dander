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

// ── Profit & ROI ────────────────────────────────────────────
export const getDashboardROI = (from, to) =>
  client.get('/api/business/dashboard/roi', { params: { from, to } }).then((r) => r.data);

export const getOfferProfit = (id) =>
  client.get(`/api/business/offers/${id}/profit`).then((r) => r.data);

export const getProfitReports = (from, to) =>
  client.get('/api/business/reports/profit', { params: { from, to } }).then((r) => r.data);

export const exportProfitCSV = (from, to) =>
  client.get('/api/business/reports/profit/csv', { params: { from, to }, responseType: 'blob' });

// ── Opening Hours ───────────────────────────────────────────
export const getBusinessHours = () =>
  client.get('/api/business/hours').then((r) => r.data);

export const saveBusinessHours = (hours) =>
  client.put('/api/business/hours', { hours }).then((r) => r.data);

export const addSpecialHours = (data) =>
  client.post('/api/business/hours/special', data).then((r) => r.data);

export const deleteSpecialHours = (id) =>
  client.delete(`/api/business/hours/special/${id}`).then((r) => r.data);

// ── Share ───────────────────────────────────────────────
export const getShareImage = (id) =>
  client.get(`/api/business/offers/${id}/share-image`, { responseType: 'blob' });

// ── Story ───────────────────────────────────────────────
export const getStory = () =>
  client.get('/api/business/story').then((r) => r.data);

export const postStory = (formData) =>
  client.post('/api/business/story', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const deleteStory = () =>
  client.delete('/api/business/story').then((r) => r.data);

// ── Staff ───────────────────────────────────────────────────
export const getStaff = () =>
  client.get('/api/business/staff').then((r) => r.data);

export const addStaff = (data) =>
  client.post('/api/business/staff', data).then((r) => r.data);

export const removeStaff = (id) =>
  client.delete(`/api/business/staff/${id}`).then((r) => r.data);

// ── Analytics ───────────────────────────────────────────────
export const getAnalyticsDashboard = (params) =>
  client.get('/api/analytics/dashboard', { params }).then((r) => r.data);

export const getAnalyticsRealtime = () =>
  client.get('/api/analytics/realtime').then((r) => r.data);

export const getAnalyticsDemographics = (params) =>
  client.get('/api/analytics/demographics', { params }).then((r) => r.data);

export const getAnalyticsZones = (params) =>
  client.get('/api/analytics/zones', { params }).then((r) => r.data);

export const generateAnalyticsPlaceholder = () =>
  client.post('/api/analytics/placeholder').then((r) => r.data);

export const getAnnotations = (params) =>
  client.get('/api/analytics/annotations', { params }).then((r) => r.data);

export const createAnnotation = (data) =>
  client.post('/api/analytics/annotations', data).then((r) => r.data);

export const updateAnnotation = (id, data) =>
  client.put(`/api/analytics/annotations/${id}`, data).then((r) => r.data);

export const deleteAnnotation = (id) =>
  client.delete(`/api/analytics/annotations/${id}`).then((r) => r.data);

// ── Rota ────────────────────────────────────────────────────
export const getRota = () =>
  client.get('/api/business/rota').then((r) => r.data);

export const saveRota = (rota) =>
  client.post('/api/business/rota', { rota }).then((r) => r.data);

// ── Notification Preferences ────────────────────────────────
export const getNotifPrefs = () =>
  client.get('/api/business/notification-preferences').then((r) => r.data);

export const saveNotifPrefs = (prefs) =>
  client.put('/api/business/notification-preferences', { prefs }).then((r) => r.data);

// ── API Keys ────────────────────────────────────────────────
export const getApiKeys = () =>
  client.get('/api/business/api-keys').then((r) => r.data);

export const createApiKey = (data) =>
  client.post('/api/business/api-keys', data).then((r) => r.data);

export const revokeApiKey = (id) =>
  client.delete(`/api/business/api-keys/${id}`).then((r) => r.data);

// ── Kilo Devices ────────────────────────────────────────────
export const getDevices = () =>
  client.get('/api/kilo/devices').then((r) => r.data);

export const registerDevice = (data) =>
  client.post('/api/kilo/devices', data).then((r) => r.data);

export const decommissionDevice = (id) =>
  client.delete(`/api/kilo/devices/${id}`).then((r) => r.data);

// ── FootfallCam Devices ─────────────────────────────────────
export const getFootfallDevices = () =>
  client.get('/api/devices/footfallcam').then((r) => r.data);

export const registerFootfallDevice = (data) =>
  client.post('/api/devices/footfallcam/register', data).then((r) => r.data);

export const getFootfallLive = () =>
  client.get('/api/devices/footfallcam/live').then((r) => r.data);

// ── QR Redeem ───────────────────────────────────────────────
export const redeemQR = (qrToken) =>
  client.post('/api/coupons/redeem-qr', { qr_token: qrToken }).then((r) => r.data);

// ── Inventory ───────────────────────────────────────────────
export const getInventory = () =>
  client.get('/api/business/inventory').then((r) => r.data);

export const addInventoryItem = (formData) =>
  client.post('/api/business/inventory', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const updateInventoryItem = (id, formData) =>
  client.put(`/api/business/inventory/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const removeInventoryItem = (id) =>
  client.delete(`/api/business/inventory/${id}`).then((r) => r.data);

// ── AI Assistant ────────────────────────────────────────────
export const getAssistantSuggestions = (page) =>
  client.get('/api/assistant/suggestions', { params: { page } }).then((r) => r.data);

export const sendAssistantMessage = (messages, page) =>
  client.post('/api/assistant/chat', { messages, page }).then((r) => r.data);

// ── Smart Specials (Claude Vision offer copy) ───────────────
export const getSmartSpecialsSettings = () =>
  client.get('/api/business/smart-specials/settings').then((r) => r.data);

export const saveSmartSpecialsSettings = (data) =>
  client.put('/api/business/smart-specials/settings', data).then((r) => r.data);

export const assessSmartSpecialPhoto = (formData) =>
  client.post('/api/business/smart-specials/assess', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);

export const postSmartSpecialOffer = (data) =>
  client.post('/api/business/smart-specials/post', data).then((r) => r.data);
