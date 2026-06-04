-- 049_users_date_of_birth.sql
-- Optional date_of_birth for users. Combined with users.birthday_sharing
-- from migration 046 to gate the 'birthday' greeting trigger:
--   greeting_type='birthday' fires only when
--     today's MM-DD matches users.date_of_birth's MM-DD
--     AND users.birthday_sharing IS TRUE.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;
