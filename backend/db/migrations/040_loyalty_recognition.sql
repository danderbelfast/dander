-- 040_loyalty_recognition.sql
-- Foundation for the per-business loyalty recognition flow.
--
-- Five tables, each scoped to a business + (where relevant) a user:
--
--   business_loyalty_settings — per-business tuning. Points per visit,
--       cooldown, greeting tone, Giphy API key override.
--
--   business_loyalty_points   — running point + visit totals per
--       (business, user). UNIQUE (business_id, user_id) so the proximity
--       endpoint can UPSERT cleanly.
--
--   customer_visits           — append-only log. One row per detection
--       event the proximity endpoint accepted. Points may be 0 for the
--       "already visited today" case but we still log the visit so the
--       dashboard can show greet-but-no-points.
--
--   business_messages         — operator-configurable greeting text per
--       trigger (first_visit, regular, milestone_10/50/100, long_absence,
--       birthday, already_visited_today). NOT unique — multiple active
--       messages per trigger are allowed; the endpoint picks one at
--       random to keep greetings feeling fresh.
--
--   node_display_commands     — one-shot display queue keyed by Node
--       device_id. Filled by the proximity endpoint, drained by the
--       phone-counter webhook on the next 60s upload.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- business_loyalty_settings
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS business_loyalty_settings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            INTEGER UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  points_per_visit       INTEGER NOT NULL DEFAULT 50,
  points_cooldown_hours  INTEGER NOT NULL DEFAULT 24,
  greeting_tone          VARCHAR(20) NOT NULL DEFAULT 'friendly'
                           CHECK (greeting_tone IN ('professional','friendly','cheeky','custom')),
  giphy_api_key          VARCHAR(100),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- customer_visits
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_visits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visited_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  points_awarded     INTEGER NOT NULL DEFAULT 0,
  points_awarded_at  TIMESTAMPTZ,
  visit_number       INTEGER,
  greeting_shown     VARCHAR(200),
  gif_url            TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_visits_biz_user_time
  ON customer_visits (business_id, user_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_visits_biz_time
  ON customer_visits (business_id, visited_at DESC);

-- ---------------------------------------------------------------------
-- business_loyalty_points
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS business_loyalty_points (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points         INTEGER NOT NULL DEFAULT 0,
  total_visits   INTEGER NOT NULL DEFAULT 0,
  last_visit_at  TIMESTAMPTZ,
  UNIQUE (business_id, user_id)
);

-- ---------------------------------------------------------------------
-- business_messages
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS business_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  trigger      VARCHAR(50) NOT NULL
                 CHECK (trigger IN ('regular','milestone_10','milestone_50',
                                    'milestone_100','long_absence','birthday',
                                    'first_visit','already_visited_today')),
  message      TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_messages_biz_trigger
  ON business_messages (business_id, trigger)
  WHERE is_active = TRUE;

-- ---------------------------------------------------------------------
-- node_display_commands
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS node_display_commands (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     VARCHAR(100) NOT NULL,
  command       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at  TIMESTAMPTZ,
  displayed_at  TIMESTAMPTZ
);

-- Drain query: oldest undelivered first per device.
CREATE INDEX IF NOT EXISTS idx_node_display_commands_undelivered
  ON node_display_commands (device_id, created_at)
  WHERE delivered_at IS NULL;
