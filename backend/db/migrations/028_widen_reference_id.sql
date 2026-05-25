-- 028_widen_reference_id.sql
-- Widen points_transactions.reference_id from INTEGER to VARCHAR(128) so
-- future inserts can pass non-integer identifiers (bssid strings, date
-- strings, etc.) directly rather than encoding them in the description.
--
-- Existing INTEGER values are auto-cast to their text representation by
-- Postgres during ALTER COLUMN ... TYPE; no data is lost.

ALTER TABLE points_transactions
  ALTER COLUMN reference_id TYPE VARCHAR(128) USING reference_id::varchar;
