-- ============================================================
--  Till NFC check-in — purchase log
--  One row per completed staff-side award (POST /api/till/award-points).
--  Source-of-truth for the Physical AdWords targeting layer: every row
--  represents a real spend tied to a real loyalty account.
-- ============================================================

CREATE TABLE IF NOT EXISTS till_transactions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       INTEGER      NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id           INTEGER      NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  amount_spent      NUMERIC(10,2) NOT NULL CHECK (amount_spent > 0),
  points_awarded    INTEGER      NOT NULL CHECK (points_awarded >= 0),
  category          VARCHAR(40),
  item_description  TEXT,
  -- Nullable so a future automated path (no staff session) can still log.
  staff_user_id     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_till_tx_business_time
  ON till_transactions (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_till_tx_user_time
  ON till_transactions (user_id, created_at DESC);
