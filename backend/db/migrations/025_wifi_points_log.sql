-- 025_wifi_points_log.sql
-- Audit log of points awarded for WiFi observations. Drives both the
-- leaderboard and the cross-user daily dedup gate.
--
-- Cross-user daily dedup: a given (bssid, award_day) pair can produce at
-- most one points award across the whole user base. The first user to
-- submit a BSSID on a given calendar day (UTC) earns the points; later
-- submissions of the same BSSID that day still store the observation
-- (good data for fingerprint enrichment) but earn 0 points. Enforced at
-- the DB level by the UNIQUE index below, so the ingest endpoint can
-- rely on INSERT … ON CONFLICT DO NOTHING for the gate.
--
-- user_id here is INTEGER (real users.id) — points are user-facing and
-- need to be joinable to the account. This is deliberately different
-- from wifi_observations.user_id, which is an anonymised UUID (the raw
-- location data should not be directly joinable to identity).

CREATE TABLE IF NOT EXISTS wifi_points_log (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bssid           VARCHAR(17)     NOT NULL,
  points          INTEGER         NOT NULL,
  awarded_for     VARCHAR(40)     NOT NULL DEFAULT 'discovery',
  award_day       DATE            NOT NULL,
  awarded_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- The cross-user daily dedup. ON CONFLICT (bssid, award_day) DO NOTHING
-- in the endpoint relies on this.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wifi_points_bssid_day
  ON wifi_points_log (bssid, award_day);

-- Leaderboard / per-user history lookups.
CREATE INDEX IF NOT EXISTS idx_wifi_points_user
  ON wifi_points_log (user_id, awarded_at DESC);

CREATE INDEX IF NOT EXISTS idx_wifi_points_day
  ON wifi_points_log (award_day);
