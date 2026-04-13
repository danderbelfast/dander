import client from './client';

// ── Platform stats ──────────────────────────────────────────
export const getPlatformStats = () =>
  client.get('/api/admin/stats').then((r) => {
    const s = r.data.stats || r.data;
    // Normalise nested shape from backend into flat shape for Dashboard
    if (s.users !== undefined) {
      return {
        totalUsers:        s.users?.total        ?? s.totalUsers        ?? 0,
        activeBusinesses:  s.businesses?.active  ?? s.activeBusinesses  ?? 0,
        offersLiveToday:   s.offers?.active      ?? s.offersLiveToday   ?? 0,
        redemptionsToday:  s.redemptions?.today      ?? s.redemptionsToday  ?? 0,
        redemptionsWeek:   s.redemptions?.this_week  ?? s.redemptionsWeek  ?? 0,
        redemptionsMonth:  s.redemptions?.this_month ?? s.redemptionsMonth ?? 0,
        claimsToday:       s.claims?.today           ?? s.claimsToday      ?? 0,
        claimsWeek:        s.claims?.this_week       ?? s.claimsWeek       ?? 0,
        claimsMonth:       s.claims?.this_month      ?? s.claimsMonth      ?? 0,
        newBizToday:       s.new_businesses?.today      ?? s.newBizToday   ?? 0,
        newBizWeek:        s.new_businesses?.this_week  ?? s.newBizWeek    ?? 0,
        newBizMonth:       s.new_businesses?.this_month ?? s.newBizMonth   ?? 0,
        signupsChart: (s.signups_last_30d || []).map((d) => ({
          day: (d.date || d.day || '').slice(5),
          signups: d.signups || 0,
        })),
        redemptionsChart: (s.redemptions_last_30d || []).map((d) => ({
          day: (d.date || d.day || '').slice(5),
          redemptions: d.redemptions || 0,
        })),
        topBusinesses: (s.top_businesses || []).map((b) => ({
          name: b.name, category: b.city || b.category,
          redeemed: parseInt(b.total_redeemed || b.redemptions || 0, 10),
        })),
        topOffers: (s.top_offers || []).map((o) => ({
          title: o.title, businessName: o.business_name || o.businessName,
          redeemed: parseInt(o.total_redeemed || o.redemptions || 0, 10),
        })),
      };
    }
    return s; // already flat
  });

// ── Businesses ──────────────────────────────────────────────
export const getBusinesses = (params) =>
  client.get('/api/admin/businesses', { params }).then((r) => r.data);

export const getBusiness = (id) =>
  client.get(`/api/admin/businesses/${id}`).then((r) => r.data);

export const approveBusiness = (id) =>
  client.put(`/api/admin/businesses/${id}/approve`).then((r) => r.data);

export const suspendBusiness = (id, reason) =>
  client.put(`/api/admin/businesses/${id}/suspend`, { reason }).then((r) => r.data);

// ── Offers ──────────────────────────────────────────────────
export const getAdminOffers = (params) =>
  client.get('/api/admin/offers', { params }).then((r) => r.data);

export const removeOffer = (id, reason) =>
  client.put(`/api/admin/offers/${id}/remove`, { reason }).then((r) => r.data);

// ── Users ───────────────────────────────────────────────────
export const getUsers = (params) =>
  client.get('/api/admin/users', { params }).then((r) => r.data);

export const suspendUser = (id, reason) =>
  client.put(`/api/admin/users/${id}/suspend`, { reason }).then((r) => r.data);

// ── Reports ─────────────────────────────────────────────────
export const getReports = () =>
  client.get('/api/admin/reports').then((r) => r.data);

export const exportCSV = (type) =>
  client.get(`/api/admin/export/${type}`, { responseType: 'blob' }).then((r) => r.data);

// ── Profit & ROI ────────────────────────────────────────────
export const getPlatformProfitStats = (from, to) =>
  client.get('/api/admin/stats/profit', { params: { from, to } }).then((r) => r.data);

export const getPlatformProfitChart = (from, to) =>
  client.get('/api/admin/stats/profit/chart', { params: { from, to } }).then((r) => r.data);

export const getBusinessProfit = (id, from, to) =>
  client.get(`/api/admin/businesses/${id}/profit`, { params: { from, to } }).then((r) => r.data);

export const getProfitReports = (from, to) =>
  client.get('/api/admin/reports/profit', { params: { from, to } }).then((r) => r.data);

export const exportProfitCSV = (from, to) =>
  client.get('/api/admin/export/profit', { params: { from, to }, responseType: 'blob' });

// ── Business Hours ──────────────────────────────────────────
export const getBusinessHoursAdmin = (id) =>
  client.get(`/api/admin/businesses/${id}/hours`).then((r) => r.data).catch(() => null);

// ── Settings ────────────────────────────────────────────────
export const getSettings = () =>
  client.get('/api/admin/settings').then((r) => r.data);

export const saveSettings = (data) =>
  client.put('/api/admin/settings', data).then((r) => r.data);

export const createAdminUser = (data) =>
  client.post('/api/admin/users/admin', data).then((r) => r.data);

// ── Map data ─────────────────────────────────────────────────
export const getMapData = () =>
  client.get('/api/admin/map').then((r) => r.data);
