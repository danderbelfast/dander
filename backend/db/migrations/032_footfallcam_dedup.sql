-- 032_footfallcam_dedup.sql
-- Deduplicate FootfallCam events: when a device reconnects it may resend
-- recent frames. A resent frame is the *same* event — same PeopleId, same
-- MetricId, same timestamp — so we key dedup on the event's identity.
--
-- We add people_id (PeopleId from the ffc-eventrawdata frame) and make the
-- unique key (device_serial, timestamp, people_id, count_in, count_out).
-- Including people_id is deliberate: a coarser key like
-- (device_serial, timestamp, count_in, count_out) would also collapse TWO
-- DIFFERENT people who entered in the same second into one row — silent
-- under-counting. With people_id, only true resends collide.
--
-- Existing rows pre-date people_id, so theirs is NULL; Postgres treats NULL
-- as distinct in a UNIQUE constraint, so they never violate it and the
-- constraint can be added without a backfill/cleanup step.

ALTER TABLE footfallcam_readings ADD COLUMN IF NOT EXISTS people_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'footfallcam_readings_dedup'
  ) THEN
    ALTER TABLE footfallcam_readings
      ADD CONSTRAINT footfallcam_readings_dedup
      UNIQUE (device_serial, timestamp, people_id, count_in, count_out);
  END IF;
END $$;
