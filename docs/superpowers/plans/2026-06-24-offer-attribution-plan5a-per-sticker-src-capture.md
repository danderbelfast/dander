# Offer Attribution — Plan 5A: Finer per-sticker `src` capture

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps, TDD where a harness exists.

**Goal:** Capture a fine-grained attribution `source` (e.g. `sticker_window`) on every offer activation, while the coarse `channel` (`app`/`web`/`sticker`) stays the rollup bucket — so per-individual-sticker data accumulates from day one even though the per-sticker *view* is a later build (Part B). **Time-sensitive: must ship before physical stickers are programmed**, or that data is lost on those stickers forever.

**Architecture:** New nullable `source` column on `offer_activations`. The web resolver returns `{ channel, source }`; the server **derives the coarse `channel` from `source`** (authoritative — a client can't mis-file a sticker under web/app), normalizes `source`, and stores both. The `channel` CHECK enum is unchanged, so the existing channel breakdown `GROUP BY channel` rolls `sticker_window`/`sticker_door` up to `sticker` automatically. Legacy rows get `source = NULL` and still roll up.

**Tech Stack:** Express + pg (backend); React + Vite + Vitest (frontend-user); node:test (backend utils). **Branch:** worktree off `pre-staging`.

**Sticker URL contract (locked):**
- `/tap?node=<id>&business=<id>` → check-in (points). Door/node NFC. *(unchanged, not an offer channel)*
- `/business/:id/offers?src=sticker_<location>` → offer page; activation `channel='sticker'`, `source='sticker_<location>'`.
- `src` format: `sticker_<location>`, lowercase `[a-z0-9_]`, ≤32 — e.g. `sticker_window`, `sticker_door`, `sticker_counter`. Bare `?src=sticker` still valid (→ `source='sticker'`). Coarse channel: `^sticker` → `sticker`, `app` → `app`, else `web`.

**Definition of done (verified):**
- (a) Migration adds `source` (idempotent); existing rows unaffected (`source` NULL);
- (b) `?src=sticker_window` activation persists `channel='sticker'`, `source='sticker_window'`;
- (c) bare `?src=sticker` → `channel='sticker'`, `source='sticker'`; no `src` → `channel='web'`, `source='web'`;
- (d) a client sending `channel='web'` but `source='sticker_window'` is stored as `channel='sticker'` (server-derived — ungameable);
- (e) all unit suites green; existing activation flow (Plans 2/3) unbroken.

---

## Task 1: Migration — add `source` column

**Files:** Create `backend/db/migrations/062_offer_activation_source.sql`

- [ ] **Step 1:** Write the migration:
```sql
-- ============================================================
--  Fine-grained attribution source for offer activations.
--  channel stays the coarse rollup bucket (app/web/sticker);
--  source carries the finer tag (e.g. 'sticker_window') for the
--  later per-sticker view. Nullable — legacy rows roll up by
--  channel as before. See Plan 5 spec.
-- ============================================================
ALTER TABLE offer_activations ADD COLUMN IF NOT EXISTS source VARCHAR(32);
```
- [ ] **Step 2:** `node --check` is N/A for SQL; eyeball it. (Railway runs migrations on boot — no manual apply.)
- [ ] **Step 3:** Commit: `feat: offer_activations.source column (per-sticker attribution)`.

---

## Task 2: `normalizeSource` + `channelFromSource` (backend util, TDD)

**Files:** Modify `backend/utils/offerChannel.js`, `backend/utils/offerChannel.test.js`

- [ ] **Step 1: Failing tests** — append to `offerChannel.test.js`:
```js
const { normalizeSource, channelFromSource } = require('./offerChannel');

test('normalizeSource lowercases, strips to [a-z0-9_], caps 32, else null', () => {
  assert.strictEqual(normalizeSource('Sticker_Window'), 'sticker_window');
  assert.strictEqual(normalizeSource('sticker-door!!'), 'stickerdoor');
  assert.strictEqual(normalizeSource('web'), 'web');
  assert.strictEqual(normalizeSource('x'.repeat(40)), 'x'.repeat(32));
  assert.strictEqual(normalizeSource('   '), null);
  assert.strictEqual(normalizeSource(''), null);
  assert.strictEqual(normalizeSource(undefined), null);
});

test('channelFromSource derives the coarse bucket (server-authoritative)', () => {
  assert.strictEqual(channelFromSource('sticker_window'), 'sticker');
  assert.strictEqual(channelFromSource('sticker'), 'sticker');
  assert.strictEqual(channelFromSource('app'), 'app');
  assert.strictEqual(channelFromSource('web'), 'web');
  assert.strictEqual(channelFromSource('promo_email'), 'web'); // unknown → web
  assert.strictEqual(channelFromSource(null), null);
  assert.strictEqual(channelFromSource(''), null);
});
```

- [ ] **Step 2:** `node --test backend/utils/offerChannel.test.js` → new tests FAIL (functions undefined).

- [ ] **Step 3: Implement** — in `offerChannel.js`, add the two functions and export them:
```js
// Fine attribution source (e.g. 'sticker_window'): lowercase, [a-z0-9_], <=32.
function normalizeSource(raw) {
  if (typeof raw !== 'string') return null;
  const v = raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
  return v.length ? v : null;
}

// Coarse channel derived from the fine source — server-authoritative, so a
// client can't mis-file a sticker activation under web/app. Returns null for
// an empty/non-string source (caller falls back to the client channel).
function channelFromSource(source) {
  if (typeof source !== 'string' || source.length === 0) return null;
  if (source.startsWith('sticker')) return 'sticker';
  if (source === 'app') return 'app';
  return 'web';
}
```
and extend the exports:
```js
module.exports = { VALID_CHANNELS, isValidChannel, normalizeChannel, normalizeSource, channelFromSource };
```

- [ ] **Step 4:** `node --test backend/utils/offerChannel.test.js` → all PASS.
- [ ] **Step 5:** Commit: `feat: normalizeSource + channelFromSource (server-derived coarse channel)`.

---

## Task 3: `offerActivation.activate()` stores `source`

**Files:** Modify `backend/services/offerActivation.js`

- [ ] **Step 1:** Change the signature to accept `source`:
```js
async function activate(client, { offerId, channel, source = null, userId = null, anonId = null }) {
```

- [ ] **Step 2:** Update the **user** upsert to insert + refresh `source` (note shifted params — `source` is `$5`, `offer_expires_at` becomes `$6`):
```js
    const { rows } = await client.query(
      `INSERT INTO offer_activations (offer_id, business_id, user_id, channel, source, offer_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (offer_id, user_id) WHERE user_id IS NOT NULL DO UPDATE
         SET channel = EXCLUDED.channel, source = EXCLUDED.source, activated_at = NOW(),
             status = CASE WHEN offer_activations.status = 'expired' THEN 'activated' ELSE offer_activations.status END,
             offer_expires_at = EXCLUDED.offer_expires_at
       RETURNING *`,
      [offerId, business_id, userId, channel, source, expires_at]
    );
    return rows[0];
```

- [ ] **Step 3:** Update the **anon** upsert the same way:
```js
  const { rows } = await client.query(
    `INSERT INTO offer_activations (offer_id, business_id, anon_id, channel, source, offer_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (offer_id, anon_id) WHERE anon_id IS NOT NULL AND user_id IS NULL DO UPDATE
       SET channel = EXCLUDED.channel, source = EXCLUDED.source, activated_at = NOW(), offer_expires_at = EXCLUDED.offer_expires_at
     RETURNING *`,
    [offerId, business_id, anonId, channel, source, expires_at]
  );
  return rows[0];
```

- [ ] **Step 4:** `node --check backend/services/offerActivation.js` → clean.
- [ ] **Step 5:** Commit: `feat: persist source on offer activation`.

---

## Task 4: Route derives channel from source

**Files:** Modify `backend/routes/offers.js`

- [ ] **Step 1:** Import the new helpers — update the existing import:
```js
const { normalizeChannel, normalizeSource, channelFromSource } = require('../utils/offerChannel');
```

- [ ] **Step 2:** In `POST /:id/activate`, replace the channel-validation block:
```js
    const channel = normalizeChannel(req.body?.channel);
    if (!channel) return fail(res, 400, 'VALIDATION_ERROR', 'channel must be app, web, or sticker.');
```
with source-first, server-derived channel (never blocks on a channel quibble — defaults to web):
```js
    // Fine source is the source of truth; coarse channel is derived from it
    // server-side (ungameable). Fall back to the client channel, then 'web'.
    const source  = normalizeSource(req.body?.source);
    const channel = source ? channelFromSource(source)
                           : (normalizeChannel(req.body?.channel) || 'web');
```

- [ ] **Step 3:** Pass `source` into the service call:
```js
      const row = await offerActivation.activate(pool, {
        offerId: parseInt(req.params.id, 10), channel, source, userId, anonId,
      });
```

- [ ] **Step 4:** `node --check backend/routes/offers.js` → clean.
- [ ] **Step 5:** Commit: `feat: activate route derives coarse channel from source`.

---

## Task 5: `resolveActivationChannel` returns `{ channel, source }` (frontend, TDD)

**Files:** Modify `frontend-user/src/utils/activationChannel.js`, `frontend-user/src/utils/activationChannel.test.js`

- [ ] **Step 1: Update the tests** to the new shape:
```js
import { describe, it, expect } from 'vitest';
import { resolveActivationChannel } from './activationChannel';

describe('resolveActivationChannel', () => {
  it('maps a per-location sticker src to { channel: sticker, source }', () => {
    expect(resolveActivationChannel(new URLSearchParams('src=sticker_window')))
      .toEqual({ channel: 'sticker', source: 'sticker_window' });
  });
  it('keeps bare ?src=sticker working', () => {
    expect(resolveActivationChannel(new URLSearchParams('src=sticker')))
      .toEqual({ channel: 'sticker', source: 'sticker' });
  });
  it('defaults to web with source web when absent', () => {
    expect(resolveActivationChannel(new URLSearchParams('')))
      .toEqual({ channel: 'web', source: 'web' });
  });
  it('treats an unknown src as web but keeps the tag', () => {
    expect(resolveActivationChannel(new URLSearchParams('src=promo_email')))
      .toEqual({ channel: 'web', source: 'promo_email' });
  });
  it('sanitises junk in src', () => {
    expect(resolveActivationChannel(new URLSearchParams('src=Sticker-Window!')))
      .toEqual({ channel: 'sticker', source: 'stickerwindow' });
  });
});
```

- [ ] **Step 2:** `cd frontend-user && ../node_modules/.bin/vitest run src/utils/activationChannel.test.js` → FAIL (returns a string today).

- [ ] **Step 3: Implement:**
```js
// Returns { channel, source }. source = the fine attribution tag (e.g.
// 'sticker_window') sanitised to [a-z0-9_]; channel = the coarse bucket the
// dashboard rolls up by. Window stickers carry ?src=sticker_<location>; bare
// ?src=sticker still works; anything else is web. (Native app sets source itself.)
export function resolveActivationChannel(searchParams) {
  const raw = searchParams?.get?.('src');
  const source = typeof raw === 'string'
    ? (raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32) || 'web')
    : 'web';
  const channel = source.startsWith('sticker') ? 'sticker' : (source === 'app' ? 'app' : 'web');
  return { channel, source };
}
```

- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit: `feat: resolveActivationChannel returns { channel, source }`.

---

## Task 6: `activateOffer` sends `source`

**Files:** Modify `frontend-user/src/api/offers.js`

- [ ] **Step 1:** Update `activateOffer`:
```js
export const activateOffer = (id, { channel, source, anonId } = {}) =>
  client.post(`/api/offers/${id}/activate`, {
    channel,
    ...(source ? { source } : {}),
    ...(anonId ? { anon_id: anonId } : {}),
  }).then((r) => r.data);
```
- [ ] **Step 2:** Commit: `feat: activateOffer sends source`.

---

## Task 7: `ActivateButton` passes `source` (frontend, TDD)

**Files:** Modify `frontend-user/src/components/offers/ActivateButton.jsx`, `frontend-user/src/components/offers/ActivateButton.test.jsx`

- [ ] **Step 1: Update test assertions** — `activateOffer` now receives `source` (the real resolver runs with empty params → `{channel:'web', source:'web'}`):
  - authed test: `expect(activateOffer).toHaveBeenCalledWith(7, { channel: 'web', source: 'web' });`
  - anon test: `expect(activateOffer).toHaveBeenCalledWith(7, { channel: 'web', source: 'web', anonId: 'anon-test' });`

- [ ] **Step 2:** In `ActivateButton.jsx`, destructure both and pass through. Replace:
```jsx
    const channel = resolveActivationChannel(params);
```
with:
```jsx
    const { channel, source } = resolveActivationChannel(params);
```
and update both call sites:
```jsx
          await activateOffer(offerId, { channel, source });
```
```jsx
        await activateOffer(offerId, { channel, source, anonId: getAnonId() });
```

- [ ] **Step 3:** `cd frontend-user && ../node_modules/.bin/vitest run src/components/offers/ActivateButton.test.jsx` → PASS.
- [ ] **Step 4:** Commit: `feat: ActivateButton forwards source`.

---

## Task 8: Lock the sticker URL contract (doc)

**Files:** Create `docs/superpowers/specs/sticker-url-contract.md`

- [ ] **Step 1:** Write the authoritative contract the physical stickers are programmed against:
```markdown
# Sticker URL contract

Authoritative reference for programming physical NFC/QR stickers.

## Check-in (loyalty points) — door / node
`https://<host>/tap?node=<node_id>&business=<business_id>`
- Awards loyalty points (staff-verified at till later). NOT an offer-attribution channel.

## Offer page — window / offer stickers
`https://<host>/business/<business_id>/offers?src=sticker_<location>`
- Opens the public offers page; an Activate there records `channel='sticker'`, `source='sticker_<location>'`.
- `src` format: `sticker_<location>`, lowercase, `[a-z0-9_]`, ≤32 chars.
  - Examples: `sticker_window`, `sticker_door`, `sticker_counter`, `sticker_poster`, `sticker_table`.
  - Bare `?src=sticker` is valid (→ `source='sticker'`).
- Coarse channel (server-derived, for rollups): `^sticker` → `sticker`; `app` → `app`; anything else → `web`.

Per-channel dashboard groups by the coarse `channel` (so all `sticker_*` roll up to `sticker`).
The per-sticker view (later) groups by `source`.
```
- [ ] **Step 2:** Commit: `docs: lock sticker URL contract (src=sticker_<location>)`.

---

## Task 9: Verify + merge

- [ ] **Step 1:** `node --test backend/utils/offerChannel.test.js`; `node --check` on `offerActivation.js`, `routes/offers.js`; `cd frontend-user && ../node_modules/.bin/vitest run` (full suite green).
- [ ] **Step 2:** FF-merge to `pre-staging`, push (Railway runs migration 062 on boot; Netlify redeploys frontend-user). Clean up worktree.
- [ ] **Step 3:** Update memory `project_offer-attribution-next` (the "bake ?src= into sticker URLs" line) to point at the locked contract / `[[sticker-url-contract]]`.
- [ ] **Step 4: Verify on staging** (curl, no UI needed): anon-activate offer with `source=sticker_window`, then DB-read the row → `channel='sticker'`, `source='sticker_window'`. Then activate with `channel='web'` + `source=sticker_door` → stored `channel='sticker'` (server-derived). Confirm a no-src web activate → `channel='web'`, `source='web'`.

---

## Self-Review

**DoD coverage:** (a) Task 1 idempotent migration; (b)/(c) Tasks 4–7 capture + Task 9 curl proof; (d) server-derive in Task 4 + `channelFromSource` Task 2; (e) Tasks 2/5/7 suites + Task 9 full run.
**Placeholders:** none — full code each step.
**Type consistency:** `{ channel, source }` (resolver) → `activateOffer({channel, source, anonId})` → body `{channel, source, anon_id}` → route `normalizeSource`/`channelFromSource` → `activate({offerId, channel, source, userId, anonId})` → columns `channel`,`source`. Param indices in both upserts shift to `$6` for `offer_expires_at`.
**Integrity:** coarse channel is server-derived from source whenever source is present — client channel is advisory only; rollup can't drift or be gamed.
**Backward compat:** `source` nullable; legacy rows + clients that send only `channel` still work (fall back path); bare `?src=sticker` preserved.
