-- 030_footfallcam_raw_messages.sql
-- Raw inbound messages from the FootfallCam Pro2 WebSocket channel
-- (wss://…/ws/footfallcam). We don't yet know the exact frame format the
-- device sends over the socket, so every message is captured verbatim
-- here for inspection before we build structured parsing.
--
-- raw_payload is JSONB: the WS handler stores the parsed object when the
-- frame is valid JSON, otherwise { "_unparsed": true, "text": "<frame>" }
-- so the column is always valid JSON and nothing is lost.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS footfallcam_raw_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_ip   VARCHAR(64),
  raw_payload JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_footfallcam_raw_created
  ON footfallcam_raw_messages(created_at DESC);
