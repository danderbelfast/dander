-- ============================================================
--  Variable reward tiers — the Dopamine System.
--
--  One row per business. Each row carries a monthly pool of bronze /
--  silver / gold awards (the rare, exciting outcomes) and a standard
--  points amount given on every other tap. Resets on the 1st of each
--  calendar month (the service does the reset lazily on the first
--  selection of the new month).
--
--  Customer never sees the remaining counts — pure surprise per tap.
-- ============================================================

CREATE TABLE IF NOT EXISTS reward_tiers (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           INTEGER      NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,

  -- Always-on baseline (10–50 enforced by the dashboard slider).
  standard_points       INTEGER      NOT NULL DEFAULT 30
                          CHECK (standard_points BETWEEN 10 AND 50),

  -- Tier amounts + monthly pool sizes. _remaining is decremented as
  -- each tier is awarded; the service resets _remaining to
  -- _monthly_count on the first selection of a new calendar month.
  bronze_points         INTEGER      NOT NULL DEFAULT 100  CHECK (bronze_points > 0),
  bronze_monthly_count  INTEGER      NOT NULL DEFAULT 10   CHECK (bronze_monthly_count >= 0),
  bronze_remaining      INTEGER      NOT NULL DEFAULT 10   CHECK (bronze_remaining >= 0),

  silver_points         INTEGER      NOT NULL DEFAULT 300  CHECK (silver_points > 0),
  silver_monthly_count  INTEGER      NOT NULL DEFAULT 3    CHECK (silver_monthly_count >= 0),
  silver_remaining      INTEGER      NOT NULL DEFAULT 3    CHECK (silver_remaining >= 0),

  gold_points           INTEGER      NOT NULL DEFAULT 500  CHECK (gold_points > 0),
  gold_monthly_count    INTEGER      NOT NULL DEFAULT 1    CHECK (gold_monthly_count >= 0),
  gold_remaining        INTEGER      NOT NULL DEFAULT 1    CHECK (gold_remaining >= 0),

  -- Always the 1st right now; column exists so we can shift it later
  -- (e.g. a business whose accounting cycle starts mid-month).
  reset_day             INTEGER      NOT NULL DEFAULT 1    CHECK (reset_day BETWEEN 1 AND 28),

  last_reset_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
