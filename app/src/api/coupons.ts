/**
 * coupons.ts — claim, list, and QR-detail endpoints for the user side.
 *
 * The business-side redeem endpoints aren't exposed here; only the calls a
 * shopper would make from the user app.
 */

import { client } from './client';

export type CouponStatus = 'active' | 'redeemed' | 'expired';

export interface Coupon {
  id:             number;
  code:           string;            // DAN-XXXX
  qr_token:       string;
  status:         CouponStatus;
  created_at:     string;
  redeemed_at?:   string | null;
  offer_id?:      number;
  offer_title?:   string;
  business_id?:   number;
  business_name?: string;
  // Some endpoints return additional fields; tolerate them on the type.
  [k: string]:    unknown;
}

export interface CouponsByStatus {
  total:    number;
  active:   Coupon[];
  redeemed: Coupon[];
  expired:  Coupon[];
}

/** Generate a coupon for an offer the user just claimed. */
export const claimCoupon = (offerId: number, location?: { lat: number; lng: number }) =>
  client
    .post<{
      success: true;
      coupon?: Coupon;
      couponId?: number;
      code?: string;
      qr_token?: string;
    }>('/api/coupons/generate', {
      offerId,
      ...(location ? { lat: location.lat, lng: location.lng } : {}),
    })
    .then((r) => r.data);

/** Grouped list of the caller's coupons. */
export const listMyCoupons = () =>
  client
    .get<{ success: true } & CouponsByStatus>('/api/coupons/mine')
    .then((r) => r.data);

/** Single coupon with the QR payload for the till. */
export const getCouponQr = (couponId: number) =>
  client
    .get<{ success: true; coupon: Coupon }>(`/api/coupons/${couponId}/qr`)
    .then((r) => r.data.coupon);
