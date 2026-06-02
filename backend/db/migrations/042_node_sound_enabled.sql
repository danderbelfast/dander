-- 042_node_sound_enabled.sql
-- Operator-controllable greeting-chime toggle on each Node.
-- Lives on node_commands so the dashboard can flip it remotely; the
-- Node also persists the same value locally and applies it on the next
-- greeting (read at fire time, no reload needed).

ALTER TABLE node_commands
  ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN;
