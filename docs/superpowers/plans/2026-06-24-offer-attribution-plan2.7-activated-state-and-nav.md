# Offer Attribution — Plan 2.7: Activated-state store + BusinessOffers navigation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps, TDD.

**Goal:** (Issue 2 — priority) Give the app a single client-side source of truth for "has this user activated this offer," so the Activate control shows **Activated ✓** consistently everywhere an offer appears (detail, cards, My Offers) — not just momentarily on click. (Issue 1) Give the public `/business/:id/offers` page a way off (back control + bottom-nav-when-authed) so logged-in / non-activating users aren't trapped.

**Why now:** Today nothing tells the button an offer is already activated — the backend returns no `is_activated`, `OfferDetail` passes `offer.is_activated ?? false` (always false), and the "Activated ✓" flip is purely local to a fresh click and lost on navigation. Users tapping an offer from My Offers see "Activate" again, confused whether it worked. And `BusinessOffers` is full-screen with no nav and no back, stranding logged-in users.

**Architecture:** A small `ActivatedOffersProvider` React context, mounted at app root inside the auth/toast providers. On auth it seeds a `Set` of activated offer IDs from `getMyOffers()` (already the user's live activated offers) and exposes `isActivated(id)` / `markActivated(id)` / `markDeactivated(id)`. `ActivateButton` reads `isActivated(offerId)` for its displayed state (replacing the unreliable `initialActivated` prop) and updates the store on activate/deactivate, so all instances re-render in sync. IDs normalized via `String()`. Anon users → empty store → "Activate" (anon activate routes to register; post-signup the store seeds from My Offers with the stitched offer). Accepted transient: a cold deep-link to an already-activated offer may briefly show "Activate" until the store seeds — self-corrects. **Upgrade path if that flash ever annoys: add backend `is_activated` to the detail endpoint (noted, not built).**

**Tech Stack:** React + Vitest. **Branch:** worktree `feature/offer-attr-state-and-nav` off `pre-staging`.

**Definition of done (device-verified on staging):**
- (a) Activate an offer (authed) → navigate away and back / open it from My Offers → still shows **Activated ✓**;
- (b) the same offer on a Discover/business card also shows **Activated ✓**;
- (c) deactivate → reverts to **Activate** everywhere;
- (d) on `/business/:id/offers`, a logged-in user has a working **back control + bottom nav** (not trapped); logged-out users still see the page (back control only).

---

## Task 1: `ActivatedOffersProvider` context (TDD)

**Files:** Create `frontend-user/src/context/ActivatedOffersContext.jsx` (+ `.test.jsx`)

- Provider: `const { isAuth } = useAuth();` seeds `Set` of `String(o.id)` from `getMyOffers()` in an effect keyed on `isAuth` (clears to empty when logged out; swallows fetch errors). Exposes `isActivated(id)=ids.has(String(id))`, `markActivated`/`markDeactivated` (immutable Set update).
- `useActivatedOffers()` returns a **graceful no-op fallback** (`isActivated: () => false`, no-op marks) when no provider is present, so any surface/test rendering a button without the provider doesn't crash.
- Test (probe component): seeds from `getMyOffers` (id in list → activated after `waitFor`); `markActivated`/`markDeactivated` toggle; fallback outside provider returns `false` and marks don't throw.

## Task 2: Mount provider in `App.jsx`

- Wrap `<Routes>` + `<PointsOverlay/>` in `<ActivatedOffersProvider>` (inside `CheckInOverlayProvider`; App already lives inside `AuthProvider`/`ToastProvider` per `main.jsx`). Full `npm test` + `npm run build` still green.

## Task 3: `ActivateButton` consumes the store (TDD)

- Replace local `useState(initialActivated)` with `const { isActivated, markActivated, markDeactivated } = useActivatedOffers();` → `const activated = isActivated(offerId);`. On authed activate → `markActivated(offerId)`; deactivate → `markDeactivated(offerId)`. Anon path unchanged. Remove the `initialActivated` prop; drop it from `OfferDetail.jsx`.
- Test: extend `ActivateButton.test.jsx` — mock `useActivatedOffers` with controllable `isActivated` + spies; assert activated state renders "Activated ✓", authed activate calls `markActivated`, deactivate calls `markDeactivated`, anon path unchanged.

## Task 4: "Activated ✓" badge on My Offers cards (TDD)

- The My Offers list is the activated set by definition — add a small `Activated ✓` badge to each card for clarity. Test asserts the badge renders for a listed offer.

## Task 5: BusinessOffers navigation (TDD)

- Add a back control (history-aware: `navigate(-1)` if `window.history.length > 1`, else `navigate(isAuth ? '/home' : '/')`) and render `<BottomNav/>` when `isAuth`, with bottom padding so the fixed nav doesn't cover the last card.
- Test: extend `BusinessOffers.test.jsx` — mock `useAuth`; authed → bottom nav present (Discover/My Offers links) + back control; logged-out → no bottom nav, back control present.

## Task 6: Verify + merge

- Full `npm test` (green) + `npm run build` (success). FF-merge to `pre-staging`, push, clean up worktree. User device-verifies DoD (a)–(d).
