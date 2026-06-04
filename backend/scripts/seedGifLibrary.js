#!/usr/bin/env node
'use strict';

/**
 * seedGifLibrary.js — populate business_gif_library with global
 * defaults (business_id = NULL).
 *
 *   node backend/scripts/seedGifLibrary.js
 *
 * Idempotent — skips trigger/search-term pairs that already have a
 * row. Hard-requires GIPHY_API_KEY in the environment; bails with a
 * clear error otherwise.
 */

require('dotenv').config();
const { Pool } = require('pg');

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs/search';

const SEEDS = {
  regular: [
    'welcome back excited', 'hello friend wave', 'good to see you',
    'youre back finally', 'welcome return happy', 'hi there wave',
    'good morning hello', 'hey welcome', 'so good see you', 'welcome friend',
  ],
  first_visit: [
    'welcome new excited', 'first time welcome', 'hello new friend',
    'nice to meet you', 'welcome aboard excited',
  ],
  milestone_10: [
    'ten achievement celebration', 'milestone reached congrats', 'level up celebration',
  ],
  milestone_50: [
    'legendary achievement amazing', 'fifty milestone incredible', 'epic win celebration',
  ],
  milestone_100: [
    '100 celebration legendary', 'century achievement epic', 'incredible milestone hundred',
  ],
  long_absence: [
    'finally you returned', 'where have you been', 'long time no see',
    'youre back at last', 'finally back welcome',
  ],
  birthday: [
    'happy birthday celebration', 'birthday party excited', 'birthday surprise yay',
    'happy birthday dance', 'birthday cake celebration',
  ],
  already_visited_today: [
    'hello again wave', 'back so soon', 'twice in one day',
  ],
  stranger: [
    'welcome new visitor', 'hello stranger wave', 'come on in welcome',
    'new customer excited', 'welcome discover', 'hello there wave',
    'come visit us', 'welcome explore',
  ],
};

async function fetchTopGif(term, key) {
  const url = `${GIPHY_BASE}?api_key=${encodeURIComponent(key)}` +
              `&q=${encodeURIComponent(term)}&limit=1&rating=pg`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Giphy ${r.status} for "${term}"`);
  const json = await r.json();
  const hit = (json.data || [])[0];
  if (!hit) return null;
  return {
    gif_id: hit.id,
    gif_url: hit.images?.downsized_medium?.url || hit.images?.original?.url || hit.url,
  };
}

(async () => {
  const key = process.env.GIPHY_API_KEY;
  if (!key) {
    console.error('GIPHY_API_KEY is not set — abort.');
    process.exit(2);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let inserted = 0, skipped = 0, failed = 0;

  try {
    for (const [trigger, terms] of Object.entries(SEEDS)) {
      for (const term of terms) {
        try {
          // Skip if any global gif already exists with this term (we use
          // gif_id == search-term-derived for idempotency via a comment).
          const exists = await pool.query(
            `SELECT 1 FROM business_gif_library
              WHERE business_id IS NULL AND trigger_type = $1 AND gif_id = $2 LIMIT 1`,
            [trigger, term]
          );
          if (exists.rows.length > 0) { skipped++; continue; }

          const gif = await fetchTopGif(term, key);
          if (!gif) { failed++; continue; }

          await pool.query(
            `INSERT INTO business_gif_library
               (business_id, gif_url, gif_id, trigger_type, is_active)
             VALUES (NULL, $1, $2, $3, TRUE)`,
            [gif.gif_url, gif.gif_id, trigger]
          );
          inserted++;
          console.log(`  + ${trigger}: "${term}" → ${gif.gif_id}`);
        } catch (err) {
          failed++;
          console.warn(`  ! ${trigger}: "${term}" — ${err.message}`);
        }
        // Light pacing to avoid Giphy rate limits.
        await new Promise((r) => setTimeout(r, 120));
      }
    }
    console.log(`\nDone. inserted=${inserted} skipped=${skipped} failed=${failed}`);
  } finally {
    await pool.end();
  }
})();
