-- 041_camera_facing.sql
-- Front / rear camera tracking for Dander Node phones.
--
-- The Node phone can run with either the rear camera (ceiling-mount,
-- looking straight down at a counting line) or the front camera (wall-
-- mount, screen facing outward toward customers). The selected lens
-- affects: which CameraSelector the app binds, whether the counter has
-- to mirror x-coordinates (front lens flips the horizontal axis), and
-- which physical install pattern the dashboard should expect for a
-- given node.
--
-- We add the column to both directions:
--   phone_counter_readings — what the device is currently using
--   node_commands          — what the dashboard wants it to switch to

ALTER TABLE phone_counter_readings
  ADD COLUMN IF NOT EXISTS camera_facing VARCHAR(8);

ALTER TABLE node_commands
  ADD COLUMN IF NOT EXISTS camera_facing VARCHAR(8);
