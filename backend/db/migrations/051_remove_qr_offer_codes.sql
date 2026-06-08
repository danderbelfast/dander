-- ============================================================
--  QR / code-based offer redemption is gone.
--  Offers are now applied at the till during an NFC tap (staff sees
--  the offer in the TillPanel, applies the discount, and enters the
--  final amount). No coupon code or QR token is needed for that flow.
--
--  We drop qr_token entirely. `code` stays for now so the existing
--  my-coupons screens in the user app and frontend-user can keep
--  rendering already-generated coupon rows as read-only history —
--  no new coupons will be generated.
-- ============================================================

ALTER TABLE coupons
  DROP COLUMN IF EXISTS qr_token;
