-- 046_gif_library_display_preference.sql
-- GIF library (per-business + global defaults) and user display
-- preference (personalised vs anonymous).
--
-- The library lets businesses curate the GIFs shown at their kiosk
-- without round-tripping Claude+Giphy on every check-in; the cache
-- endpoint downstream serves these to Dander Nodes for local storage,
-- so a real-world greeting is sub-100ms instead of 2-4 seconds.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- business_gif_library
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS business_gif_library (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = global default. Cascade on delete handles tenant removal.
  business_id   INTEGER REFERENCES businesses(id) ON DELETE CASCADE,
  gif_url       TEXT NOT NULL,
  gif_id        VARCHAR(100) NOT NULL,
  trigger_type  VARCHAR(50) NOT NULL
                  CHECK (trigger_type IN (
                    'regular','first_visit','milestone_10','milestone_50',
                    'milestone_100','long_absence','birthday',
                    'already_visited_today','stranger'
                  )),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  added_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bgl_lookup
  ON business_gif_library (business_id, trigger_type, is_active);
CREATE INDEX IF NOT EXISTS idx_bgl_global
  ON business_gif_library (trigger_type, is_active)
  WHERE business_id IS NULL;

-- ---------------------------------------------------------------------
-- users.display_preference + birthday_sharing
-- ---------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_preference VARCHAR(20) NOT NULL DEFAULT 'personalised',
  ADD COLUMN IF NOT EXISTS display_preference_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS birthday_sharing BOOLEAN NOT NULL DEFAULT TRUE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_display_preference_check') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_display_preference_check
      CHECK (display_preference IN ('personalised','anonymous'));
  END IF;
END $$;
