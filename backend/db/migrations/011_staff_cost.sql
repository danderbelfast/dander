-- 011_staff_cost.sql
-- Average hourly staff cost for ROI calculations.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS avg_hourly_staff_cost_gbp NUMERIC(8,2);
