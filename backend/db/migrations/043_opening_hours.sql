-- 043_opening_hours.sql
-- Per-day weekly opening schedule on the business + propagation column
-- on node_commands so the dashboard can push hours to every paired Node
-- via the existing remote-command channel.
--
-- Schema for the JSONB:
--   {
--     "monday":    {"open": "09:00", "close": "17:30", "closed": false},
--     ...
--     "sunday":    {"open": "09:00", "close": "17:30", "closed": true}
--   }
-- All seven day keys MUST be present. open/close are 24h "HH:MM" strings;
-- closed=true means that day is shut regardless of open/close.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{
    "monday":    {"open": "09:00", "close": "17:30", "closed": false},
    "tuesday":   {"open": "09:00", "close": "17:30", "closed": false},
    "wednesday": {"open": "09:00", "close": "17:30", "closed": false},
    "thursday":  {"open": "09:00", "close": "17:30", "closed": false},
    "friday":    {"open": "09:00", "close": "17:30", "closed": false},
    "saturday":  {"open": "10:00", "close": "16:00", "closed": false},
    "sunday":    {"open": "09:00", "close": "17:30", "closed": true}
  }'::jsonb;

-- nullable on node_commands — only populated when the dashboard pushes a
-- schedule via POST /api/business/opening-hours.
ALTER TABLE node_commands
  ADD COLUMN IF NOT EXISTS opening_hours JSONB;
