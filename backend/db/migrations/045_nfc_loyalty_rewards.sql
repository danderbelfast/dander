-- 045_nfc_loyalty_rewards.sql
-- Loyalty rewards, collectables, streaks and tiers. Schema notes:
--
--   Reward / collectable IDs are UUID (matching their parent tables'
--   PK type) — the spec text says INTEGER but the parent rows are UUID
--   so we stay consistent.
--
--   Default 4-reward journey + per-category collectable assignment for
--   every existing business is seeded inline. A trigger keeps new
--   businesses in sync.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- loyalty_rewards — per-business reward journey
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name            VARCHAR(120) NOT NULL,
  description     TEXT,
  points_required INTEGER NOT NULL CHECK (points_required > 0),
  reward_type     VARCHAR(20) NOT NULL DEFAULT 'freebie'
                    CHECK (reward_type IN ('freebie','discount','experience')),
  emoji           VARCHAR(8) NOT NULL DEFAULT '🎁',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_business
  ON loyalty_rewards (business_id, is_active, points_required);

-- ---------------------------------------------------------------------
-- reward_redemptions — log of every reward claim
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id    UUID    NOT NULL REFERENCES loyalty_rewards(id) ON DELETE CASCADE,
  redeemed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visit_id     UUID
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user_biz
  ON reward_redemptions (user_id, business_id, redeemed_at DESC);

-- ---------------------------------------------------------------------
-- business_collectables — one auto-assigned collectable per business
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS business_collectables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     INTEGER UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  name            VARCHAR(80) NOT NULL,
  emoji           VARCHAR(8) NOT NULL,
  description     TEXT,
  rarity          VARCHAR(20) NOT NULL DEFAULT 'common'
                    CHECK (rarity IN ('common','rare','epic','legendary')),
  unlock_visits   INTEGER NOT NULL DEFAULT 5,
  evolved_emoji   VARCHAR(8),
  evolved_name    VARCHAR(80),
  evolved_visits  INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- user_collectables — per (user, business) unlock state
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_collectables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id     INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  collectable_id  UUID    NOT NULL REFERENCES business_collectables(id) ON DELETE CASCADE,
  unlocked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evolved_at      TIMESTAMPTZ,
  is_evolved      BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (user_id, business_id)
);

CREATE INDEX IF NOT EXISTS idx_user_collectables_user
  ON user_collectables (user_id, unlocked_at DESC);

-- ---------------------------------------------------------------------
-- business_loyalty_points — streak + tier columns
-- ---------------------------------------------------------------------

ALTER TABLE business_loyalty_points
  ADD COLUMN IF NOT EXISTS current_streak   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_visit_date  DATE,
  ADD COLUMN IF NOT EXISTS tier             VARCHAR(20) NOT NULL DEFAULT 'bronze';

-- CHECK constraint added separately so re-running this migration is
-- safe even if the column already existed without the constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'business_loyalty_points_tier_check'
  ) THEN
    ALTER TABLE business_loyalty_points
      ADD CONSTRAINT business_loyalty_points_tier_check
      CHECK (tier IN ('bronze','silver','gold','platinum','diamond','obsidian','legend'));
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- business_loyalty_settings — points per pound for purchase awards
-- ---------------------------------------------------------------------

ALTER TABLE business_loyalty_settings
  ADD COLUMN IF NOT EXISTS points_per_pound NUMERIC(6,2) NOT NULL DEFAULT 5;

-- ---------------------------------------------------------------------
-- Default reward journey for every business
-- ---------------------------------------------------------------------

INSERT INTO loyalty_rewards (business_id, name, description, points_required, emoji, sort_order)
SELECT b.id, '☕ Free Coffee',    'A coffee on the house.',   500,  '☕', 1 FROM businesses b
  WHERE NOT EXISTS (SELECT 1 FROM loyalty_rewards r WHERE r.business_id = b.id AND r.points_required = 500);

INSERT INTO loyalty_rewards (business_id, name, description, points_required, emoji, sort_order)
SELECT b.id, '🥐 Free Pastry',   'Pick a pastry, on us.',    1000, '🥐', 2 FROM businesses b
  WHERE NOT EXISTS (SELECT 1 FROM loyalty_rewards r WHERE r.business_id = b.id AND r.points_required = 1000);

INSERT INTO loyalty_rewards (business_id, name, description, points_required, emoji, sort_order)
SELECT b.id, '🥪 Free Sandwich', 'Lunchtime on the house.',  2000, '🥪', 3 FROM businesses b
  WHERE NOT EXISTS (SELECT 1 FROM loyalty_rewards r WHERE r.business_id = b.id AND r.points_required = 2000);

INSERT INTO loyalty_rewards (business_id, name, description, points_required, emoji, sort_order)
SELECT b.id, '🍽️ Free Meal',     'A full meal on us.',       5000, '🍽️', 4 FROM businesses b
  WHERE NOT EXISTS (SELECT 1 FROM loyalty_rewards r WHERE r.business_id = b.id AND r.points_required = 5000);

-- ---------------------------------------------------------------------
-- Per-category collectable seeder. Centralised in a function so the
-- trigger below and the backfill call can share the logic.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION dander_assign_collectable(p_business_id INTEGER)
RETURNS VOID AS $$
DECLARE
  cat TEXT;
  v_emoji TEXT;
  v_name  TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM business_collectables WHERE business_id = p_business_id) THEN
    RETURN;
  END IF;
  SELECT LOWER(COALESCE(category, '')) INTO cat FROM businesses WHERE id = p_business_id;
  IF cat ~ '(cafe|coffee)'                  THEN v_emoji := '☕'; v_name := 'The Coffee Cup';
  ELSIF cat ~ '(restaurant|food)'           THEN v_emoji := '🍕'; v_name := 'The Slice';
  ELSIF cat ~ '(beauty|hair|salon)'         THEN v_emoji := '💅'; v_name := 'The Gem';
  ELSIF cat ~ '(automotive|garage)'         THEN v_emoji := '⚡'; v_name := 'The Bolt';
  ELSIF cat ~ '(retail|shop)'               THEN v_emoji := '🛍️'; v_name := 'The Bag';
  ELSIF cat ~ '(fitness|sport)'             THEN v_emoji := '💪'; v_name := 'The Shield';
  ELSE                                            v_emoji := '⭐'; v_name := 'The Star';
  END IF;
  INSERT INTO business_collectables
    (business_id, name, emoji, description, rarity, unlock_visits)
  VALUES
    (p_business_id, v_name, v_emoji,
     'Collect this by visiting ' || (SELECT name FROM businesses WHERE id = p_business_id) || '.',
     'common', 5);
END;
$$ LANGUAGE plpgsql;

-- Backfill for every existing business.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM businesses LOOP
    PERFORM dander_assign_collectable(r.id);
  END LOOP;
END$$;

-- Trigger so new businesses get a collectable automatically.
CREATE OR REPLACE FUNCTION dander_assign_collectable_trigger()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM dander_assign_collectable(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dander_assign_collectable ON businesses;
CREATE TRIGGER trg_dander_assign_collectable
  AFTER INSERT ON businesses
  FOR EACH ROW EXECUTE FUNCTION dander_assign_collectable_trigger();
