'use strict';

/**
 * loyaltyGreeting.js — choose a Giphy search term via Claude, fetch a
 * GIF from Giphy, and assemble the display command payload.
 *
 * Degrades gracefully on every external dependency:
 *   - No ANTHROPIC_API_KEY  → fall back to a hand-tuned term per trigger
 *   - No GIPHY_API_KEY      → return gif_url = null; the Node renders the
 *                             text-only path
 *   - Claude / Giphy timeout → same fallbacks
 *
 * Never throws — proximity detection is on the user-app hot path and a
 * single failed external call shouldn't lose a visit log entry.
 */

const Anthropic = require('@anthropic-ai/sdk');

// Cheapest / fastest current Haiku; suitable for a 2-3 word pick.
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const GIPHY_BASE  = 'https://api.giphy.com/v1/gifs/search';

// Stock search terms when Claude isn't available. Keep them short and PG.
const FALLBACK_TERMS = {
  first_visit:             'welcome happy',
  regular:                 'happy wave',
  long_absence:            'long time no see',
  milestone_10:            'celebration confetti',
  milestone_50:            'fireworks party',
  milestone_100:           'epic celebration',
  birthday:                'birthday cake',
  already_visited_today:   'wink hello again',
};

// Default per-trigger message text used when the business hasn't
// configured a custom one. {name} / {visits} / {points} are substituted
// at the call site.
const DEFAULT_MESSAGES = {
  first_visit:             "Welcome to {business}, {name}! Here's {points} points to get you started.",
  regular:                 "Good to see you again, {name}. +{points} loyalty points.",
  long_absence:            "Welcome back, {name} — it's been a while! +{points} points.",
  milestone_10:            "10 visits, {name}! Have +{points} points on us.",
  milestone_50:            "Fifty visits, {name} — you're a legend. +{points} points.",
  milestone_100:           "One hundred visits, {name}. We had to dust off the confetti. +{points} points.",
  birthday:                "Happy birthday, {name}! +{points} points and our best wishes.",
  already_visited_today:   "Back already, {name}? Great to see you again.",
};

function substitute(template, vars) {
  if (!template) return '';
  return String(template).replace(/\{(\w+)\}/g, (_m, key) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

function partOfDay(d = new Date()) {
  const h = d.getUTCHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

/**
 * Ask Claude (Haiku) to pick a 2-3 word Giphy search term given the
 * context. Returns a string or null on any failure.
 */
async function pickSearchTerm(ctx) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const prompt =
      `Pick a Giphy search term for this moment:\n` +
      `Customer: ${ctx.first_name || 'a customer'}\n` +
      `Visit number: ${ctx.visit_number || 1}\n` +
      `Greeting type: ${ctx.greeting_type}\n` +
      `Business type: ${ctx.business_category || 'shop'}\n` +
      `Time of day: ${ctx.part_of_day}\n` +
      `Tone: ${ctx.tone || 'friendly'}\n` +
      `Last visit: ${ctx.last_visit_text || 'first time'}\n\n` +
      `Return ONLY a 2-3 word Giphy search term, nothing else.\n` +
      `Examples: "surprised happy", "welcome back excited", ` +
      `"celebration fireworks", "long time no see".\n` +
      `Make it fun and appropriate for the tone.`;

    const res = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 32,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = res?.content?.[0]?.text || '';
    const term = raw.trim().replace(/^["']|["']$/g, '').replace(/\.$/, '');
    if (!term || term.length > 60) return null;
    return term;
  } catch (err) {
    console.warn('[loyalty/claude] pickSearchTerm failed:', err.message);
    return null;
  }
}

/**
 * Call Giphy search and return a randomly-chosen URL from the top N hits.
 * Returns null if no key, no hits, or any network failure.
 */
async function fetchGifUrl(searchTerm, apiKey) {
  const key = apiKey || process.env.GIPHY_API_KEY;
  if (!key || !searchTerm) return null;

  const url = `${GIPHY_BASE}?api_key=${encodeURIComponent(key)}` +
              `&q=${encodeURIComponent(searchTerm)}&limit=10&rating=pg`;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    let json;
    try {
      const r = await fetch(url, { signal: controller.signal });
      if (!r.ok) return null;
      json = await r.json();
    } finally { clearTimeout(t); }

    const data = Array.isArray(json?.data) ? json.data : [];
    if (data.length === 0) return null;
    const pick = data[Math.floor(Math.random() * Math.min(data.length, 10))];
    // Prefer the smaller "downsized_medium" image for kiosk display so
    // the Node phone isn't downloading 30MB of confetti every visit.
    return pick?.images?.downsized_medium?.url
        || pick?.images?.original?.url
        || pick?.url
        || null;
  } catch (err) {
    console.warn('[loyalty/giphy] fetchGifUrl failed:', err.message);
    return null;
  }
}

/**
 * Pick a message template — random active row from business_messages
 * for this (business, trigger), or the static default for the trigger.
 */
async function pickMessageTemplate(pool, businessId, trigger) {
  try {
    const { rows } = await pool.query(
      `SELECT message FROM business_messages
        WHERE business_id = $1 AND trigger = $2 AND is_active = TRUE`,
      [businessId, trigger]
    );
    if (rows.length > 0) {
      return rows[Math.floor(Math.random() * rows.length)].message;
    }
  } catch (err) {
    console.warn('[loyalty] pickMessageTemplate failed:', err.message);
  }
  return DEFAULT_MESSAGES[trigger] || DEFAULT_MESSAGES.regular;
}

/**
 * Build the loyalty_greeting display command payload.
 *
 * @param {object} ctx  see fields below
 * @returns {object}    full command object ready to JSONB-store and
 *                      piggy-back to the Node via the webhook response.
 */
async function buildGreetingCommand(pool, ctx) {
  const part_of_day = partOfDay();

  // 1. Pick the Giphy search term (Claude → fallback).
  const claudeTerm = await pickSearchTerm({
    first_name: ctx.first_name,
    visit_number: ctx.visit_number,
    greeting_type: ctx.greeting_type,
    business_category: ctx.business_category,
    part_of_day,
    tone: ctx.tone,
    last_visit_text: ctx.last_visit_text,
  });
  const searchTerm = claudeTerm || FALLBACK_TERMS[ctx.greeting_type] || FALLBACK_TERMS.regular;

  // 2. Resolve the GIF URL (Giphy → null on failure).
  const gifUrl = await fetchGifUrl(searchTerm, ctx.giphy_api_key);

  // 3. Resolve the message template (business_messages → default).
  const template = await pickMessageTemplate(pool, ctx.business_id, ctx.greeting_type);
  const message = substitute(template, {
    name: ctx.first_name || 'friend',
    business: ctx.business_name || '',
    visits: ctx.visit_number || 0,
    points: ctx.points_awarded || 0,
    last_visit: ctx.last_visit_text || '',
  });

  return {
    type: 'loyalty_greeting',
    gif_url: gifUrl,
    search_term: searchTerm,        // dashboard debug surface
    customer_name: ctx.first_name || 'friend',
    message,
    points_awarded: ctx.points_awarded || 0,
    total_points: ctx.total_points || 0,
    visit_number: ctx.visit_number || 0,
    greeting_type: ctx.greeting_type,
    display_duration: 8000,
  };
}

module.exports = {
  buildGreetingCommand,
  pickSearchTerm,
  fetchGifUrl,
  pickMessageTemplate,
  // exposed for tests / debug surfaces
  DEFAULT_MESSAGES,
  FALLBACK_TERMS,
};
