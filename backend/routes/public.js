'use strict';

/**
 * public.js — endpoints that intentionally have no auth, used during
 * device / app onboarding where the caller has no credentials yet.
 *
 *   GET /api/public/business/code/:code
 *     4-digit business code -> { business_id, business_name }.
 *     Rate-limited per-IP to keep code space (~9000 values) from being
 *     brute-forced.
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');
const { pickSearchTerm, fetchGifUrl } = require('../services/loyaltyGreeting');
const nodeWs = require('../ws/nodes');

const router = Router();

// 30 lookups per 5 minutes per IP is plenty for legitimate setup flows
// and well below what's needed to enumerate the code space.
const codeLookupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max:      30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, code: 'RATE_LIMITED', message: 'Too many code lookups. Please wait a few minutes.' },
});

router.get('/business/code/:code', codeLookupLimiter, async (req, res) => {
  const raw = req.params.code || '';
  if (!/^\d{4}$/.test(raw)) {
    return res.status(400).json({ success: false, code: 'INVALID_CODE', message: 'Code must be 4 digits.' });
  }
  try {
    const { rows } = await pool.query(
      'SELECT id, name FROM businesses WHERE business_code = $1 LIMIT 1',
      [raw]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No business found for that code.' });
    }
    return res.json({
      success: true,
      business_id:   rows[0].id,
      business_name: rows[0].name,
    });
  } catch (err) {
    console.error('[public/business/code]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Lookup failed.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/public/business/:id/stranger-display
//
// What the Dander Node should render when there's no matched user. The
// Node polls this every ~5 min while idle. No auth — the response is
// already public-facing content (business name + today's offer + app
// download CTA).
// ---------------------------------------------------------------------------

router.get('/business/:id/stranger-display', async (req, res) => {
  const businessId = parseInt(req.params.id, 10);
  if (!Number.isFinite(businessId)) {
    return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'business id must be numeric.' });
  }
  try {
    const { rows: bizRows } = await pool.query(
      'SELECT id, name FROM businesses WHERE id = $1 LIMIT 1',
      [businessId]
    );
    if (bizRows.length === 0) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Business not found.' });
    }
    const business = bizRows[0];

    // Most recent active offer if any. Limit columns to what a kiosk
    // display needs — title + short description + headline price.
    const { rows: offerRows } = await pool.query(
      `SELECT id, title, description, offer_type, original_price, offer_price, discount_percent
         FROM offers
        WHERE business_id = $1 AND is_active = TRUE
        ORDER BY created_at DESC
        LIMIT 1`,
      [businessId]
    );
    const offer = offerRows[0] || null;

    // Today's visitor count — entrance nodes only. Till / display /
    // general zones aren't customer entries and would inflate the
    // headline number on the kiosk. UTC day boundary as elsewhere.
    const { rows: countRows } = await pool.query(
      `SELECT COALESCE(SUM(count_in), 0)::int AS visitors
         FROM phone_counter_readings
        WHERE business_id = $1
          AND zone_type = 'entrance'
          AND (timestamp AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date`,
      [businessId]
    );
    const visitorCountToday = countRows[0]?.visitors ?? 0;

    return res.status(200).json({
      success: true,
      business_name: business.name,
      todays_offer: offer,
      app_download_url: 'https://dander.io',
      visitor_count_today: visitorCountToday,
      custom_message: 'Scan to get loyalty points',
    });
  } catch (err) {
    console.error('[public/stranger-display]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load stranger display.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/public/stranger-milestone
//
// Called by a Dander Node when its visitor count crosses a 100-multiple
// during open hours. We ask Claude for a celebratory Giphy search term,
// fetch a PG GIF, and return both alongside a hand-tuned message keyed
// off the milestone number.
//
// Public because the Node has no JWT yet during this PoC. The milestone
// only fires from the kiosk's own state machine, so the failure mode of
// a curl spam is just wasted Claude+Giphy calls — rate-limit to be safe.
// ---------------------------------------------------------------------------

const milestoneLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, code: 'RATE_LIMITED', message: 'Slow down.' },
});

const MILESTONE_MESSAGES = {
  100:  "You're our 100th visitor today!",
  200:  "200 visitors today — you made it!",
  300:  "300 visitors — what a day!",
  500:  "HALFWAY TO 1000! 🚀",
  1000: "1000 VISITORS!! LEGENDARY!! 🏆",
};

function messageFor(milestone) {
  return MILESTONE_MESSAGES[milestone] || `You're visitor #${milestone} today!`;
}

router.post('/stranger-milestone', milestoneLimiter, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const milestone = parseInt(body.milestone, 10);
  const businessId = parseInt(body.business_id, 10);
  if (!Number.isFinite(milestone) || milestone <= 0) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'milestone must be a positive integer.' });
  }

  let category = 'shop';
  if (Number.isFinite(businessId)) {
    try {
      const { rows } = await pool.query('SELECT category FROM businesses WHERE id = $1', [businessId]);
      if (rows.length > 0 && rows[0].category) category = rows[0].category;
    } catch (err) {
      // Don't block on category lookup — fall through with the default.
      console.warn('[public/stranger-milestone] category lookup failed:', err.message);
    }
  }

  // Claude → Giphy. Both degrade to null on failure; the Node already
  // renders text-only in that case so the celebration still happens.
  const searchTerm =
    (await pickSearchTerm({
      first_name: 'a customer',
      visit_number: milestone,
      greeting_type: 'milestone_visitor',
      business_category: category,
      part_of_day: 'today',
      tone: 'celebratory',
      last_visit_text: '',
    })) || 'celebration confetti';

  const gifUrl = await fetchGifUrl(searchTerm, null);

  return res.status(200).json({
    success: true,
    gif_url: gifUrl,
    message: messageFor(milestone),
    search_term: searchTerm,
    milestone,
  });
});

// ---------------------------------------------------------------------------
// GET /api/public/tap
//
// The URL embedded in the Dander Node's NFC NDEF message. When the
// Dander user app captures it via App Links, the app calls
// POST /api/proximity/nfc-checkin directly — this endpoint is the
// fallback for users who don't have the app: it redirects to the
// stranger join page AND fires a stranger display command at the kiosk
// so the customer feels recognised even on first contact.
// ---------------------------------------------------------------------------

router.get('/tap', async (req, res) => {
  const nodeDeviceId = typeof req.query.node === 'string' ? req.query.node.slice(0, 100) : null;
  const businessId   = parseInt(req.query.business, 10);

  if (!nodeDeviceId || !Number.isFinite(businessId)) {
    return res.redirect('https://dander.io');
  }

  // Fire the stranger display command — best-effort, never blocks redirect.
  fireStrangerDisplay({ nodeDeviceId, businessId }).catch(() => {});

  // Redirect to the stranger landing page (served at /join below).
  return res.redirect(`/join?business=${encodeURIComponent(businessId)}&node=${encodeURIComponent(nodeDeviceId)}`);
});

// ---------------------------------------------------------------------------
// POST /api/public/nfc-stranger
// ---------------------------------------------------------------------------

router.post('/nfc-stranger', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const nodeDeviceId = typeof body.node_device_id === 'string' ? body.node_device_id.slice(0, 100) : null;
  const businessId   = parseInt(body.business_id, 10);
  if (!nodeDeviceId || !Number.isFinite(businessId)) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR' });
  }
  await fireStrangerDisplay({ nodeDeviceId, businessId });
  return res.status(200).json({
    success: true,
    join_url: `https://dander.io/join?business=${encodeURIComponent(businessId)}&node=${encodeURIComponent(nodeDeviceId)}`,
  });
});

const STRANGER_TAGLINES = [
  "Someone new just discovered us! 👋",
  "New friend alert! 🎉",
  "Welcome — first time? 🌟",
];

async function fireStrangerDisplay({ nodeDeviceId, businessId }) {
  try {
    const { rows: bizRows } = await pool.query('SELECT name, category FROM businesses WHERE id = $1', [businessId]);
    const business = bizRows[0] || { name: 'us', category: 'shop' };
    const term = (await pickSearchTerm({
      first_name: 'a new customer', visit_number: 1, greeting_type: 'first_visit',
      business_category: business.category, part_of_day: 'today', tone: 'cheeky', last_visit_text: 'first time',
    })) || 'excited welcome';
    const gifUrl = await fetchGifUrl(term, null);
    const message = STRANGER_TAGLINES[Math.floor(Math.random() * STRANGER_TAGLINES.length)]
                      .replace('us', business.name);

    const command = {
      type: 'stranger_tap',
      gif_url: gifUrl,
      customer_name: '👋 NEW VISITOR',
      message,
      points_awarded: 0,
      visit_number: 0,
      display_duration: 8_000,
      search_term: term,
    };

    const pushed = nodeWs.pushDisplayCommand(nodeDeviceId, command);
    if (pushed) {
      await pool.query(
        `INSERT INTO node_display_commands (device_id, command, delivered_at)
         VALUES ($1, $2::jsonb, NOW())`,
        [nodeDeviceId, JSON.stringify(command)]
      );
    } else {
      await pool.query(
        `INSERT INTO node_display_commands (device_id, command) VALUES ($1, $2::jsonb)`,
        [nodeDeviceId, JSON.stringify(command)]
      );
    }
  } catch (err) {
    console.warn('[public/fireStrangerDisplay]', err.message);
  }
}

// ---------------------------------------------------------------------------
// GET /join   — stranger landing page (no auth)
// ---------------------------------------------------------------------------

router.get('/join', async (req, res) => {
  const businessId = parseInt(req.query.business, 10);
  let business = null, offer = null, visitorCount = 0;
  if (Number.isFinite(businessId)) {
    try {
      const bizRows = await pool.query('SELECT id, name, logo_url, category FROM businesses WHERE id = $1', [businessId]);
      business = bizRows.rows[0] || null;
      const offerRows = await pool.query(
        `SELECT title, description, discount_percent FROM offers
          WHERE business_id = $1 AND is_active = TRUE
          ORDER BY created_at DESC LIMIT 1`,
        [businessId]
      );
      offer = offerRows.rows[0] || null;
      const countRows = await pool.query(
        `SELECT COALESCE(SUM(count_in), 0)::int AS visitors
           FROM phone_counter_readings
          WHERE business_id = $1 AND zone_type = 'entrance'
            AND (timestamp AT TIME ZONE 'UTC')::date = (NOW() AT TIME ZONE 'UTC')::date`,
        [businessId]
      );
      visitorCount = countRows.rows[0]?.visitors ?? 0;
    } catch (err) {
      console.warn('[public/join]', err.message);
    }
  }

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(renderJoinHtml({ business, offer, visitorCount }));
});

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderJoinHtml({ business, offer, visitorCount }) {
  const bizName = esc(business?.name || 'Dander');
  const offerHtml = offer
    ? `<div class="offer">
         <div class="offer-label">Today's offer</div>
         <div class="offer-title">${esc(offer.title)}</div>
         ${offer.description ? `<div class="offer-desc">${esc(offer.description)}</div>` : ''}
       </div>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Join Dander — ${bizName}</title>
<style>
  :root { color-scheme: dark; }
  *{box-sizing:border-box}
  body{margin:0;font:16px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;
       background:#0f1115;color:#fff;padding:24px;max-width:540px;margin:auto}
  h1{font-size:28px;margin:0 0 6px;line-height:1.15}
  .biz{color:#FF6B35;font-weight:700}
  .stats{display:flex;gap:16px;margin:20px 0;color:#bbb;font-size:14px}
  .stats b{color:#fff;font-size:20px;display:block}
  .perks{margin:24px 0;list-style:none;padding:0}
  .perks li{padding:10px 0;border-bottom:1px solid #1f2530;font-size:15px}
  .offer{background:#1a1f29;border-radius:12px;padding:16px;margin:24px 0}
  .offer-label{font-size:11px;letter-spacing:.16em;color:#9aa4b1;text-transform:uppercase}
  .offer-title{font-size:20px;font-weight:700;margin-top:4px}
  .offer-desc{font-size:14px;color:#cfd6df;margin-top:6px}
  .cta{display:flex;flex-direction:column;gap:10px;margin:28px 0}
  .cta a{display:block;text-align:center;padding:14px;border-radius:10px;font-weight:700;text-decoration:none}
  .cta .android{background:#FF6B35;color:#fff}
  .cta .ios{background:#fff;color:#0f1115}
  .already{font-size:13px;color:#9aa4b1;text-align:center;margin-top:8px}
</style>
</head>
<body>
  <h1>You just tapped into <span class="biz">${bizName}</span>! 👋</h1>
  <div class="stats">
    <div><b>${visitorCount}</b>visitors today</div>
  </div>
  <ul class="perks">
    <li>✨ Greeted by name on arrival</li>
    <li>🎮 Loyalty points every visit</li>
    <li>🏆 Rewards from free coffee to free meal</li>
    <li>📱 Exclusive offers</li>
  </ul>
  ${offerHtml}
  <div class="cta">
    <a class="android" href="https://play.google.com/store/apps/details?id=io.dander.app">Get Dander — Android</a>
    <a class="ios"     href="https://apps.apple.com/app/dander">Get Dander — iOS</a>
    <div class="already">Already have Dander? Open the app and tap again.</div>
  </div>
</body></html>`;
}

module.exports = router;
