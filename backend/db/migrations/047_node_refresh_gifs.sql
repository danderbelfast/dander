-- 047_node_refresh_gifs.sql
-- One-shot flag set by the dashboard ("rebuild your GIF cache") and
-- consumed by the next webhook upload from the Node — the webhook
-- handler reads the flag, returns true to the device, then nulls it
-- so the next upload doesn't redeliver.

ALTER TABLE node_commands
  ADD COLUMN IF NOT EXISTS refresh_gifs BOOLEAN;
