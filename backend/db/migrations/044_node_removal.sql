-- 044_node_removal.sql
-- Soft-delete marker on node_commands so the dashboard can drop a Node
-- from the visible list without losing the historical phone_counter_readings.
-- Picking a single nullable timestamp over a separate nodes_removed table
-- keeps the listing query a one-row join and lets a Node be "un-removed"
-- just by NULL-ing the column (handy when an operator clicks Remove by
-- mistake — though there's no undo UI today).

ALTER TABLE node_commands
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_node_commands_removed
  ON node_commands (business_id, removed_at);
