'use strict';

/**
 * assistantService.js — AI assistant for the business dashboard.
 *
 * Gathers the business's own analytics data and asks Claude for personalised,
 * actionable advice. The Anthropic API key lives server-side only
 * (ANTHROPIC_API_KEY) — it is never exposed to the frontend.
 */

const Anthropic = require('@anthropic-ai/sdk');
const pool      = require('../db/pool');
const analytics = require('./analyticsService');

const MODEL      = 'claude-opus-4-7';
const MAX_TOKENS = 2048;

// Lazily construct the client so the app still boots without a key configured.
let _client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return _client;
}

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ---------------------------------------------------------------------------
// Context gathering — the business's real numbers
// ---------------------------------------------------------------------------

/**
 * Collects a compact snapshot of the business's performance. Demographics,
 * zone performance, and dwell time are Pro-only — withheld for lower tiers so
 * the assistant's advice stays consistent with the dashboard paywall.
 */
async function gatherContext(businessId, tier) {
  const isPro = tier === 'pro';

  const bizQuery = pool.query(
    'SELECT name, category FROM businesses WHERE id = $1',
    [businessId]
  );

  const offersQuery = pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE is_active = true)              AS active_offers,
       COUNT(*) FILTER (WHERE is_active = false)             AS inactive_offers,
       COALESCE(SUM(current_redemptions), 0)                 AS total_redemptions,
       (SELECT COUNT(*) FROM coupons c JOIN offers o ON o.id = c.offer_id
         WHERE o.business_id = $1 AND c.status = 'redeemed'
           AND c.redeemed_at >= NOW() - INTERVAL '7 days')   AS redemptions_this_week
     FROM offers WHERE business_id = $1`,
    [businessId]
  );

  const topOfferQuery = pool.query(
    `SELECT title, current_redemptions, is_active
     FROM offers WHERE business_id = $1
     ORDER BY current_redemptions DESC LIMIT 1`,
    [businessId]
  );

  const [bizRes, offersRes, topOfferRes, dashboard] = await Promise.all([
    bizQuery,
    offersQuery,
    topOfferQuery,
    analytics.getDashboard(businessId).catch(() => null),
  ]);

  const biz = bizRes.rows[0] || {};
  const o   = offersRes.rows[0] || {};
  const summary = dashboard?.summary || {};
  const peak    = (dashboard?.peak_hours || [])[0] || null;

  const ctx = {
    business: { name: biz.name || 'your business', category: biz.category || 'business' },
    subscription_tier: tier,
    footfall: dashboard ? {
      total_visitors:   parseInt(summary.total_entries, 10) || 0,
      avg_occupancy:    parseFloat(summary.avg_occupancy) || 0,
      peak_occupancy:   parseInt(summary.peak_occupancy, 10) || 0,
      conversion_rate:  parseFloat(summary.conversion_rate) || 0,
      days_tracked:     parseInt(summary.days_tracked, 10) || 0,
      busiest_hour:     peak ? { hour: peak.hour, visitors: peak.total_entries } : null,
    } : null,
    offers: {
      active_offers:         parseInt(o.active_offers, 10) || 0,
      inactive_offers:       parseInt(o.inactive_offers, 10) || 0,
      total_redemptions:     parseInt(o.total_redemptions, 10) || 0,
      redemptions_this_week: parseInt(o.redemptions_this_week, 10) || 0,
      top_offer:             topOfferRes.rows[0] || null,
    },
  };

  // Pro-only enrichments.
  if (isPro && dashboard) {
    ctx.footfall.avg_dwell_seconds = parseFloat(summary.avg_dwell_seconds) || 0;
    ctx.demographics = dashboard.demographics || null;
    ctx.zones = (dashboard.zones || []).map(z => ({
      name: z.zone_name, visitors: z.entries, avg_occupancy: z.avg_occupancy,
    }));
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// Suggested questions — page-aware and data-aware (no LLM call needed)
// ---------------------------------------------------------------------------

const fmt = (n) => Number(n || 0).toLocaleString();

/**
 * Returns 3 starter questions tailored to the page the user is on and their
 * actual numbers. Templated deterministically — fast and free.
 */
function buildSuggestions(ctx, page) {
  const f = ctx.footfall;
  const o = ctx.offers;
  const cat = ctx.business.category;
  const top = o.top_offer;

  switch (page) {
    case 'analytics':
      return [
        f?.busiest_hour
          ? `My busiest hour is ${f.busiest_hour.hour}:00 — how should I staff and promote around it?`
          : 'When are my busiest hours, and what should I do about them?',
        f && f.conversion_rate > 0
          ? `My conversion rate is ${f.conversion_rate}% — is that healthy for a ${cat}, and how do I improve it?`
          : `What conversion rate should a ${cat} like mine aim for?`,
        f && f.days_tracked > 0
          ? `What story do my last ${f.days_tracked} days of footfall tell?`
          : 'What should I look for in my footfall trends?',
      ];

    case 'offers':
    case 'smart-specials':
      return [
        `What kind of offer should I run next for my ${cat}?`,
        top
          ? `"${top.title}" is my top offer (${fmt(top.current_redemptions)} redemptions) — how do I make the next one perform as well?`
          : 'How do I design an offer that actually gets redeemed?',
        'What discount level gives the best return without hurting my margin?',
      ];

    case 'sensors':
      return [
        'What can footfall sensors tell me that I can act on?',
        'How do I know my sensors are capturing data correctly?',
        'How should I use occupancy data day-to-day?',
      ];

    case 'dashboard':
    default:
      return [
        o.redemptions_this_week > 0
          ? `I had ${fmt(o.redemptions_this_week)} redemptions this week — how can I increase that?`
          : 'I had no redemptions this week — what should I change?',
        f && f.total_visitors > 0
          ? `${fmt(f.total_visitors)} people visited recently — how do I turn more of them into customers?`
          : `What are the top ways to grow footfall for a ${cat}?`,
        'What should I focus on this week to grow my business?',
      ];
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

// Stable across every request and every business — good cache prefix.
const SYSTEM_INSTRUCTIONS = [
  'You are the Dander Assistant, a friendly and sharp advisor built into the',
  'Dander platform — a footfall-analytics service for physical retail and',
  'hospitality businesses. You help business owners understand their numbers',
  'and decide what to do next.',
  '',
  'Guidelines:',
  '- Be concise and practical. Lead with the answer, then a short reason.',
  '- Ground every claim in the business data provided. Quote their real',
  '  numbers when relevant. Never invent figures.',
  '- If the data needed to answer is not present, say so plainly and suggest',
  '  what they could track instead — do not guess.',
  '- Give specific, actionable advice suited to their business category.',
  '- Use plain language. Short paragraphs or tight bullet lists. No jargon.',
  '- Keep replies focused — usually under 200 words unless asked for depth.',
  '- You only advise on this business; you cannot change settings or data.',
].join('\n');

function buildDataContext(ctx, page) {
  return [
    `The business owner is currently on the "${page || 'dashboard'}" page.`,
    '',
    "Here is the business's current data (JSON):",
    JSON.stringify(ctx, null, 2),
    '',
    'Pro-only metrics (demographics, zone performance, dwell time) are absent',
    'for businesses not on the Pro plan — if a question needs them and they',
    'are missing, mention that upgrading to Pro would unlock that insight.',
  ].join('\n');
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const cleaned = [];
  for (const m of messages.slice(-20)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    if (!content) continue;
    cleaned.push({ role: m.role, content: content.slice(0, 4000) });
  }
  // The conversation must start with a user turn.
  while (cleaned.length && cleaned[0].role !== 'user') cleaned.shift();
  return cleaned;
}

/**
 * Runs one assistant turn. `messages` is the full conversation so far
 * ([{role, content}], ending with the new user message).
 * Returns { reply } or throws.
 */
async function chat({ businessId, tier, messages, page }) {
  const client = getClient();
  if (!client) {
    const err = new Error('Assistant is not configured.');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }

  const cleanMessages = sanitizeMessages(messages);
  if (cleanMessages.length === 0) {
    const err = new Error('No message to respond to.');
    err.code = 'EMPTY';
    throw err;
  }

  const ctx = await gatherContext(businessId, tier);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' }, // balances answer quality vs. chat latency
    system: [
      { type: 'text', text: SYSTEM_INSTRUCTIONS },
      {
        type: 'text',
        text: buildDataContext(ctx, page),
        cache_control: { type: 'ephemeral' }, // reused across turns of one chat
      },
    ],
    messages: cleanMessages,
  });

  const reply = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

  return { reply: reply || "Sorry, I couldn't come up with a response. Please try rephrasing." };
}

module.exports = { isConfigured, gatherContext, buildSuggestions, chat };
