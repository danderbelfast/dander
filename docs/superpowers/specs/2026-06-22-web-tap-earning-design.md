# Web Tap-Earning — Design Spec

**Date:** 2026-06-22
**Status:** Approved for planning
**Scope:** `frontend-user` PWA (+ one `netlify.toml` change). **No backend changes required.**

## Problem

When a customer taps an NFC tag (or scans a QR), the URL is
`https://tapprove.io/tap?node=<id>&business=<id>`. On Android this is an App Link
meant to open the native app — but App Links are unreliable across devices
(Samsung, Solana Seeker, multiple countries), so many customers land on the
**website** instead. Today the web has no way to award points: only the native
app can earn. We need a logged-in customer to earn points on the web, the full
**check-in loop**, so earning never depends on the native app opening.

## Goal

The `frontend-user` PWA owns `/tap` (and `/till`) and runs a state machine that
branches on the tapper's auth state. **Every branch terminates in the points
overlay** — the tap context (`node`, `business`) carries through any
login/registration and is replayed so earning happens at the end.

## Key architectural finding

The earn logic is already a backend HTTP capability (`awardPointsAndAdvance()` in
`backend/services/loyaltyMechanics.js`), and the native app is a thin client over
it. The web PWA already shares the same backend, the same Bearer-JWT axios client
(`frontend-user/src/api/client.js`), and rehydrates a session on cold load via a
refresh token in localStorage (`AuthContext.jsx`). **Every endpoint this feature
needs already exists.** This is a frontend feature plus one routing flip.

## Decisions (locked)

- **Till scope:** logged-in-till only. A logged-out till tap routes through auth
  then `till-arrive`; points land only if staff is still at the till. No backend
  queueing. (Documented limitation, addable later.)
- **New-user path:** auto-login + replay. The backend's `verify-2fa`
  (registration OTP) endpoint already returns access + refresh tokens; the web app
  currently discards them. We use them to log the new user in and replay the tap
  immediately — no second login, no second OTP.
- **Stranger view:** a React landing screen inside the SPA (not a redirect to the
  backend HTML page), keeping the sign-up funnel in the PWA.
- **"Browse offers" destination:** link to the latest active offer's `/offer/:id`.
  A per-business offers *list* page is future scope.

## Phasing

The check-in loop needs **no Socket.IO**; till does. The two phases ship
independently — **till must not block the check-in win.**

- **Phase 1 — Web check-in earning** (the primary goal): tap context carrier,
  `postAuthDestination` chokepoint, `/tap` route + landing, proximity API client,
  PointsOverlay, Login/Register wiring, netlify routing flip.
- **Phase 2 — Till via Socket.IO** (fast-follow): `socket.io-client`, web
  `userSocket`/`useUserSocket`, `/till` route, overlay fed by the async
  `points_awarded` event. Self-contained; if the socket plumbing gets heavy it
  ships after Phase 1 rather than gating it.

---

## The resume-after-auth flow (the core unknown)

### Tap context carrier — `services/tapContext.js`

Stores `{ node, business, ts }` in **sessionStorage** (survives page reload and
same-tab SPA navigation through login/register). **30-minute TTL** and
**clear-on-consume**, so a stale or abandoned tap cannot replay against the wrong
business later. API: `setPendingTap({node, business})`, `getPendingTap()` (returns
null if missing/expired), `clearPendingTap()`.

### Single chokepoint — `utils/postAuthDestination.js`

`postAuthDestination()` returns `/tap?node=…&business=…` if a valid pending tap
exists, else `/home`. Wired into the three (and only three) places where a session
becomes real:

| Case | Trigger | Wiring |
|---|---|---|
| Returning, session restored | `AuthContext` rehydrates from refresh token → already authed when `/tap` loads | No login needed; `/tap` earns directly |
| Returning, logged out | `Login.jsx` `handleCredentials` (direct token) **and** `handleTotp` (after email 2FA) | Replace `navigate('/home', …)` with `navigate(postAuthDestination(), …)` |
| Brand-new user | `Register.jsx` `handleVerify` (after registration OTP) | `authLogin(returned tokens)` then `navigate(postAuthDestination())` — replaces the current bounce to `/login` |

All three converge on `postAuthDestination()`, so replay logic exists once. The
replayed `/tap` is now authed and takes the earn branch. The backend same-day
guard makes replay idempotent (no double award).

### Three user journeys

1. **Logged in:** `/tap` → (after `AuthContext.loading`) earn immediately →
   PointsOverlay → background check for an active offer → conditional "Browse our
   latest offers" button.
2. **Logged out, has account:** `/tap` → TapLanding → "Sign in" → stash pending
   tap → `/login` → on success → replay `/tap` → PointsOverlay.
3. **New user:** `/tap` → TapLanding ("Welcome to [Business]'s loyalty program,
   powered by TapProve" + offer preview + "Create account") → stash pending tap →
   `/register` → OTP → auto-login → replay `/tap` → PointsOverlay.

A fourth path, **"Open in app,"** is offered on the landing for users who prefer
the native app (best-effort `intent://` on Android falling back to the store;
kept deliberately minimal since the https App Link already failed to open the app).

---

## `/tap` route state machine — `pages/Tap.jsx`

```
1. Wait for AuthContext.loading === false   (cold-start race guard)
2. Parse node, business from query
   - invalid/missing → redirect to "/"
3. isAuth ?
   YES → POST /api/proximity/nfc-checkin { node_device_id: node, business_id: business }
         - success → trigger PointsOverlay(result)
                   → background getStrangerDisplay(business); if todays_offer →
                     enable "Browse our latest offers" → /offer/{todays_offer.id}
         - 401     → treat as logged out → go to NO branch
         - other   → error state with retry
   NO  → render TapLanding(business)
         - getStrangerDisplay(business) → name + todays_offer preview
         - fireStrangerVisit({node, business})  (best-effort, fires kiosk display)
         - CTAs: [Sign in] [Create account] [Open in app]
           Sign in / Create account → setPendingTap({node,business}) → /login | /register
```

The route is **not** wrapped in `PublicRoute` (it handles auth itself) and **not**
in `AppShell` (full-screen, no bottom nav).

## `/till` route — `pages/Till.jsx` (Phase 2)

```
1. Wait for AuthContext.loading === false
2. Parse business
3. isAuth ?
   YES → POST /api/proximity/till-arrive { business_id } → "waiting for till" state
         → socket points_awarded event → PointsOverlay
   NO  → TapLanding-style sign-in prompt → after auth → replay /till → arrive
```

Documented limitation: a logged-out till tapper only earns if staff is still at
the till when auth completes; a full registration at the counter is too slow.

## PointsOverlay — `components/checkin/PointsOverlay.jsx`

This is the reward moment; give it genuine care without gold-plating.

- Coin burst + points count-up, business name, "+N POINTS!", tier-upgrade badge,
  streak (🔥), rewards/collectables unlocked.
- Reward-tier variants drive intensity (matching native): `standard` (subtle),
  `bronze` ("Lucky!"), `silver` ("Amazing!"), `gold` ("JACKPOT!") — coin count,
  banner, tint, and haptic strength scale up.
- Reuse existing `services/hapticService` and `services/soundService`.
- Web (CSS / Web Animations API) re-implementation of the native RN screen — a
  re-implementation, not a port.
- Conditional "Browse our latest offers" button below the points (shown only when
  the business has an active offer) → `/offer/{id}`. A close action → `/home`.
- Because the overlay is fed both synchronously (`/tap`) and asynchronously (till
  socket), it is driven by a global `context/CheckInOverlayProvider.jsx` with a
  `triggerCheckInOverlay(result)` function.

---

## Files

**New (`frontend-user/src/`):**

- `pages/Tap.jsx`, `pages/Till.jsx` *(Till = Phase 2)*
- `components/checkin/TapLanding.jsx`
- `components/checkin/PointsOverlay.jsx`
- `context/CheckInOverlayProvider.jsx`
- `api/proximity.js` — `nfcCheckin()`, `tillArrive()`
- `api/public.js` — `getStrangerDisplay(businessId)`, `fireStrangerVisit({node,business})`
- `services/tapContext.js`, `utils/postAuthDestination.js`
- `services/userSocket.js`, `hooks/useUserSocket.js` *(Phase 2)*

**Changed:**

- `App.jsx` — add `/tap` (Phase 1) and `/till` (Phase 2) routes; mount
  `CheckInOverlayProvider`; mount `useUserSocket` (Phase 2).
- `pages/Login.jsx` — both success paths use `postAuthDestination()`.
- `pages/Register.jsx` — `handleVerify` auto-logs-in with returned tokens and uses
  `postAuthDestination()`; import `useAuth`.
- `netlify.toml` — remove the `/tap` and `/till` proxy redirects so `/* →
  /index.html` hands both to react-router.
- `package.json` — add `socket.io-client` *(Phase 2)*.

## Backend — reuse only

| Need | Existing endpoint | Auth |
|---|---|---|
| Earn (check-in) | `POST /api/proximity/nfc-checkin` | customer JWT |
| Till arrive | `POST /api/proximity/till-arrive` | customer JWT |
| Landing data + offer preview | `GET /api/public/business/:id/stranger-display` → `business_name`, `todays_offer`, `visitor_count_today` | none |
| Fire kiosk "new visitor" | `POST /api/public/nfc-stranger` | none |
| Till award → web | existing Socket.IO `points_awarded` event | — |

**Verify (not build) in Phase 2:** the backend Socket.IO user-room
handshake/auth, by matching what native `app/src/services/userSocket.ts` already
does successfully.

## Routing change detail

`netlify.toml` currently proxies `/tap → /api/public/tap` and `/till →
/api/public/join`. Remove both blocks; the existing `/* → /index.html` rewrite
(status 200, so the URL and query string are preserved for react-router) then
serves the SPA. App Links are unaffected — they are OS-level intent filters on the
real domain; the native app still intercepts `/tap` before the browser. The
backend stranger HTML page remains but is no longer the web destination.

## Risks / bigger-than-it-looks

1. **Socket.IO is a new web subsystem** (Phase 2) — new dependency, connection
   lifecycle tied to auth, reconnection, must match the backend handshake exactly.
   Heaviest plumbing; till is its only consumer. Isolated in Phase 2 so it cannot
   block Phase 1.
2. **PointsOverlay is a re-implementation** of the native animated screen — the
   main UI effort; easy to make it feel cheap. Budget care here.
3. **Till logged-out / new-user-at-counter is unsupported** in real time — shipped
   as a documented limitation.
4. **"Browse offers" reaches only the latest offer** — no per-business list screen
   exists; accepted simplification.
5. **"Open in app" may no-op** — the https App Link already failed; kept minimal.
6. **Cold-start race** — `/tap` must wait for `AuthContext.loading` before
   deciding earn-vs-stranger, or restored sessions are wrongly shown the landing.
7. **Pending-tap staleness** — mitigated by 30-min TTL + clear-on-consume.

## Non-goals (this iteration)

Native app changes; BLE background proximity; queued/deferred till awards; a
per-business offers list page; iOS-specific app-open handling beyond a basic
button.

## Testing

- **Unit:** `tapContext` (stash / TTL expiry / clear-on-consume),
  `postAuthDestination` (pending tap vs none).
- **Component:** `Tap.jsx` branches (authed-earn, stranger-landing,
  invalid-params) with mocked auth + API; replay paths (login & register →
  `/tap`).
- **Manual on pre-staging:** real-device tap logged-in; logged-out → login →
  replay; new-user → register → replay; (Phase 2) till with a staff ring-up.

## Build target

Branch: `pre-staging` (per request).
