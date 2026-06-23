# Offer Attribution — "Physical AdWords for Offers" (Design Spec)

**Date:** 2026-06-23
**Status:** Draft for review (decisions locked; Lidl-activate model folded in)
**Branch target:** build on `pre-staging` (held off `main`); deploy to staging.
**Builds on / supersedes:** the Phase 1.5 offers pages (`2026-06-23-web-offers-page-design.md`) and the offer-CTA "redeem at the till" change. Reuses the existing **ad** attribution chain (`ad_clicks` + `adAttribution.js`) as the reference implementation.

## Goal

Track **which offer** a customer engaged with and on **which channel** (app / web / window sticker), and link that to a later **check-in** and **till purchase**, so businesses see **per-offer, per-channel conversion analytics** ("Offer A drove 12 visits / 3 sales via sticker; Offer B drove 3 / 1 via web"). This is the offers-equivalent of the visit-attribution chain — core product, not polish.

## The reframe: *activate* is the attribution event (Lidl model)

Instead of inferring intent from a passive view, the customer takes an explicit action — **Activate** — which is the clean, deterministic intent event:

- Users get a **"My Offers"** surface listing available offers, each with an **Activate** button.
- They activate offers ahead of time; activated offers live in their list; **expired ones auto-remove**.
- **Activated offers apply at the till** — staff see the customer's *activated* offers in the TillPanel and apply them.
- This is **not** the old coupon/QR system (no codes, no QR scans) — just a lightweight **activate → apply-at-till** flow. It re-introduces a small user-action-on-offer layer that Option A had stripped, but deliberately and minimally.

**Activating an offer = the tracked intent/impression event:** `(offer_id, channel, user_id|anon_id, activated_at)`. Deterministic intent, not inference. The funnel becomes:

```
activate (intent, channel-stamped)  →  check-in (entry_conversion)  →  till purchase w/ applied offer (qualified_sale)
```

## Locked decisions

1. **Till attribution = deterministic.** Staff **tag the applied offer** in the TillPanel (records `offer_id` on the purchase). Window-inference is backfill only.
2. **Last-touch** credit for v1 (the most-recent activation wins when multiple are open). Multi-touch later.
3. **Anonymous capture via `anon_id`** (cookie/localStorage UUID), **stitched to `user_id` on login/check-in**.
4. **7-day attribution window** (reuse the ad chain's window).
5. **Tracking-only first** — compute/forecast, don't bill yet (mirror `ad_conversion_rates`/`commission_amount`).
6. **Channel param baked into sticker URLs now** — `…/business/:id/offers?src=sticker`, `/tap?...&src=sticker` — folded into the sticker-URL contract before physical stickers are programmed (adding later = re-stickering).

## Data model

Mirror `ad_clicks`, offer-flavored. New table `offer_activations` is the heart of the funnel:

```
offer_activations (
  id                  uuid pk default gen_random_uuid(),
  offer_id            int  → offers(id)      on delete cascade,
  business_id         int  → businesses(id)  on delete cascade,   -- denormalised for fast dashboard rollups
  user_id             int  → users(id)       null,                -- known customer
  anon_id             text null,                                  -- pre-login device id; stitched later
  channel             text check in ('app','web','sticker'),      -- where Activate was tapped
  status              text check in ('activated','entry_conversion','qualified_sale','expired')
                          default 'activated',
  activated_at        timestamptz default now(),
  entry_conversion_at timestamptz,            -- set on check-in
  sale_conversion_at  timestamptz,            -- set on till purchase
  sale_amount         numeric(10,2),
  commission_rate     numeric(5,4) default 0.0000,   -- tracking-only for now
  commission_amount   numeric(10,2),
  offer_expires_at    timestamptz,            -- copy of the offer's expiry → drives auto-remove from My Offers
  unique (offer_id, user_id),                 -- one active activation per (offer, user); anon handled separately
  ...indexes on (user_id, business_id, status), (offer_id, channel, status), (anon_id)
)
```

Notes:
- **One open activation per (offer, user)** — re-activating is idempotent (refresh timestamp/channel), not a new row.
- `channel` is the surface where Activate was tapped — deterministic, no separate impression-channel table needed.
- Keep the existing `offer_views` table as a soft top-of-funnel metric (passive views), **separate** from the activation funnel — optional for the dashboard, not part of attribution.
- Reuse `ad_conversion_rates` shape (or a sibling `offer_conversion_rates`) for the tracking-only commission forecast.

## Surfaces, channel capture & identity

| Surface | Channel | Identity | Notes |
|---|---|---|---|
| App — My Offers / offers list / offer detail | `app` | user_id | Activate button on each offer |
| Web (PWA) — offers / offer detail / business-offers page | `web` | user_id or anon_id | Activate button |
| Window sticker → `/business/:id/offers?src=sticker` | `sticker` | anon_id → user_id | The `?src=` sets the channel |

- **Activate when logged in** → writes `user_id` + channel immediately into My Offers.
- **Activate when logged out** (esp. sticker/public web) → capture against an `anon_id` and prompt **sign in / create account to save to My Offers** — reusing the Phase 1 **resume-after-auth** machinery (`tapContext`/`returnPath` + `postAuthDestination`) to replay the activate after auth, then **stitch `anon_id → user_id`** so the channel-stamped intent survives.
- The Phase 1.5 offer CTA ("Redeem in store" guidance) gains the **Activate** action as its primary button; the redemption guidance stays as the secondary "how it works" line. (No QR, no codes.)

## Conversion hooks (new `offerAttribution` service — cousin of `adAttribution`)

- **On check-in** (`nfc-checkin`, alongside the existing `adAttribution.onCustomerArrived`): bump this user's open `activated` rows for that business within the 7-day window → `entry_conversion`.
- **On till purchase** (`till/award-points`, alongside `adAttribution.onCustomerPurchased`): the staff **tagged** `offer_id` → set that activation row to `qualified_sale` (+ `sale_amount`, forecast commission). Backfill: if untagged, last-touch window match.
- **Auto-expire**: a row whose `offer_expires_at < now()` (or window elapsed) → `expired`; drives auto-remove from My Offers.

## TillPanel change

`till-arrive` currently pushes **all** the business's active offers. Change it to push the **customer's activated offers** (the subset they intend to redeem) → staff apply + **tag which offer** they applied (the deterministic signal for decision #1). Falls back to the full active-offers list if the customer has none activated.

## Dashboard analytics (per offer × channel funnel)

Per offer, broken down by channel: **activations → entry_conversions (visits) → qualified_sales (£)** + conversion rates, over a selectable period. Plus an optional passive-views column from `offer_views`. Forecast commission shown (tracking-only).

## Fit with the till-applied redemption model — confirmed

This **strengthens** the till model rather than conflicting with it: redemption is still staff-applied at the till (no customer-side QR/codes). The only addition is that the TillPanel now shows the customer's **activated** offers (precise intent) instead of the whole catalogue, and staff tag what they applied. Loyalty points still accrue via the existing till award. The "activate" layer is the intent signal; the till remains the human-verified redemption + purchase-attribution point (which keeps the valuable purchase data fraud-resistant).

## Sticker-URL contract update

Add a `src` channel param to the programmed URLs **now**:
- Offers sticker: `https://<host>/business/<id>/offers?src=sticker`
- Check-in sticker: `https://<host>/tap?node=<id>&business=<id>&src=sticker`

`<host>` per build flavor (prod/staging) as already specified. The web/app surfaces set channel from their own context (`app`/`web`); only the sticker needs to self-declare via `?src`.

## Non-goals (v1)

- No billing/charging (tracking-only).
- No multi-touch attribution (last-touch only).
- No QR/codes/coupon resurrection.
- No change to footfall (node sensor) or the ad chain.

## Resolved decisions (were open questions)

- **Anon activation depth — RESOLVED:** capture the anon intent at the Activate tap (write the `offer_activations` row against `anon_id` + channel), then **prompt sign-in/create-account to persist into My Offers**, reusing the Phase 1 resume-after-auth machinery to replay the activate, and **stitch `anon_id → user_id`**. **GDPR:** `anon_id` is a device identifier and is the **privacy-flagged** part of this feature — it must be handled under the existing GDPR work (consent/notice, retention, the per-business BLE-salt-style hygiene, and erasure must cover `offer_activations.anon_id` and the stitch mapping). Keep this connected to the GDPR pass, not bolted on later.
- **Auto-remove timing — RESOLVED:** remove activated offers **from the user's view at offer expiry only**. **Do NOT** add a no-visit window — we explicitly want to retain "activated but didn't convert" rows for analytics. `expired` rows stay in `offer_activations` for the funnel; they're just hidden from My Offers once the offer itself expires.

## Build phasing (for the plan)

1. `offer_activations` table + `offerActivation`/activate API (activate/deactivate/list My Offers).
2. Activate UI: My Offers surface + Activate buttons (app + web), channel capture, anon + resume-after-auth + stitch.
3. `offerAttribution` service + check-in/till hooks; TillPanel "applied offer" tagging.
4. Dashboard per-offer/per-channel funnel.
5. Sticker-URL `?src` contract (coordinate with node/sticker programming).

Reuse `ad_clicks`/`adAttribution.js` as the working reference throughout.
