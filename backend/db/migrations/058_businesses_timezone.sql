-- 058_businesses_timezone.sql
--
-- Per-business timezone for the same-day dedup rule. The previous
-- SQL CURRENT_DATE in Railway's Etc/UTC session was wrong for UK
-- businesses on BST — a 1am-local check-in counted as "yesterday".
-- All same-day guards now compare against
--   (timestamptz AT TIME ZONE businesses.timezone)::date
-- using this column.
--
-- Default 'Europe/London' is correct for the live UK estate; overseas
-- merchants set their own via the dashboard (UI lands later).
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/London';
