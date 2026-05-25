-- 024_device_fingerprints.sql
-- Device fingerprinting for anti-fraud signals.
--
-- Spec deviation worth surfacing: the original spec said "UNIQUE constraint
-- on install_id", and also asked the endpoint to detect "more than 1
-- distinct user_id for the same install_id". Those two are structurally
-- incompatible — a globally-unique install_id can only ever appear with
-- one user_id. Resolved here by making the UNIQUE constraint composite on
-- (install_id, user_id): multiple user accounts on the same physical
-- install produce multiple rows, which is what makes the "multiple
-- accounts same device" check possible. The ingest endpoint upserts with
-- ON CONFLICT (install_id, user_id) to match.

CREATE TABLE IF NOT EXISTS device_fingerprints (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint     VARCHAR(128)    NOT NULL,
  install_id      VARCHAR(64)     NOT NULL,
  platform        VARCHAR(20),
  os_version      VARCHAR(40),
  app_version     VARCHAR(40),
  timezone        VARCHAR(64),
  screen_width    INTEGER,
  screen_height   INTEGER,
  first_seen      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  last_seen       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  seen_count      INTEGER         NOT NULL DEFAULT 1,
  flagged         BOOLEAN         NOT NULL DEFAULT false,
  flag_reason     VARCHAR(64),
  CONSTRAINT uq_device_fp_install_user UNIQUE (install_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_device_fp_user_id      ON device_fingerprints (user_id);
CREATE INDEX IF NOT EXISTS idx_device_fp_fingerprint  ON device_fingerprints (fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_fp_install_id   ON device_fingerprints (install_id);
-- Partial index — admin "show me flagged" queries hit this directly.
CREATE INDEX IF NOT EXISTS idx_device_fp_flagged
  ON device_fingerprints (last_seen DESC) WHERE flagged = true;
