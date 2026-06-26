/**
 * offers.ts — nearby offers + single offer lookup.
 *
 * `/api/offers` (without query params) doesn't exist on the backend yet;
 * callers should `try/catch` and fall back to an empty list.
 */

import { client } from './client';

export interface Offer {
  id:                number;
  business_id:       number;
  title:             string;
  description:       string | null;
  terms:             string | null;
  category:          string | null;
  offer_type:        string | null;
  original_price:    number | null;
  offer_price:       number | null;
  discount_percent:  number | null;
  max_redemptions:   number | null;
  current_redemptions: number;
  expires_at:        string | null;
  is_active:         boolean;
  business_name?:    string;
  business_category?: string | null;
  business_logo_url?: string | null;
  business_address?: string | null;
  business_city?:    string | null;
}

export interface NearbyParams {
  lat:      number;
  lng:      number;
  radius?:  number;
  category?: string;
}

export const getNearbyOffers = (params: NearbyParams) =>
  client
    .get<{ success: true; count: number; offers: Offer[] }>('/api/offers/nearby', { params })
    .then((r) => r.data.offers);

export interface ListParams {
  limit?:  number;
  status?: 'active' | 'all';
}

export const listOffers = (params?: ListParams) =>
  client
    .get<{ success: true; count: number; offers: Offer[] }>('/api/offers', {
      params: { limit: 50, status: 'active', ...(params || {}) },
    })
    .then((r) => r.data.offers);

export const getOfferById = (id: number) =>
  client
    .get<{ success: true; offer: Offer }>(`/api/offers/${id}`)
    .then((r) => r.data.offer);

// ── Offer activation (attribution) ───────────────────────────
// App activations are always authenticated → channel/source 'app'.
export const activateOffer = (id: number, opts: { channel?: string; source?: string } = {}) =>
  client
    .post<{ success: true; activation_id: string; status: string }>(`/api/offers/${id}/activate`, {
      channel: opts.channel ?? 'app',
      source:  opts.source ?? 'app',
    })
    .then((r) => r.data);

export const deactivateOffer = (id: number) =>
  client.delete(`/api/offers/${id}/activate`).then((r) => r.data);

export interface MyOffer extends Offer {
  activation_id: string;
  channel:       string;
  status:        string;
  activated_at:  string;
  image_url?:    string | null;
}

// My Offers — the user's activated offers (non-expired). GET /api/offers/activated.
export const getMyOffers = () =>
  client
    .get<{ success: true; count: number; offers: MyOffer[] }>('/api/offers/activated')
    .then((r) => r.data.offers);

// ── Share (aggregate counter; attribution is on the recipient's activation) ──
export const trackShare = (id: number) =>
  client.post(`/api/v1/offers/${id}/share`).then((r) => r.data).catch(() => undefined);
