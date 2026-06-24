# Offer Performance Dashboard — Design (Plan 5)

**Status:** Spec for review. Design-only — no build until approved.

## Goal

Give a business the payoff view of the offer-attribution engine: a per-offer, per-channel funnel (**activated → visited → bought**) with conversion rates and the headline **attributed sales £** the offers brought through the door. Plus a capture change made *now* — finer per-sticker `?src` tags — so per-individual-sticker data accumulates from day one even though the per-sticker *view* is a later build.

## Context (what already exists)

- **Ad Conversions** page (`frontend-business/src/pages/Conversions.jsx`) is the proven template: summary cards + per-entity funnel table + "tracking only / not billed" framing. Backed by `GET /api/ads/conversions` (`backend/routes/ads.js`) using `COUNT(*) FILTER (WHERE status …)` + `SUM(sale_amount)` rollups over `ad_clicks`.
- **`offer_activations`** (migration 061) already captures the funnel: `channel` (`app`/`web`/`sticker`, CHECK-constrained), `status` (`activated`/`entry_conversion`/`qualified_sale`/`expired`), `activated_at`, `entry_conversion_at`, `sale_conversion_at`, `sale_amount`, `commission_rate`/`commission_amount` (rate currently 0).
- Plan 3 wired the funnel end-to-end (verified in DB): activate → check-in (`entry_conversion`) → staff-tagged till sale (`qualified_sale`).
- Sidebar nav (`frontend-business/src/components/layout/Sidebar.jsx`) has an **Analytics** section where Ad Conversions lives.

Plan 5 is largely "mirror the ad dashboard for the offer funnel + add the channel dimension," plus the per-sticker capture change.

## Decisions locked (this spec is built on these)

1. **New "Offer Performance" page** in the Analytics sidebar section — a sibling to Ad Conversions, NOT an extension. (Unifying both under a "Conversions" parent with Ads | Offers tabs is a future refactor, out of scope.)
2. **Three sections = MVP:** hero cards, per-offer funnel table, per-channel breakdown. Cross-tab (offer × channel), trends/time-series, and CSV export are later.
3. **Time presets** 7d / 30d / 90d / All, **anchored on activation date**.
4. **Channel-level view for MVP**, but **capture finer per-sticker `src` now** (`?src=sticker_window` etc.) so per-sticker data accumulates; per-sticker *view* is later.
5. **Attributed sales = gross post-discount transaction value** on tagged visits, labelled "Attributed sales" (no incrementality claim).
6. **Commission omitted from MVP** (rate=0 → nothing real; avoids implying we charge). Hero = attributed sales £. Forecast designed later when a real rate is set.

---

## Part A — Finer per-sticker `src` capture (the data-model crux)

### The problem
The `channel` column is a CHECK-constrained enum (`app`/`web`/`sticker`). Writing `'sticker_window'` straight into `channel` would (a) violate the constraint and (b) fragment the channel breakdown (`sticker_window`, `sticker_door`, … would each be their own bucket instead of rolling up to one "sticker").

### The design: coarse `channel` + new fine `source`
Keep two fields with distinct jobs:

- **`channel`** (existing enum, unchanged): the coarse bucket the dashboard groups by — `app` / `web` / `sticker`. The CHECK constraint stays exactly as-is.
- **`source`** (NEW, `VARCHAR(32)` nullable): the fine tag — `sticker_window`, `sticker_door`, `sticker_counter`, `web`, `app`, etc. Drives the *later* per-sticker view; ignored by the MVP channel breakdown.

`'sticker_window'` rolls up to `'sticker'` **because the channel breakdown `GROUP BY channel`** — `channel` is always the coarse value, derived from the `src` prefix at capture time. The fine value lives only in `source`. No CHECK change, no rollup drift, and the existing `idx_offer_activations_offer_channel_status` index keeps working for the breakdown.

### Migration
`backend/db/migrations/0xx_offer_activation_source.sql`:
```sql
ALTER TABLE offer_activations ADD COLUMN IF NOT EXISTS source VARCHAR(32);
```
Nullable — existing rows keep `channel` and get `source = NULL` (backward compatible; they simply won't appear in the future per-sticker drill-down, which is fine). No index now (YAGNI — add a `(offer_id, source)` index with the per-sticker view plan).

### The `src` naming contract (lock this before programming stickers)
- **Format:** `sticker_<location>`, lowercase, underscores — e.g. `sticker_window`, `sticker_door`, `sticker_counter`, `sticker_poster`, `sticker_table`.
- **Coarse `channel` derivation (single rule, server-authoritative):**
  - `src` matches `^sticker` → `channel = 'sticker'` (bare `?src=sticker` still valid → `channel='sticker'`, `source='sticker'`).
  - `src === 'app'` → `channel = 'app'`.
  - otherwise / absent → `channel = 'web'`.
- **Window stickers point at the offers page:** `https://<host>/business/:id/offers?src=sticker_window`. (Door/node NFC remains the `/tap` check-in — a different event, not an offer-activation channel. This contract is only about offer-page stickers.)

### Capture changes (built in this plan)
- **`frontend-user/src/utils/activationChannel.js`** — `resolveActivationChannel(params)` returns **`{ channel, source }`** instead of a bare channel string:
  - `source` = normalized `src` (lowercase, `[a-z0-9_]`, ≤32 chars) or `'web'`/`'app'` default.
  - `channel` = coarse, derived from the rule above.
- **`frontend-user/src/api/offers.js`** — `activateOffer(offerId, { channel, source, anonId })` sends both.
- **`backend/utils/offerChannel.js`** — add `normalizeSource(raw)` (lowercase, strip to `[a-z0-9_]`, ≤32, else null) and, defensively, **derive/verify coarse channel from source server-side** so a client can't store a `source='sticker_window'` under `channel='web'` (keeps the rollup truthful). `normalizeChannel` stays the enum guard.
- **`backend/services/offerActivation.js`** `activate()` — accept + store `source` alongside `channel` (the `activate` INSERT/upsert gains the column).
- **`backend/routes/offers.js`** `POST /:id/activate` — read `source` from the body, pass to the service.
- **App (Plan 4)** will set `source` too when it builds native Activate — out of scope here, noted for consistency.

**Integrity note:** server normalizes `source` and derives `channel` from it — the client's coarse channel is advisory; the stored `channel` is server-computed so the breakdown is always honest. Mirrors the Plan 3 "strict by construction" stance.

---

## Part B — The Offer Performance dashboard (MVP)

### Where it lives
New route `/offer-performance` in `frontend-business`, rendered inside `AppShell`; new **"Offer Performance"** item in the Sidebar **Analytics** section (next to Ad Conversions). New page component `frontend-business/src/pages/OfferPerformance.jsx`.

### Backend endpoint
`GET /api/offers/performance?range=7d|30d|90d|all` (`requireBusiness`), scoped to `req.business.id`. Returns:
```json
{
  "success": true,
  "range": "30d",
  "totals":   { "activated": N, "visited": N, "bought": N, "attributed_sales": 0.0 },
  "by_offer": [
    { "offer_id": 1, "title": "...", "is_active": true,
      "activated": N, "visited": N, "bought": N,
      "activated_to_visited": 0.0, "visited_to_bought": 0.0,
      "attributed_sales": 0.0 }
  ],
  "by_channel": [
    { "channel": "sticker", "activated": N, "visited": N, "bought": N, "attributed_sales": 0.0 },
    { "channel": "web", ... }, { "channel": "app", ... }
  ]
}
```
- **Time filter:** `activated_at` within the range (activation-anchored). All downstream conversions for those activations count, even if they landed later (a 7-day attribution window means conversions lag — anchoring on activation keeps each cohort's funnel coherent). Documented in the UI as "by activation date."
- **Stage definitions (mirror the ad rollup, monotonic):**
  - `activated` = `COUNT(*)`.
  - `visited` = `COUNT(*) FILTER (WHERE status IN ('entry_conversion','qualified_sale'))` — physically present (checked in via `/tap` OR bought at the till; a till purchase is itself a visit).
  - `bought` = `COUNT(*) FILTER (WHERE status = 'qualified_sale')`.
  - `attributed_sales` = `COALESCE(SUM(sale_amount) FILTER (WHERE status = 'qualified_sale'), 0)`.
- **by_channel:** same metrics `GROUP BY channel` (the coarse rollup — `sticker_window`/`sticker_door` both fall under `sticker`).
- **by_offer:** offers with ≥1 activation in range (avoids listing every dormant offer at zero). Rates rounded like the ad page (`Math.round(x*10000)/100`).
- Single SQL pass for the per-offer + totals (JOIN `offers`), a second grouped query for `by_channel`. Mirror `ads/conversions` structure and error handling (500 + log on failure).

### Page layout (mirrors Conversions.jsx visual language)
1. **Header + range selector** — title "Offer Performance", subtitle "Activated → visited → bought, by activation date. Attributed sales = total spend on visits where an activated offer was applied." Range pills: 7d / 30d / 90d / All.
2. **Hero cards:** **Attributed sales £** (hero), Activated, Visited (`% of activated`), Bought (`% of visited`). No commission card.
3. **Per-offer funnel table:** Offer | Activated | Visited | Bought | Activated→visited | Visited→bought | Attributed sales. Empty state: "No offer activity in this period."
4. **Per-channel breakdown:** a compact table or card row — Channel (Window sticker / Web / App) | Activated | Visited | Bought | Attributed sales. This is the sticker-ROI proof.

### Explicitly out of MVP (later)
Offer × channel cross-tab (drill one offer into its channel split, reading `source` for per-sticker), trend/time-series charts, CSV export, "activated but never visited" leak metric (data exists via `expired`/no-conversion), and the **commission forecast** (when a real `commission_rate` is set).

---

## Architecture / data flow

```
Sticker (?src=sticker_window)
  → /business/:id/offers  → resolveActivationChannel() → { channel:'sticker', source:'sticker_window' }
  → activateOffer(offerId,{channel,source,anonId})
  → POST /api/offers/:id/activate → offerActivation.activate() stores channel + source
                                            │
        check-in /tap → entry_conversion    │  (funnel, Plan 3 — unchanged)
        till sale (staff-tagged) → qualified_sale + sale_amount
                                            ▼
  Business dashboard: GET /api/offers/performance?range=
    → rollups GROUP BY offer / GROUP BY channel (coarse) → OfferPerformance.jsx
```

## Error handling & edge cases
- Endpoint failure → 500 + logged, page shows a toast + empty state (mirrors Ad Conversions).
- Business with no offers / no activations → empty states, zeroed hero.
- `source` NULL on legacy rows → unaffected (channel breakdown still works; absent from future per-sticker view only).
- Division-by-zero in rates → guarded (`pct` helper pattern).
- A `qualified_sale` that skipped `entry_conversion` (bought without an NFC check-in) is still counted as "visited" (present at till) — keeps the funnel monotonic; definition stated in the UI.

## Privacy / GDPR
The dashboard returns **aggregate counts and sums per business only** — no customer identity, no `anon_id`, no PII. `anon_id` activations contribute to channel/funnel counts but are never exposed. The pre-launch GDPR pass (which covers `offer_activations` erasure/retention for `anon_id`) naturally flows through: erased rows simply drop from the aggregates. No new PII surface is created here.

## Testing approach
- **`resolveActivationChannel` ({channel, source})** + **`normalizeSource`** — unit tests (Vitest in frontend-user; node:test for the backend util), covering `sticker_window`→`{sticker, sticker_window}`, bare `sticker`, `app`, absent→`web`, and sanitization of junk input.
- **Backend route/service** — `node --check`; verified via curl + DB read (no route harness, per repo convention). Confirm channel rollup: a `sticker_window` activation appears under `channel='sticker'`.
- **`frontend-business` (OfferPerformance, Sidebar)** — no test harness (repo convention; see project memory `frontend-business-no-tests`). Verify via `npm run build` (built `VITE_UNLOCK_APP=true` to actually compile under the maintenance lockdown) + device.

## Dependencies / sequencing
- Independent of Plan 4 (native Activate). Plan 4 will set `source` when built; not required here.
- The `source` capture should ship **before** the user programs physical stickers, so the finer `src` is live when the stickers go out. Within this plan, the capture change (Part A) lands first, the dashboard (Part B) second.

## Self-review
- **Decision coverage:** all six locked decisions map to a section (placement → Part B "Where it lives"; 3 sections → Part B layout; time presets → endpoint + selector; channel-level + finer capture → Part A; attributed-sales definition → endpoint + header copy; commission omitted → hero/no-card). ✓
- **The #4 ask answered:** finer `src` stored in new `source`; coarse `channel` derived from `src` prefix server-side; breakdown `GROUP BY channel` → `sticker_window` rolls up to `sticker`; per-sticker view (later) groups by `source`. ✓
- **No incrementality overclaim:** metric labelled "Attributed sales" = gross post-discount spend on tagged visits. ✓
- **Ambiguities resolved:** funnel "visited" definition stated (monotonic, includes till-only buyers); time anchor = activation date with lag note; by_offer limited to offers with activity. ✓
- **Scope discipline:** cross-tab/trends/CSV/per-sticker view/commission explicitly deferred. ✓
