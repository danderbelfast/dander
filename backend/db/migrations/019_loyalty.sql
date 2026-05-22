-- 019_loyalty.sql
-- Shopper loyalty points, milestones, and rewards.

CREATE TABLE IF NOT EXISTS user_loyalty (
  id              SERIAL        PRIMARY KEY,
  user_id         INTEGER       NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  total_points    INTEGER       NOT NULL DEFAULT 0,
  lifetime_points INTEGER       NOT NULL DEFAULT 0,
  total_saved_gbp NUMERIC(10,2) NOT NULL DEFAULT 0,
  tier            VARCHAR(20)   NOT NULL DEFAULT 'bronze'
    CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  current_milestone_id INTEGER,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_user_loyalty_updated_at ON user_loyalty;
CREATE TRIGGER trg_user_loyalty_updated_at
  BEFORE UPDATE ON user_loyalty
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS points_transactions (
  id              SERIAL        PRIMARY KEY,
  user_id         INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(20)   NOT NULL CHECK (type IN ('earn', 'redeem', 'bonus', 'referral')),
  points          INTEGER       NOT NULL,
  description     TEXT,
  reference_type  VARCHAR(30),
  reference_id    INTEGER,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_points_tx_user
  ON points_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS loyalty_milestones (
  id              SERIAL        PRIMARY KEY,
  threshold_gbp   NUMERIC(10,2) NOT NULL,
  title           VARCHAR(100)  NOT NULL,
  description     TEXT,
  reward_type     VARCHAR(30)   NOT NULL DEFAULT 'freebie'
    CHECK (reward_type IN ('freebie', 'discount', 'badge', 'premium_deal')),
  reward_value    JSONB         DEFAULT '{}',
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  sort_order      INTEGER       DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_milestone_unlocks (
  id              SERIAL        PRIMARY KEY,
  user_id         INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_id    INTEGER       NOT NULL REFERENCES loyalty_milestones(id) ON DELETE CASCADE,
  unlocked_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  redeemed_at     TIMESTAMPTZ,
  UNIQUE (user_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_milestone_unlocks_user
  ON user_milestone_unlocks (user_id);

-- Seed default milestones
INSERT INTO loyalty_milestones (threshold_gbp, title, description, reward_type, reward_value, sort_order)
VALUES
  (25,  'First Steps',    'You''ve saved £25 with Dander!',  'badge',        '{"badge":"🎉"}', 1),
  (50,  'Regular Saver',  'You''ve saved £50 — here''s a treat.', 'discount', '{"percent":10}', 2),
  (100, 'Super Saver',    'You''ve saved £100! Unlock a freebie.', 'freebie', '{"description":"Free item from a participating business"}', 3),
  (250, 'Dander Champion','You''ve saved £250. Legend status.',     'premium_deal', '{"description":"Exclusive premium deal access"}', 4)
ON CONFLICT DO NOTHING;
