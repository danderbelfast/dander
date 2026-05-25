-- 022_wifi_fingerprints.sql
-- WiFi fingerprint database for proximity / footfall inference.
--
-- Two-tier model:
--   wifi_observations  — raw captures, pruned by the nightly job after 30 days
--   wifi_fingerprints  — aggregated + enriched, permanent
--
-- Spec deviations called out so they're easy to revisit:
--   • user_id is UUID with NO foreign key. The existing users.id is SERIAL
--     (integer), so a UUID FK would not be type-compatible. This column is
--     intended to hold a hashed/anonymised identifier (e.g. HMAC of the real
--     user id under a server-side secret) so location data is not directly
--     joinable to user identity.
--   • business_id is INTEGER REFERENCES businesses(id), not UUID — the spec
--     said uuid, but businesses.id is SERIAL, so an integer FK is the only
--     option that actually constrains the relationship.
--   • aggregated_at was added to wifi_observations (not in the original
--     column list) so the nightly job can find "not yet aggregated" rows
--     without re-counting them on every run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── wifi_observations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wifi_observations (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID            NOT NULL,
  bssid            VARCHAR(17)     NOT NULL,
  ssid             VARCHAR(32),
  signal_strength  INTEGER,
  latitude         DECIMAL(10, 8)  NOT NULL,
  longitude        DECIMAL(11, 8)  NOT NULL,
  h3_index_r8      VARCHAR(16)     NOT NULL,
  h3_index_r10     VARCHAR(16)     NOT NULL,
  h3_index_r12     VARCHAR(16)     NOT NULL,
  accuracy_metres  INTEGER,
  captured_at      TIMESTAMPTZ     NOT NULL,
  aggregated_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wifi_obs_bssid        ON wifi_observations (bssid);
CREATE INDEX IF NOT EXISTS idx_wifi_obs_h3_r8        ON wifi_observations (h3_index_r8);
CREATE INDEX IF NOT EXISTS idx_wifi_obs_h3_r10       ON wifi_observations (h3_index_r10);
CREATE INDEX IF NOT EXISTS idx_wifi_obs_user_id      ON wifi_observations (user_id);
CREATE INDEX IF NOT EXISTS idx_wifi_obs_captured_at  ON wifi_observations (captured_at);
-- Partial index for the nightly job's "find un-aggregated rows" query.
CREATE INDEX IF NOT EXISTS idx_wifi_obs_unaggregated
  ON wifi_observations (bssid) WHERE aggregated_at IS NULL;

-- ── wifi_fingerprints ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wifi_fingerprints (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  bssid               VARCHAR(17)     NOT NULL UNIQUE,
  ssid                VARCHAR(32),
  h3_index_r8         VARCHAR(16)     NOT NULL,
  h3_index_r10        VARCHAR(16)     NOT NULL,
  h3_index_r12        VARCHAR(16)     NOT NULL,
  avg_lat             DECIMAL(10, 8)  NOT NULL,
  avg_lng             DECIMAL(11, 8)  NOT NULL,
  observation_count   INTEGER         NOT NULL DEFAULT 1,
  first_seen          TIMESTAMPTZ     NOT NULL,
  last_seen           TIMESTAMPTZ     NOT NULL,
  business_id         INTEGER         REFERENCES businesses(id) ON DELETE SET NULL,
  commercial_zone     BOOLEAN         NOT NULL DEFAULT false,
  confidence_score    INTEGER         NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wifi_fp_bssid        ON wifi_fingerprints (bssid);
CREATE INDEX IF NOT EXISTS idx_wifi_fp_h3_r8        ON wifi_fingerprints (h3_index_r8);
CREATE INDEX IF NOT EXISTS idx_wifi_fp_h3_r10       ON wifi_fingerprints (h3_index_r10);
CREATE INDEX IF NOT EXISTS idx_wifi_fp_business_id  ON wifi_fingerprints (business_id);
