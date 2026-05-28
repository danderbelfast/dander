-- 031_footfallcam_event_fields.sql
-- Per-event fields the WebSocket parser fills in from FootfallCam
-- "ffc-eventrawdata" frames:
--   people_type — PeopleTypeId (1 = visitor, 2 = staff)
--   zone_id     — RoiId (region / zone the event belongs to)
--
-- Each ffc-eventrawdata frame is one atomic event, so a reading row may
-- have count_in / count_out / occupancy set to 1 depending on MetricId
-- (1000 = in, 2000 = out, 3000 = occupancy).

ALTER TABLE footfallcam_readings ADD COLUMN IF NOT EXISTS people_type INTEGER;
ALTER TABLE footfallcam_readings ADD COLUMN IF NOT EXISTS zone_id     INTEGER;
