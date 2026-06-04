'use strict';

/**
 * loyaltyGreeting.js — assemble the display command payload by picking
 * a GIF from business_gif_library (per-business + global defaults) and
 * substituting the message template.
 *
 * Pre-migration-046 this called Claude to pick a Giphy search term then
 * hit Giphy's search endpoint, costing 2-4s of latency. The library
 * lookup below is ~50ms because the URL is already pre-resolved and
 * stored. Claude is retained ONLY for custom-tone message generation
 * (tone === 'custom') — every other tone uses the static templates.
 *
 * Never throws — a check-in must always log a visit even if the GIF
 * lookup somehow fails. Caller treats gif_url=null as text-only mode.
 */

const Anthropic = require('@anthropic-ai/sdk');

// Cheapest / fastest current Haiku; used only for tone='custom' message generation.
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

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
 * Pick a GIF URL for (businessId, triggerType) from business_gif_library.
 *
 * Order:
 *   1. Random active row WHERE business_id = $1 AND trigger_type = $2
 *   2. If empty, random active row WHERE business_id IS NULL (globals)
 *   3. If still empty, null → caller renders text-only
 */
async function pickGifUrl(pool, businessId, triggerType) {
  try {
    const { rows: own } = await pool.query(
      `SELECT gif_url FROM business_gif_library
        WHERE business_id = $1 AND trigger_type = $2 AND is_active = TRUE`,
      [businessId, triggerType]
    );
    if (own.length > 0) return own[Math.floor(Math.random() * own.length)].gif_url;

    const { rows: globals } = await pool.query(
      `SELECT gif_url FROM business_gif_library
        WHERE business_id IS NULL AND trigger_type = $1 AND is_active = TRUE`,
      [triggerType]
    );
    if (globals.length > 0) return globals[Math.floor(Math.random() * globals.length)].gif_url;
    return null;
  } catch (err) {
    console.warn('[loyalty/pickGifUrl]', err.message);
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
  // 1. GIF — DB lookup. ~50ms vs the ~2-4s Claude+Giphy round trip we
  //    used to do here.
  const gifUrl = await pickGifUrl(pool, ctx.business_id, ctx.greeting_type);

  // 2. Resolve the message template (business_messages → default).
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
  pickGifUrl,
  pickMessageTemplate,
  // exposed for tests / debug surfaces
  DEFAULT_MESSAGES,
};
