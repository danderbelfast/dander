-- 027_step_counting.sql
-- Step counting + per-user step totals.
--
-- One row per user per UTC day in step_logs. Points awarded into the
-- main points_transactions ledger (see routes/steps.js); points_awarded
-- here records what's already been credited for that day, so re-POSTing
-- with a higher step count only awards the delta.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS step_logs (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  steps            INTEGER         NOT NULL DEFAULT 0,
  distance_metres  INTEGER,
  logged_at        DATE            NOT NULL,
  points_awarded   INTEGER         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_step_logs_user_day UNIQUE (user_id, logged_at)
);

CREATE INDEX IF NOT EXISTS idx_step_logs_user_day
  ON step_logs (user_id, logged_at DESC);

-- ── Per-user step totals on user_loyalty (cheap to read on hot paths) ─────
ALTER TABLE user_loyalty ADD COLUMN IF NOT EXISTS steps_today      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_loyalty ADD COLUMN IF NOT EXISTS steps_this_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_loyalty ADD COLUMN IF NOT EXISTS steps_all_time   INTEGER NOT NULL DEFAULT 0;
