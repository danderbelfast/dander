# Offer Attribution — Plan 1: Activation Foundation (backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the deterministic **activate** intent event — `offer_activations` table + activate/deactivate/My-Offers API + a focused service — so the per-offer/per-channel attribution funnel has its foundation.

**Architecture:** Mirror the existing **ad** attribution chain (`ad_clicks` + `adAttribution.js`). A new `offer_activations` table holds one row per (offer, identity) with a status lifecycle; a new `services/offerActivation.js` owns the logic; activate/list routes live in `backend/routes/offers.js` (before `/:id` to avoid the param collision, like `/saved`). Conversion transitions (`markEntryConversion`/`markSaleConversion`) are defined here but wired into check-in/till in Plan 3.

**Tech Stack:** Node/Express + pg; `node --test` for pure helpers (the repo has no route/DB test harness — routes are verified by curl, per existing convention).

**Spec:** `docs/superpowers/specs/2026-06-23-offer-attribution-design.md`
**Branch:** worktree off `pre-staging`. **GDPR:** `offer_activations.anon_id` is a device identifier — privacy-flagged; erasure/retention must cover it (tracked with the GDPR pass, see spec).

---

## Decomposition (this is Plan 1 of 5)

1. **Foundation (this plan)** — table + activate/deactivate/My-Offers API + service (incl. conversion-transition + stitch functions, unwired).
2. **Web Activate UI** — My Offers surface + Activate buttons (web), channel capture, anon + resume-after-auth + `anon_id→user_id` stitch on login.
3. **Attribution hooks** — wire `markEntryConversion` into `nfc-checkin` and `markSaleConversion` into `till/award-points`; TillPanel shows the customer's activated offers + staff "applied offer" tag.
4. **App Activate UI** — My Offers + Activate in the native app.
5. **Dashboard** — per-offer/per-channel funnel (activations → visits → sales).

`?src=` sticker-URL param is coordinated in Plan 2/3 with node/sticker programming.

---

## File Structure (Plan 1)

- **Create:** `backend/db/migrations/061_offer_activations.sql` — the table.
- **Create:** `backend/utils/offerChannel.js` (+ `.test.js`) — pure channel validation (the unit-testable core).
- **Create:** `backend/services/offerActivation.js` — activate / deactivate / listMyOffers / markEntryConversion / markSaleConversion / stitchAnonToUser.
- **Modify:** `backend/routes/offers.js` — add `GET /activated` (before `/:id`), `POST /:id/activate`, `DELETE /:id/activate`.

---

## Task 1: Migration — `offer_activations`

**Files:**
- Create: `backend/db/migrations/061_offer_activations.sql`

- [ ] **Step 1: Write the migration**

Create `backend/db/migrations/061_offer_activations.sql`:
```sql
-- ============================================================
--  offer_activations — the offer attribution funnel.
--
--  One row per (offer, identity). "activate" is the deterministic
--  intent event (channel-stamped). Status cycles:
--    'activated' -> 'entry_conversion' (on check-in)
--                -> 'qualified_sale'   (on till purchase, staff-tagged)
--                -> 'expired'          (offer expiry / window)
--  Mirrors ad_clicks (see 052_dander_ads_conversion_tracking.sql).
--
--  GDPR: anon_id is a device identifier (privacy-flagged). Erasure /
--  retention must cover this table — handle with the GDPR pass.
-- ============================================================

CREATE TABLE IF NOT EXISTS offer_activations (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id             INTEGER      NOT NULL REFERENCES offers(id)      ON DELETE CASCADE,
  business_id          INTEGER      NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id              INTEGER      REFERENCES users(id)               ON DELETE CASCADE,
  anon_id              TEXT,
  channel              VARCHAR(16)  NOT NULL
                          CHECK (channel IN ('app', 'web', 'sticker')),
  status               VARCHAR(20)  NOT NULL DEFAULT 'activated'
                          CHECK (status IN ('activated', 'entry_conversion', 'qualified_sale', 'expired')),
  activated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  entry_conversion_at  TIMESTAMPTZ,
  sale_conversion_at   TIMESTAMPTZ,
  sale_amount          NUMERIC(10,2),
  commission_rate      NUMERIC(5,4) NOT NULL DEFAULT 0.0000,   -- tracking-only for now
  commission_amount    NUMERIC(10,2),
  offer_expires_at     TIMESTAMPTZ,                            -- snapshot of offer expiry → drives My-Offers auto-hide
  CONSTRAINT chk_offer_activations_identity CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL)
);

-- One open activation per (offer, user); re-activate is idempotent (upsert).
CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_activations_offer_user
  ON offer_activations (offer_id, user_id) WHERE user_id IS NOT NULL;
-- One open activation per (offer, anon) before login.
CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_activations_offer_anon
  ON offer_activations (offer_id, anon_id) WHERE anon_id IS NOT NULL AND user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_offer_activations_user_business_status
  ON offer_activations (user_id, business_id, status);
CREATE INDEX IF NOT EXISTS idx_offer_activations_offer_channel_status
  ON offer_activations (offer_id, channel, status);
CREATE INDEX IF NOT EXISTS idx_offer_activations_anon
  ON offer_activations (anon_id) WHERE anon_id IS NOT NULL;
```

- [ ] **Step 2: Apply the migration locally**

Run (from `backend/`): `node db/migrate.js`
Expected: log shows `061_offer_activations` applied; no error. (Migrations are idempotent via `IF NOT EXISTS`.)

- [ ] **Step 3: Verify the table exists**

Run: `node -e "const p=require('./db/pool'); p.query('SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position',['offer_activations']).then(r=>{console.log(r.rows.map(x=>x.column_name).join(','));process.exit(0)})"`
Expected: prints `id,offer_id,business_id,user_id,anon_id,channel,status,activated_at,entry_conversion_at,sale_conversion_at,sale_amount,commission_rate,commission_amount,offer_expires_at`

- [ ] **Step 4: Commit**

```bash
git add backend/db/migrations/061_offer_activations.sql
git commit -m "feat: offer_activations table (offer attribution funnel)"
```

---

## Task 2: Pure channel validation helper (TDD)

The one genuinely unit-testable piece (the repo's test harness is `node --test utils/*.test.js`).

**Files:**
- Create: `backend/utils/offerChannel.js`
- Test: `backend/utils/offerChannel.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/utils/offerChannel.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert');
const { isValidChannel, normalizeChannel, VALID_CHANNELS } = require('./offerChannel');

test('VALID_CHANNELS are app/web/sticker', () => {
  assert.deepStrictEqual([...VALID_CHANNELS].sort(), ['app', 'sticker', 'web']);
});

test('isValidChannel accepts the three channels', () => {
  assert.strictEqual(isValidChannel('app'), true);
  assert.strictEqual(isValidChannel('web'), true);
  assert.strictEqual(isValidChannel('sticker'), true);
});

test('isValidChannel rejects unknown / empty / non-string', () => {
  assert.strictEqual(isValidChannel('email'), false);
  assert.strictEqual(isValidChannel(''), false);
  assert.strictEqual(isValidChannel(null), false);
  assert.strictEqual(isValidChannel(42), false);
});

test('normalizeChannel maps the sticker ?src and lowercases, else null', () => {
  assert.strictEqual(normalizeChannel('STICKER'), 'sticker');
  assert.strictEqual(normalizeChannel('Web'), 'web');
  assert.strictEqual(normalizeChannel('nonsense'), null);
  assert.strictEqual(normalizeChannel(undefined), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `backend/`): `node --test utils/offerChannel.test.js`
Expected: FAIL — cannot find module `./offerChannel`.

- [ ] **Step 3: Implement `offerChannel.js`**

Create `backend/utils/offerChannel.js`:
```js
'use strict';

// The three attribution channels an offer can be activated from.
const VALID_CHANNELS = new Set(['app', 'web', 'sticker']);

function isValidChannel(c) {
  return typeof c === 'string' && VALID_CHANNELS.has(c);
}

// Lowercase + validate; returns the canonical channel or null. Used to
// coerce a client-supplied channel (and the sticker ?src param).
function normalizeChannel(c) {
  if (typeof c !== 'string') return null;
  const v = c.toLowerCase();
  return VALID_CHANNELS.has(v) ? v : null;
}

module.exports = { VALID_CHANNELS, isValidChannel, normalizeChannel };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test utils/offerChannel.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/offerChannel.js backend/utils/offerChannel.test.js
git commit -m "feat: offerChannel pure validation helper"
```

---

## Task 3: offerActivation service

**Files:**
- Create: `backend/services/offerActivation.js`

> No unit test (uses `pool`; repo has no DB test harness). Verified via the API curl in Task 5. Mirrors `services/adAttribution.js` style.

- [ ] **Step 1: Implement the service**

Create `backend/services/offerActivation.js`:
```js
'use strict';

// offerActivation — the offer attribution funnel (cousin of adAttribution).
//   activate / deactivate / listMyOffers — user-facing.
//   markEntryConversion / markSaleConversion — wired into check-in / till (Plan 3).
//   stitchAnonToUser — claim anon activations on login/check-in (Plan 2).

const pool = require('../db/pool');

const ATTRIBUTION_WINDOW = "INTERVAL '7 days'";

// Upsert an activation. identity is { userId } OR { anonId }. Returns the row.
async function activate(client, { offerId, channel, userId = null, anonId = null }) {
  // business_id + offer expiry are derived from the offer so the caller can't spoof them.
  const { rows: offerRows } = await client.query(
    'SELECT business_id, expires_at, is_active FROM offers WHERE id = $1',
    [offerId]
  );
  if (offerRows.length === 0) { const e = new Error('Offer not found.'); e.status = 404; throw e; }
  const { business_id, expires_at, is_active } = offerRows[0];
  if (!is_active) { const e = new Error('Offer is not active.'); e.status = 409; throw e; }

  if (userId) {
    const { rows } = await client.query(
      `INSERT INTO offer_activations (offer_id, business_id, user_id, channel, offer_expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (offer_id, user_id) WHERE user_id IS NOT NULL DO UPDATE
         SET channel = EXCLUDED.channel, activated_at = NOW(),
             status = CASE WHEN offer_activations.status = 'expired' THEN 'activated' ELSE offer_activations.status END,
             offer_expires_at = EXCLUDED.offer_expires_at
       RETURNING *`,
      [offerId, business_id, userId, channel, expires_at]
    );
    return rows[0];
  }
  const { rows } = await client.query(
    `INSERT INTO offer_activations (offer_id, business_id, anon_id, channel, offer_expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (offer_id, anon_id) WHERE anon_id IS NOT NULL AND user_id IS NULL DO UPDATE
       SET channel = EXCLUDED.channel, activated_at = NOW(), offer_expires_at = EXCLUDED.offer_expires_at
     RETURNING *`,
    [offerId, business_id, anonId, channel, expires_at]
  );
  return rows[0];
}

async function deactivate(client, { offerId, userId = null, anonId = null }) {
  if (userId) {
    await client.query('DELETE FROM offer_activations WHERE offer_id = $1 AND user_id = $2', [offerId, userId]);
  } else if (anonId) {
    await client.query('DELETE FROM offer_activations WHERE offer_id = $1 AND anon_id = $2 AND user_id IS NULL', [offerId, anonId]);
  }
}

// My Offers: the user's activations whose offer hasn't expired (auto-hide at
// offer expiry; expired rows are RETAINED in the table for analytics).
async function listMyOffers(client, userId) {
  const { rows } = await client.query(
    `SELECT a.id AS activation_id, a.channel, a.status, a.activated_at,
            o.id, o.title, o.description, o.image_url, o.offer_type,
            o.original_price, o.offer_price, o.discount_percent, o.expires_at,
            b.name AS business_name, b.logo_url AS business_logo_url
       FROM offer_activations a
       JOIN offers o      ON o.id = a.offer_id
       JOIN businesses b  ON b.id = a.business_id
      WHERE a.user_id = $1
        AND (o.expires_at IS NULL OR o.expires_at > NOW())
        AND o.is_active = TRUE
      ORDER BY a.activated_at DESC`,
    [userId]
  );
  return rows;
}

// On check-in: open activations for this user+business → entry_conversion.
async function markEntryConversion(client, { userId, businessId }) {
  const { rows } = await client.query(
    `UPDATE offer_activations
        SET status = 'entry_conversion', entry_conversion_at = NOW()
      WHERE user_id = $1 AND business_id = $2
        AND status = 'activated'
        AND activated_at > NOW() - ${ATTRIBUTION_WINDOW}
    RETURNING id, offer_id`,
    [userId, businessId]
  );
  return rows.length;
}

// On till purchase: a staff-tagged offer (deterministic) → qualified_sale.
// If offerId is null, last-touch backfill across this user's open rows.
async function markSaleConversion(client, { userId, businessId, offerId = null, saleAmount }) {
  const amount = Number(saleAmount);
  if (offerId) {
    const { rows } = await client.query(
      `UPDATE offer_activations
          SET status = 'qualified_sale', sale_conversion_at = NOW(), sale_amount = $4
        WHERE user_id = $1 AND business_id = $2 AND offer_id = $3
          AND status IN ('activated', 'entry_conversion')
          AND activated_at > NOW() - ${ATTRIBUTION_WINDOW}
      RETURNING id`,
      [userId, businessId, offerId, amount]
    );
    return rows.length;
  }
  // Backfill: most recent open activation (last-touch).
  const { rows } = await client.query(
    `UPDATE offer_activations
        SET status = 'qualified_sale', sale_conversion_at = NOW(), sale_amount = $3
      WHERE id = (
        SELECT id FROM offer_activations
         WHERE user_id = $1 AND business_id = $2
           AND status IN ('activated', 'entry_conversion')
           AND activated_at > NOW() - ${ATTRIBUTION_WINDOW}
         ORDER BY activated_at DESC LIMIT 1
      )
    RETURNING id`,
    [userId, businessId, amount]
  );
  return rows.length;
}

// On login / check-in: claim this device's anon activations for the user,
// skipping any the user already has for the same offer.
async function stitchAnonToUser(client, { anonId, userId }) {
  if (!anonId) return 0;
  const { rows } = await client.query(
    `UPDATE offer_activations a
        SET user_id = $2, anon_id = NULL
      WHERE a.anon_id = $1 AND a.user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM offer_activations b
           WHERE b.offer_id = a.offer_id AND b.user_id = $2
        )
    RETURNING id`,
    [anonId, userId]
  );
  // Drop any anon rows that collided (user already had that offer activated).
  await client.query('DELETE FROM offer_activations WHERE anon_id = $1 AND user_id IS NULL', [anonId]);
  return rows.length;
}

module.exports = {
  activate, deactivate, listMyOffers,
  markEntryConversion, markSaleConversion, stitchAnonToUser,
};
```

- [ ] **Step 2: Syntax check**

Run (from `backend/`): `node --check services/offerActivation.js`
Expected: exit 0 (no output).

- [ ] **Step 3: Commit**

```bash
git add backend/services/offerActivation.js
git commit -m "feat: offerActivation service (activate/list/convert/stitch)"
```

---

## Task 4: Activate / My-Offers API routes

**Files:**
- Modify: `backend/routes/offers.js`

> `GET /activated` MUST be registered before `GET /:id` (same collision the existing `/saved` route avoids — see `offers.js` around the `/saved` handler).

- [ ] **Step 1: Add imports**

Near the top of `backend/routes/offers.js` (with the other requires), add:
```js
const offerActivation = require('../services/offerActivation');
const { normalizeChannel } = require('../utils/offerChannel');
```
(`requireAuth`, `optionalAuth`, `pool`, `param`, `body`, `validate`, `ok`, `fail` already exist in this file.)

- [ ] **Step 2: Add `GET /activated` immediately BEFORE the `GET /:id` route**

```js
// ---------------------------------------------------------------------------
// GET /api/offers/activated — the caller's "My Offers" (non-expired)
// NOTE: must be registered BEFORE /:id so 'activated' isn't matched as an id.
// ---------------------------------------------------------------------------
router.get('/activated', requireAuth, async (req, res) => {
  try {
    const offers = await offerActivation.listMyOffers(pool, req.user.id);
    return ok(res, { count: offers.length, offers });
  } catch (err) {
    console.error('[offers/activated GET]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to fetch activated offers.');
  }
});
```

- [ ] **Step 3: Add activate + deactivate routes (anywhere after `/activated`, e.g. next to `/:id/save`)**

```js
// ---------------------------------------------------------------------------
// POST /api/offers/:id/activate — record the activate intent event.
// optionalAuth: logged-in → user_id; logged-out → requires anon_id in body.
// Body: { channel: 'app'|'web'|'sticker', anon_id?: string }
// ---------------------------------------------------------------------------
router.post(
  '/:id/activate',
  optionalAuth,
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    const channel = normalizeChannel(req.body?.channel);
    if (!channel) return fail(res, 400, 'VALIDATION_ERROR', 'channel must be app, web, or sticker.');

    const userId = req.user?.id ?? null;
    const anonId = userId ? null : (typeof req.body?.anon_id === 'string' ? req.body.anon_id.slice(0, 100) : null);
    if (!userId && !anonId) return fail(res, 400, 'VALIDATION_ERROR', 'Sign in or provide anon_id to activate.');

    try {
      const row = await offerActivation.activate(pool, {
        offerId: parseInt(req.params.id, 10), channel, userId, anonId,
      });
      return ok(res, { activation_id: row.id, status: row.status });
    } catch (err) {
      if (err.status === 404) return fail(res, 404, 'NOT_FOUND', err.message);
      if (err.status === 409) return fail(res, 409, 'OFFER_INACTIVE', err.message);
      console.error('[offers/:id/activate POST]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to activate offer.');
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/offers/:id/activate — remove an activation (My Offers un-activate)
// ---------------------------------------------------------------------------
router.delete(
  '/:id/activate',
  optionalAuth,
  [param('id').isInt({ min: 1 }).withMessage('Invalid offer ID.')],
  async (req, res) => {
    if (!validate(req, res)) return;
    const userId = req.user?.id ?? null;
    const anonId = userId ? null : (typeof req.body?.anon_id === 'string' ? req.body.anon_id.slice(0, 100) : null);
    if (!userId && !anonId) return fail(res, 400, 'VALIDATION_ERROR', 'Sign in or provide anon_id.');
    try {
      await offerActivation.deactivate(pool, { offerId: parseInt(req.params.id, 10), userId, anonId });
      return ok(res, { message: 'Deactivated.' });
    } catch (err) {
      console.error('[offers/:id/activate DELETE]', err);
      return fail(res, 500, 'SERVER_ERROR', 'Failed to deactivate offer.');
    }
  }
);
```

- [ ] **Step 4: Syntax check**

Run (from `backend/`): `node --check routes/offers.js`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/offers.js
git commit -m "feat: activate / deactivate / My-Offers API routes"
```

---

## Task 5: End-to-end verification (curl)

> The repo verifies routes by running the server + curl (no route test harness). Use a real staging user JWT (mint one as in STAGING.md smoke tokens) and a real staging offer/business (e.g. offer 1, business 4).

- [ ] **Step 1: Start the backend (or use staging-api after deploy)**

Local: `cd backend && npm start` (needs a DB). Or run these against `https://staging-api.tapprove.io` after merging this plan to `pre-staging` and deploying.

- [ ] **Step 2: Anonymous activate**

```bash
curl -s -X POST "$API/api/offers/1/activate" -H 'Content-Type: application/json' \
  -d '{"channel":"sticker","anon_id":"test-anon-1"}'
```
Expected: `{"success":true,"activation_id":"...","status":"activated"}`

- [ ] **Step 3: Authed activate (idempotent upsert)**

```bash
curl -s -X POST "$API/api/offers/1/activate" -H "Authorization: Bearer $USER_JWT" \
  -H 'Content-Type: application/json' -d '{"channel":"web"}'
# run twice — second call must NOT create a duplicate (upsert)
```
Expected: `success:true` both times; one row per (offer,user) in the table.

- [ ] **Step 4: My Offers list**

```bash
curl -s "$API/api/offers/activated" -H "Authorization: Bearer $USER_JWT"
```
Expected: `{"success":true,"count":1,"offers":[{ ...offer 1..., "channel":"web","status":"activated" }]}`

- [ ] **Step 5: Validation + deactivate**

```bash
curl -s -X POST "$API/api/offers/1/activate" -H "Authorization: Bearer $USER_JWT" \
  -H 'Content-Type: application/json' -d '{"channel":"email"}'   # → 400 VALIDATION_ERROR
curl -s -X DELETE "$API/api/offers/1/activate" -H "Authorization: Bearer $USER_JWT"  # → success
curl -s "$API/api/offers/activated" -H "Authorization: Bearer $USER_JWT"             # → count:0
```
Expected: 400 on bad channel; deactivate succeeds; list empties.

- [ ] **Step 6: Confirm `GET /activated` is not shadowed by `/:id`**

The list call in Step 4 returns the My-Offers shape (not a 400 "Invalid offer ID") — proves `/activated` is registered before `/:id`.

---

## Self-Review

**Spec coverage (Plan 1 slice):**
- `offer_activations` table mirroring `ad_clicks`, with channel + anon_id + status lifecycle + offer_expires_at → Task 1 ✓
- activate = intent event (offer_id, channel, user_id|anon_id, ts) → Tasks 3,4 ✓
- My Offers list, auto-hide at offer expiry, retain expired rows → `listMyOffers` (filters on offer expiry, never deletes) ✓
- anon capture + stitch + conversion transitions defined (wired later) → `offerActivation` service ✓
- one-per-(offer,identity) idempotent upsert → unique partial indexes + ON CONFLICT ✓
- GDPR note on anon_id → migration comment + plan header ✓

**Deferred to later plans (not gaps):** web/app Activate UI + resume-after-auth stitch wiring (Plan 2/4); check-in/till hook wiring + TillPanel tag (Plan 3); dashboard (Plan 5); sticker `?src=` (Plan 2/3).

**Placeholder scan:** none — complete SQL/JS/curl in every step.

**Type/name consistency:** service exports `activate/deactivate/listMyOffers/markEntryConversion/markSaleConversion/stitchAnonToUser`; routes call `activate`/`deactivate`/`listMyOffers` + `normalizeChannel`; channels `app|web|sticker` consistent across migration CHECK, `offerChannel`, and routes.

**Harness note:** backend routes aren't unit-tested in this repo (only `node --test utils/*.test.js`); Task 2 is the genuine TDD unit; Tasks 1/3/4 are verified by migration introspection + `node --check` + the Task 5 curl suite, consistent with how `till`/`public` routes are verified.
