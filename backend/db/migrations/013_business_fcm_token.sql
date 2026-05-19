-- 013_business_fcm_token.sql
-- FCM push token for business dashboard notifications.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS business_fcm_token TEXT;
