-- 038_node_commands.sql
-- Remote control state for Dander Node phones.
--
-- One row per device_id. The phone polls (implicitly, via its 60s upload)
-- and reads the latest command back in the 200 response. We don't push —
-- the phone owns the cadence so we can't get stuck on a stale TCP socket
-- or hammered by retry storms.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS node_commands (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        VARCHAR(100) NOT NULL UNIQUE,
  business_id      INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  counting_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
  zone_name        VARCHAR(100),
  zone_type        VARCHAR(30),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_node_commands_business
  ON node_commands (business_id);
