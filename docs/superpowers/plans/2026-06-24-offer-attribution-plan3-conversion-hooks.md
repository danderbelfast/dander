# Offer Attribution — Plan 3: Conversion hooks + TillPanel applied-offer tag

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps.

**Goal:** Close the offer-attribution funnel — `activated → entry_conversion → qualified_sale` — by wiring the (already-built, strict-by-construction) `offerActivation` service into the two real-world events: the physical `/tap` **check-in** (→ `entry_conversion`) and the **till sale** (→ `qualified_sale`), where staff confirm which activated offer was applied via a selectable chip in the TillPanel.

**Why now:** Plan 1 built `markEntryConversion` / `markSaleConversion`; Plans 2.x built activation + the user surfaces. The funnel rows currently never advance past `activated`. This plan makes the channel-stamped intent measurable end-to-end — the metric Dander sells — and ties the commission event (`qualified_sale`) to a staff-verified tag.

**Architecture / integrity decisions (locked):**
- **Strict-activated.** The till tag candidate list is ONLY this customer's activated offers for this business. `qualified_sale` therefore always has a preceding activation — a walk-up discount with no activation is *not* an attribution event and is never tagged here. (A "total redemptions incl. walk-ups" metric, if ever wanted, is a separate, clearly-labelled thing — not this funnel.)
- **Staff-confirm is the trust gate** for `qualified_sale` (it drives commission). The customer device never unilaterally tags. The tag rides the existing staff **Award** action — one chip selection in a panel staff already fill.
- **Server-side pre-fill.** The suggested offer = the customer's *most-recently-activated* offer for the business (last-touch v1), computed server-side in `till-arrive`. Deterministic, no dependence on the (unreliable) App-Links native path.
- **Strict by construction.** `markSaleConversion(offerId)` only flips rows that are genuinely `activated`/`entry_conversion` for that user+business+offer within the 7-day window, so a bogus/forged `applied_offer_id` simply matches zero rows. No extra client trust needed.
- **Decoupled.** Points and the offer tag are independent: "None" → points only, no tag; no activated offers → no chips, award works exactly as today. All conversion calls **fail open** (mirror the ad funnel) — a funnel error must never break check-in or the till.

**Tech Stack:** Express + pg (backend); React + Vite (frontend-business). **Branch:** worktree off `pre-staging`.

**Verification note:** Backend route layer has no integration-test harness (repo convention — only `backend/utils/*.test.js` via node:test); these steps verify with `node --check` + curl/device. `frontend-business` has **no test harness** (zero tests in the repo); the TillPanel step verifies with `npm run build` + device. The integrity logic lives in the already-built service layer and is strict-by-construction.

**Definition of done (device-verified on staging):**
- (a) Activate an offer, then check in via `/tap` at that business → the activation advances to `entry_conversion`;
- (b) tap at the till → TillPanel shows the customer's activated offers as chips (most-recent pre-selected, working "None") front and centre, and the all-business "apply by hand" list collapsed into a "walk-up discounts — not tagged" disclosure;
- (c) Award with a chip selected → that activation → `qualified_sale` (with `sale_amount`); points still awarded;
- (d) Award with "None" → points awarded, **no** `qualified_sale`;
- (e) points and the tag are independent; **no** activated offers → no chips, the all-business list shows expanded as today, award unaffected;
- (f) check-in / till never break if the funnel update errors (fails open).

---

## Task 1: `entry_conversion` on check-in (backend)

**Files:** Modify `backend/routes/proximity.js`

- [ ] **Step 1:** Add the service import next to the ad-funnel one (after line 30 `const adAttribution = require('../services/adAttribution');`):
```js
const offerActivation = require('../services/offerActivation');
```

- [ ] **Step 2:** In the `/nfc-checkin` handler, immediately AFTER the existing ad block (the `try { await adAttribution.onCustomerArrived(...) } catch ...` ending ~line 399), add the mirror:
```js
    // Offer attribution — promote this user's open activations for the
    // business to 'entry_conversion' (mirrors the ad funnel above). Fails open:
    // a funnel error must never break the check-in.
    try {
      await offerActivation.markEntryConversion(pool, {
        userId: req.user.id,
        businessId,
      });
    } catch (e) {
      console.warn('[offers/entry-conversion] non-fatal:', e.message);
    }
```

- [ ] **Step 3:** `node --check backend/routes/proximity.js` → no syntax error.
- [ ] **Step 4:** Commit: `feat: offer entry_conversion on nfc check-in`.

---

## Task 2: Per-customer activated offers in `till-arrive` (backend)

**Files:** Modify `backend/services/offerActivation.js`, `backend/routes/proximity.js`

- [ ] **Step 1:** In `offerActivation.js`, add the till tag candidate query (after `listMyOffers`):
```js
// Till tag candidate set: this user's NON-expired, still-open activations for
// ONE business, within the attribution window. Most-recent first → row[0] is the
// deterministic last-touch suggestion for the TillPanel pre-selection.
async function listActivatedForBusiness(client, { userId, businessId }) {
  const { rows } = await client.query(
    `SELECT a.offer_id AS id, a.status, a.activated_at,
            o.title, o.description, o.offer_type,
            o.original_price, o.offer_price, o.discount_percent
       FROM offer_activations a
       JOIN offers o ON o.id = a.offer_id
      WHERE a.user_id = $1 AND a.business_id = $2
        AND a.status IN ('activated', 'entry_conversion')
        AND a.activated_at > NOW() - ${ATTRIBUTION_WINDOW}
        AND o.is_active = TRUE
        AND (o.expires_at IS NULL OR o.expires_at > NOW())
      ORDER BY a.activated_at DESC`,
    [userId, businessId]
  );
  return rows;
}
```

- [ ] **Step 2:** Export it — add `listActivatedForBusiness` to `module.exports`:
```js
module.exports = {
  activate, deactivate, listMyOffers, listActivatedForBusiness,
  markEntryConversion, markSaleConversion, stitchAnonToUser,
};
```

- [ ] **Step 3:** In `proximity.js` `/till-arrive`, just BEFORE `const payload = {` (after the `offerRows` block), fetch + shape the customer's activated offers:
```js
    // Strict-activated tag candidates for the TillPanel + last-touch suggestion.
    const activatedRows = await offerActivation.listActivatedForBusiness(pool, { userId, businessId });
    const activatedOffers = activatedRows.map((o) => ({
      id:               o.id,
      title:            o.title,
      description:      o.description,
      offer_type:       o.offer_type,
      original_price:   o.original_price ? Number(o.original_price) : null,
      offer_price:      o.offer_price    ? Number(o.offer_price)    : null,
      discount_percent: o.discount_percent ? Number(o.discount_percent) : null,
    }));
```

- [ ] **Step 4:** Add two fields to the `payload` object (alongside `active_offers`):
```js
      activated_offers:   activatedOffers,
      suggested_offer_id: activatedOffers.length ? activatedOffers[0].id : null,
```
(`offerActivation` is already imported by Task 1.)

- [ ] **Step 5:** `node --check backend/services/offerActivation.js && node --check backend/routes/proximity.js` → clean.
- [ ] **Step 6:** Commit: `feat: till-arrive surfaces customer activated offers + last-touch suggestion`.

---

## Task 3: `qualified_sale` on till award (backend)

**Files:** Modify `backend/routes/till.js`

- [ ] **Step 1:** Add the service import next to the ad one (after line 29 `const adAttribution = require('../services/adAttribution');`):
```js
const offerActivation = require('../services/offerActivation');
```

- [ ] **Step 2:** In `/award-points`, parse the optional staff-tagged offer alongside the other body fields (after `itemDesc`):
```js
  const appliedOfferIdRaw = parseInt(body.applied_offer_id, 10);
  const appliedOfferId = Number.isFinite(appliedOfferIdRaw) && appliedOfferIdRaw > 0
    ? appliedOfferIdRaw
    : null;
```

- [ ] **Step 3:** Immediately AFTER the existing ad block (`try { await adAttribution.onCustomerPurchased(...) } catch ...`, ~line 116), add:
```js
    // Offer attribution — staff-tagged applied offer → qualified_sale. Strict:
    // markSaleConversion(offerId) only flips a row the customer genuinely
    // activated (status activated/entry_conversion, in-window), so a bogus id
    // matches nothing. 'None' (null) tags nothing. Fails open.
    if (appliedOfferId) {
      try {
        await offerActivation.markSaleConversion(pool, {
          userId,
          businessId: req.business.id,
          offerId: appliedOfferId,
          saleAmount: amountSpent,
        });
      } catch (e) {
        console.warn('[offers/qualified-sale] non-fatal:', e.message);
      }
    }
```

- [ ] **Step 4:** `node --check backend/routes/till.js` → clean.
- [ ] **Step 5:** Commit: `feat: offer qualified_sale on staff-tagged till award`.

---

## Task 4: TillPanel applied-offer chips (frontend-business)

**Files:** Modify `frontend-business/src/components/TillPanel.jsx`

**Layout principle:** the activated-offer chips are the *attribution action* — front and centre (prominent, above the amount field) when the customer has activations. The existing all-business "apply by hand" list keeps a *till-operations* purpose (applying a walk-up discount to a customer who didn't activate — correctly NOT a `qualified_sale`), so it stays available but moves out of the way: collapsed into a labelled disclosure when activations exist, shown expanded as today when there are none.

- [ ] **Step 1:** Add selection state (next to the other `useState` hooks):
```jsx
  const [selectedOfferId, setSelectedOfferId] = useState(null);
```

- [ ] **Step 2:** In the `onBusinessEvent('till_customer', …)` handler, initialise the selection to the server's suggestion (add after `setCustomer(payload);`):
```jsx
      setSelectedOfferId(payload.suggested_offer_id ?? null);
```

- [ ] **Step 3:** In `handleAward`, pass the staff-confirmed tag:
```jsx
      await awardTillPoints({
        user_id: customer.user_id,
        amount_spent: amt,
        category: category || null,
        item_description: item || null,
        applied_offer_id: selectedOfferId,
      });
```

- [ ] **Step 4:** Just inside the ARRIVED render (before the JSX `return`-area markup for the panel, near `previewPoints`), derive whether the customer has activations:
```jsx
  const hasActivations = Array.isArray(customer?.activated_offers) && customer.activated_offers.length > 0;
```

- [ ] **Step 5:** Render the chips as the primary attribution control. Insert directly ABOVE the existing `active_offers` block (so chips come first / prominent):
```jsx
          {hasActivations && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>
                OFFER APPLIED — tag the one redeemed
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {customer.activated_offers.map((o) => (
                  <button key={o.id} type="button" disabled={submitting}
                    onClick={() => setSelectedOfferId(o.id)}
                    style={chipStyles(selectedOfferId === o.id)}>
                    {o.title}
                  </button>
                ))}
                <button type="button" disabled={submitting}
                  onClick={() => setSelectedOfferId(null)}
                  style={chipStyles(selectedOfferId === null)}>
                  None
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 6:** Demote the existing all-business list to a walk-up reference. Wrap the existing `active_offers` block so it collapses when there are activations. Replace the existing block's outer guard:
```jsx
          {Array.isArray(customer.active_offers) && customer.active_offers.length > 0 && (
            <div style={activeOffersStyles}>
              {/* …existing ACTIVE OFFERS header + map + "Apply by hand…" note… */}
            </div>
          )}
```
with (keep the inner `<div style={activeOffersStyles}>…</div>` exactly as-is — only the wrapper changes):
```jsx
          {Array.isArray(customer.active_offers) && customer.active_offers.length > 0 && (
            hasActivations ? (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: 'var(--c-text-muted)', fontWeight: 600 }}>
                  All offers (walk-up discounts — not tagged)
                </summary>
                <div style={activeOffersStyles}>
                  {/* …existing ACTIVE OFFERS header + map + "Apply by hand…" note (unchanged)… */}
                </div>
              </details>
            ) : (
              <div style={activeOffersStyles}>
                {/* …existing ACTIVE OFFERS header + map + "Apply by hand…" note (unchanged)… */}
              </div>
            )
          )}
```

- [ ] **Step 7:** Add the `chipStyles` helper next to the other style helpers (e.g. after `tierBadge`):
```jsx
function chipStyles(active) {
  return {
    padding: '6px 12px',
    borderRadius: 999,
    border: active ? '1px solid #84cc16' : '1px solid var(--c-border, rgba(0,0,0,0.15))',
    background: active ? 'rgba(132, 204, 22, 0.18)' : 'transparent',
    color: 'inherit',
    fontWeight: active ? 700 : 500,
    fontSize: '0.85rem',
    cursor: 'pointer',
  };
}
```

- [ ] **Step 8:** `cd frontend-business && npm run build` → succeeds.
- [ ] **Step 9:** Commit: `feat: TillPanel applied-offer chips primary; all-offers list collapses for walk-ups`.

---

## Task 5: Verify + merge

- [ ] **Step 1:** `node --check` on all three backend files; `cd frontend-business && npm run build`; `cd frontend-user && ../node_modules/.bin/vitest run` (unchanged — sanity).
- [ ] **Step 2:** FF-merge to `pre-staging`, push (staging deploy), clean up worktree.
- [ ] **Step 3: Device-verify DoD (a)–(f)** on staging — use the Conversions dashboard (`frontend-business/src/pages/Conversions.jsx`) and/or a DB read of `offer_activations.status` to confirm the funnel advances; confirm points still award in all cases.

---

## Self-Review

**Spec coverage:** entry_conversion (Task 1), qualified_sale + strict tag (Task 3), per-customer activated set + last-touch suggestion (Task 2), staff-confirm chips + decoupled "None" (Task 4). Strict-activated, staff-gate, server-side suggestion, fail-open, decoupled — all locked decisions covered.
**Placeholders:** none — full code in every step.
**Type consistency:** `applied_offer_id` (client) → `body.applied_offer_id` (route) → `offerId` (service); `suggested_offer_id`/`activated_offers` (payload) → `customer.suggested_offer_id`/`customer.activated_offers` (panel). Service signatures match the existing `offerActivation` exports.
**Integrity:** the only new write path to `qualified_sale` is `markSaleConversion`, which is strict-activated and in-window by construction; a forged tag converts nothing.
