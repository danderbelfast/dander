/**
 * soundGenerator.js — no-op stub.
 *
 * RedeemCoupon.jsx dynamically imports this for optional success-sound
 * feedback (`sg.playCouponRedeemed?.(0.5).catch(() => {})`). The full
 * implementation lives in the frontend-user app; the business app doesn't
 * need audio feedback, and the call site is already guarded with
 * optional chaining + try/catch, so a stub keeps the build clean and
 * runtime behaviour unchanged (silently does nothing).
 */

export function playCouponRedeemed(/* volume */) {
  return Promise.resolve();
}
