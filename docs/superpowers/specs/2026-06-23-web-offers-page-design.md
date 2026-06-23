# Web Business-Offers Page (Phase 1.5) — Design Spec

**Date:** 2026-06-23
**Status:** Approved for planning (decisions locked)
**Branch:** `feature/web-offers-page` (off `pre-staging`); merges to `pre-staging`, **not** `main`.
**Builds on:** Phase 1 web tap-earning (`docs/superpowers/specs/2026-06-22-web-tap-earning-design.md`).

## Problem

Two entry points need a web page that shows **a business's active offers (plural)**:
1. The window sticker **"Tap here to see our latest offers."**
2. After earning points, the reward overlay routes the customer to the business's offers.

Today the web SPA has only a single, **auth-gated** `/offer/:id` detail page (inside `AppShell`, which redirects logged-out users to `/login`). There is **no** "list a business's offers" page and **no** backend endpoint that returns more than one offer for a business. Phase 1's "Browse our latest offers" button pointed at a single offer (`/offer/:id`) as an explicitly deferred simplification — this spec delivers the real per-business offers experience.

## Locked decisions

1. **Public viewing, login only to claim.** The offers list and individual offer detail are viewable with **no login**. The *claim coupon* action requires auth (logged-out users get a "Sign in to claim" CTA).
2. **URL: `/business/:id/offers`.** ⚠️ **Sticker-URL contract** (flagged — this is the class of mismatch that bit us with `/tap` host/netlify): the physical "see our latest offers" sticker / node must encode `https://<host>/business/<businessId>/offers`, with `<host>` matching the build flavor (`tapprove.io` prod / `staging.tapprove.io` staging), exactly like the `/tap` NDEF URL. Web owns the route; the **node/sticker programming is a separate, non-web change** that must be coordinated before stickers ship. See "Sticker-URL contract" below.
3. **Post-earning destination = the business offers list** (`/business/:id/offers`), not a single offer.

## Architecture

### Backend — one new public endpoint
`GET /api/public/business/:id/offers` (in `backend/routes/public.js`, no auth):
```
200 → { success: true, business_name, business_logo_url, offers: [ {
         id, title, description, image_url, category, offer_type,
         original_price, offer_price, discount_percent, expires_at
       } ] }
404 → { success:false, code:'NOT_FOUND' }  // business id doesn't exist
```
- Returns **all `is_active = TRUE` offers** for the business, newest first (mirrors `loadJoinContext`'s offer query but without `LIMIT 1`, plus `business_logo_url`).
- `business_name` is returned **even when `offers` is empty** (drives the empty state).

### Web — public route group (outside `AppShell`)
`OfferDetail`'s only hard dependency on `AppShell` is `useLocation()` (which throws without `LocationProvider`). `OfferDetail` already reads location with optional chaining (`location?.lat`). So:

- Add `useOptionalLocation()` to `LocationContext.jsx` — `useContext(LocationContext)` returning `null` (no throw) when there's no provider. `OfferDetail` switches to it. (The existing throwing `useLocation()` stays for `AppShell` consumers like `Home`.)
- **Move `/offer/:id` out of the `AppShell` group** to a top-level public route (single definition; logged-in users simply view it full-screen without the bottom nav — it already renders its own back button and `page-full` layout).
- Add `/business/:id/offers` → new `BusinessOffers` page (public).

Both new public routes sit alongside `/tap` (top-level, no `PublicRoute`, no `AppShell`).

**No netlify change.** `/business/:id/offers` and `/offer/:id` are served by the existing `/* → /index.html` catch-all. Do **not** add a proxy rule (that was the `/tap` bug).

### Web — `BusinessOffers` page (`pages/BusinessOffers.jsx`)
- Reads `:id` from the route, calls `getBusinessOffers(id)`.
- Header: business logo + name + "Latest offers".
- Body: list of offer rows (a focused local card — image/emoji + title + offer-type/price + expiry), each navigating to `/offer/:id`.
- **Empty state:** `No Offers Currently Available for {business_name}` when `offers` is empty.
- Error state (business not found / fetch fails): friendly message + a link to the app/home.
- Loading: spinner.
- Uses a **lightweight local card**, not the existing `OfferCard` — `OfferCard` carries save/share/story/rating actions that assume auth and geo, which don't fit a public per-business list. Keep it simple.

### Web — API client
Add to `frontend-user/src/api/public.js`:
```js
export const getBusinessOffers = (businessId) =>
  client.get(`/api/public/business/${Number(businessId)}/offers`).then((r) => r.data);
```

### Web — claim flow when logged out (`OfferDetail`)
- `OfferDetail` already computes `canClaim = isAuth && !capReached && !isExpired`.
- When `!isAuth`, the primary CTA becomes **"Sign in to claim"** → `navigate('/login')`. (Stashing a return-to-offer path is out of scope; a logged-out claimer signs in and lands on `/home` — acceptable for this iteration.)
- Viewing, image, description, business info, share, directions all work logged-out (directions degrade gracefully with `location == null`).

### Web — overlay rewire (`PointsOverlay` + `CheckInOverlayProvider` + `Tap.jsx`)
- The overlay's conditional CTA changes from a single-offer link to **"See our latest offers"** → `navigate('/business/:businessId/offers')`.
- The overlay context stores the **businessId** for the CTA (replacing the single `offer` object). `Tap.jsx`, after a successful check-in, determines whether the business has any active offers and, if so, provides the businessId to the overlay.
  - Implementation: `Tap.jsx` calls `getBusinessOffers(business)` in the background; if `offers.length > 0`, it sets the overlay's offers target to `business`. (Replaces the Phase 1 `getStrangerDisplay → setOffer(todays_offer)` wiring.)
- Till (Phase 2) is unaffected.

## Sticker-URL contract (flagged for coordination)

Mirrors the `/tap` NDEF contract:
- **URL:** `https://<APP_BASE_URL>/business/<businessId>/offers`
- `<APP_BASE_URL>` is the node build flavor host (`tapprove.io` prod / `staging.tapprove.io` staging) — same `BuildConfig.APP_BASE_URL` used for `/tap`.
- **Action item (non-web):** whoever programs the physical "see our latest offers" stickers / the node app's URL generation must use this exact path + host. Until stickers are programmed to staging for testing, verify via a typed URL (`https://staging.tapprove.io/business/<id>/offers`), exactly as we did for `/tap`.
- **No App Links entry needed** for `/business/...` unless we want the native app to intercept it; default is browser → web SPA, which is the intent (this is the web offers experience).

## Non-goals (this iteration)

- No save/share/story/rating on the public list (those stay on the authed surfaces).
- No return-to-offer after login from the claim CTA.
- No changes to the native app, the node sticker programming (only the contract is defined here), or `/till`.
- No geolocation/distance on the business offers list.
- Not promoted to `main` — stays on `pre-staging` for the pre-launch promotion.

## Testing

- **Backend:** the new endpoint returns active offers for a business; returns `business_name` with an empty `offers` array when none; 404 for unknown business. (Match existing `backend` test style.)
- **Web unit/component (Vitest + Testing Library):**
  - `getBusinessOffers` client posts to the right URL.
  - `BusinessOffers`: renders list from mocked data; renders the exact empty-state string with the business name; row click navigates to `/offer/:id`; loading + error states.
  - `OfferDetail` public: renders logged-out (mocked `getOffer`, no `LocationProvider`) without throwing; claim CTA shows "Sign in to claim" when logged out and navigates to `/login`.
  - `useOptionalLocation` returns null with no provider (no throw).
  - Overlay: "See our latest offers" navigates to `/business/:id/offers`; shown only when a businessId target is set.
- **Manual on staging:** typed `staging.tapprove.io/business/<id>/offers` → list + empty state; tap-earn → overlay → "See our latest offers" → list → open an offer → "Sign in to claim".

## Rollout

Build on `feature/web-offers-page`, TDD + two-stage review (as Phase 1), merge to `pre-staging`, verify on staging. The sticker-URL contract is handed off for node/sticker programming separately.
