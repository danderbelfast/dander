# Offer Attribution — Plan 2: Web Activate UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let web users **activate** offers (the attribution intent event) from every offer surface, see them in a repurposed **My Offers** tab, with capture-first-then-sign-in for anonymous taps and `anon_id→user_id` stitch on login — channel-stamped (`web`, or `sticker` via `?src`).

**Architecture:** New web API client over Plan 1's activate endpoints; an `anonId` (localStorage UUID) + `activationChannel` (reads `?src`) util; a shared `ActivateButton`; the `/coupons` tab repurposed to a `MyOffers` page; stitch wired into `AuthContext.login()`; one new backend stitch route.

**Tech Stack:** React 18 + Vite + Vitest/Testing Library (web has full TDD); Express (one route).

**Spec:** `docs/superpowers/specs/2026-06-23-offer-attribution-design.md`. **Builds on Plan 1** (`offer_activations` + `/api/offers/:id/activate`, `/activated`, `offerActivation` service — all live on staging).
**Branch:** worktree off `pre-staging`. **GDPR:** `anon_id` is privacy-flagged — staging only; consent/erasure gated to the GDPR pass before real users.

**IA decision (locked):** repurpose the stale **Coupons** tab → **My Offers**; drop archival coupons from the UI (rows stay in DB). Web bottom nav stays 4 tabs: Discover / **My Offers** / Saved / Profile.

---

## Task 1: Backend — stitch route

**Files:** Modify `backend/routes/offers.js`

> Plan 1 added `offerActivation.stitchAnonToUser`. Expose it. `POST /api/offers/activations/stitch` is unambiguous (no `/:id` collision). No DB locally → verify on staging.

- [ ] **Step 1:** Add the route near the other activation routes (after `/:id/activate`):
```js
// ---------------------------------------------------------------------------
// POST /api/offers/activations/stitch — claim this device's anon activations
// for the now-authenticated user. Called once on login/register.
// Body: { anon_id: string }
// ---------------------------------------------------------------------------
router.post('/activations/stitch', requireAuth, async (req, res) => {
  const anonId = typeof req.body?.anon_id === 'string' ? req.body.anon_id.slice(0, 100) : null;
  if (!anonId) return ok(res, { stitched: 0 });   // nothing to stitch; not an error
  try {
    const stitched = await offerActivation.stitchAnonToUser(pool, { anonId, userId: req.user.id });
    return ok(res, { stitched });
  } catch (err) {
    console.error('[offers/activations/stitch POST]', err);
    return fail(res, 500, 'SERVER_ERROR', 'Failed to stitch activations.');
  }
});
```

- [ ] **Step 2:** `node --check routes/offers.js` → exit 0.
- [ ] **Step 3:** Commit:
```bash
git add backend/routes/offers.js
git commit -m "feat: POST /api/offers/activations/stitch (anon→user on login)"
```

---

## Task 2: `anonId` util (TDD)

**Files:** Create `frontend-user/src/services/anonId.js` (+ `.test.js`)

- [ ] **Step 1: Failing test** — `frontend-user/src/services/anonId.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { getAnonId } from './anonId';

describe('anonId', () => {
  beforeEach(() => { localStorage.clear(); });

  it('creates and persists a stable id', () => {
    const a = getAnonId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(10);
    expect(getAnonId()).toBe(a);                 // stable across calls
    expect(localStorage.getItem('tapprove_anon_id')).toBe(a);  // persisted
  });
});
```

- [ ] **Step 2:** `npm test -- anonId` → FAIL (no module).

- [ ] **Step 3: Implement** `frontend-user/src/services/anonId.js`:
```js
// Stable per-device anonymous id for pre-login offer activations.
// GDPR: this is a device identifier — privacy-flagged. Consent/erasure is
// handled by the GDPR pass; do not ship to real users before that lands.
const KEY = 'tapprove_anon_id';

export function getAnonId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage unavailable — return an ephemeral id (won't persist/stitch).
    return crypto?.randomUUID?.() ?? `anon-${Date.now()}`;
  }
}
```

- [ ] **Step 4:** `npm test -- anonId` → PASS.
- [ ] **Step 5:** Commit:
```bash
git add src/services/anonId.js src/services/anonId.test.js
git commit -m "feat: anonId device id for anon offer activation (GDPR-flagged)"
```

---

## Task 3: `activationChannel` util (TDD)

**Files:** Create `frontend-user/src/utils/activationChannel.js` (+ `.test.js`)

- [ ] **Step 1: Failing test** — `frontend-user/src/utils/activationChannel.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { resolveActivationChannel } from './activationChannel';

describe('resolveActivationChannel', () => {
  it('returns sticker when ?src=sticker', () => {
    expect(resolveActivationChannel(new URLSearchParams('src=sticker'))).toBe('sticker');
  });
  it('defaults to web otherwise', () => {
    expect(resolveActivationChannel(new URLSearchParams(''))).toBe('web');
    expect(resolveActivationChannel(new URLSearchParams('src=whatever'))).toBe('web');
  });
});
```

- [ ] **Step 2:** `npm test -- activationChannel` → FAIL.

- [ ] **Step 3: Implement** `frontend-user/src/utils/activationChannel.js`:
```js
// The web SPA is channel 'web', except when reached from a window sticker
// (it carries ?src=sticker). Anything else is treated as 'web'.
export function resolveActivationChannel(searchParams) {
  return searchParams?.get?.('src') === 'sticker' ? 'sticker' : 'web';
}
```

- [ ] **Step 4:** `npm test -- activationChannel` → PASS.
- [ ] **Step 5:** Commit:
```bash
git add src/utils/activationChannel.js src/utils/activationChannel.test.js
git commit -m "feat: resolveActivationChannel (web vs sticker via ?src)"
```

---

## Task 4: Web API client (TDD)

**Files:** Modify `frontend-user/src/api/offers.js`; Test `frontend-user/src/api/offers.activations.test.js`

- [ ] **Step 1: Failing test** — `frontend-user/src/api/offers.activations.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./client', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
import client from './client';
import { activateOffer, deactivateOffer, getMyOffers, stitchActivations } from './offers';

describe('offer activation api', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('activateOffer posts channel (+ anon_id when given)', async () => {
    client.post.mockResolvedValue({ data: { success: true } });
    await activateOffer(7, { channel: 'web' });
    expect(client.post).toHaveBeenCalledWith('/api/offers/7/activate', { channel: 'web' });
    await activateOffer(7, { channel: 'sticker', anonId: 'a1' });
    expect(client.post).toHaveBeenLastCalledWith('/api/offers/7/activate', { channel: 'sticker', anon_id: 'a1' });
  });

  it('deactivateOffer deletes (anon_id in body when given)', async () => {
    client.delete.mockResolvedValue({ data: { success: true } });
    await deactivateOffer(7, { anonId: 'a1' });
    expect(client.delete).toHaveBeenCalledWith('/api/offers/7/activate', { data: { anon_id: 'a1' } });
  });

  it('getMyOffers GETs /activated', async () => {
    client.get.mockResolvedValue({ data: { success: true, offers: [] } });
    await getMyOffers();
    expect(client.get).toHaveBeenCalledWith('/api/offers/activated');
  });

  it('stitchActivations posts anon_id', async () => {
    client.post.mockResolvedValue({ data: { success: true, stitched: 2 } });
    const r = await stitchActivations('a1');
    expect(client.post).toHaveBeenCalledWith('/api/offers/activations/stitch', { anon_id: 'a1' });
    expect(r.stitched).toBe(2);
  });
});
```

- [ ] **Step 2:** `npm test -- offers.activations` → FAIL.

- [ ] **Step 3: Implement** — append to `frontend-user/src/api/offers.js`:
```js
// ── Offer activation (attribution) ───────────────────────────
export const activateOffer = (id, { channel, anonId } = {}) =>
  client.post(`/api/offers/${id}/activate`, { channel, ...(anonId ? { anon_id: anonId } : {}) }).then((r) => r.data);

export const deactivateOffer = (id, { anonId } = {}) =>
  client.delete(`/api/offers/${id}/activate`, anonId ? { data: { anon_id: anonId } } : undefined).then((r) => r.data);

export const getMyOffers = () =>
  client.get('/api/offers/activated').then((r) => r.data);

export const stitchActivations = (anonId) =>
  client.post('/api/offers/activations/stitch', { anon_id: anonId }).then((r) => r.data);
```

- [ ] **Step 4:** `npm test -- offers.activations` → PASS (4).
- [ ] **Step 5:** Commit:
```bash
git add src/api/offers.js src/api/offers.activations.test.js
git commit -m "feat: web offer-activation api client"
```

---

## Task 5: `ActivateButton` (TDD) — the shared capture-first control

**Files:** Create `frontend-user/src/components/offers/ActivateButton.jsx` (+ `.test.jsx`)

Behavior: authed → `activateOffer(id,{channel})`, toggles to "Activated ✓" (and can deactivate). Anon → `activateOffer(id,{channel,anonId})`, then toast **"Activated! Sign in to save to My Offers"** with a Sign-in action that stashes the return path and routes to `/login` (stitch happens on login). Channel comes from the current URL (`resolveActivationChannel`).

- [ ] **Step 1: Failing test** — `frontend-user/src/components/offers/ActivateButton.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (o) => ({ ...(await o()), useNavigate: () => navigateMock,
  useSearchParams: () => [new URLSearchParams('')] }));
const toastMock = vi.fn();
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('../../api/offers', () => ({ activateOffer: vi.fn().mockResolvedValue({ success: true }), deactivateOffer: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock('../../services/anonId', () => ({ getAnonId: () => 'anon-test' }));
vi.mock('../../services/returnPath', () => ({ setReturnPath: vi.fn() }));

import { activateOffer } from '../../api/offers';
import { setReturnPath } from '../../services/returnPath';
let authState = { isAuth: true };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState }));
import ActivateButton from './ActivateButton';

const renderBtn = (props) => render(<MemoryRouter><ActivateButton offerId={7} {...props} /></MemoryRouter>);

describe('ActivateButton', () => {
  beforeEach(() => { vi.clearAllMocks(); authState = { isAuth: true }; });

  it('authed: activates with channel web, shows Activated state', async () => {
    renderBtn();
    await userEvent.click(screen.getByRole('button', { name: /^activate$/i }));
    expect(activateOffer).toHaveBeenCalledWith(7, { channel: 'web' });
    expect(await screen.findByRole('button', { name: /activated/i })).toBeInTheDocument();
  });

  it('anon: activates with anon_id, toasts, and offers a "Sign in to save" link', async () => {
    authState = { isAuth: false };
    renderBtn();
    await userEvent.click(screen.getByRole('button', { name: /^activate$/i }));
    expect(activateOffer).toHaveBeenCalledWith(7, { channel: 'web', anonId: 'anon-test' });
    expect(toastMock).toHaveBeenCalled();   // plain "Activated! Sign in to save…"
    const signin = await screen.findByRole('button', { name: /sign in to save/i });
    await userEvent.click(signin);
    expect(setReturnPath).toHaveBeenCalledWith('/my-offers');  // returnTo default
    expect(navigateMock).toHaveBeenCalledWith('/login');
  });
});
```

- [ ] **Step 2:** `npm test -- ActivateButton` → FAIL.

- [ ] **Step 3: Implement** `frontend-user/src/components/offers/ActivateButton.jsx`:
```jsx
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { activateOffer, deactivateOffer } from '../../api/offers';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getAnonId } from '../../services/anonId';
import { setReturnPath } from '../../services/returnPath';
import { resolveActivationChannel } from '../../utils/activationChannel';

// Capture-first activation control. Authed → toggles activation. Anon →
// captures the intent against anon_id (the funnel signal) then nudges sign-in
// to persist into My Offers (stitched on login). Channel from the URL (?src).
export default function ActivateButton({ offerId, initialActivated = false, className = '', returnTo }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAuth } = useAuth();
  const { toast } = useToast();
  const [activated, setActivated] = useState(initialActivated);
  const [busy, setBusy] = useState(false);

  async function onClick(e) {
    e.preventDefault(); e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const channel = resolveActivationChannel(params);
    try {
      if (isAuth) {
        if (activated) { await deactivateOffer(offerId); setActivated(false); }
        else           { await activateOffer(offerId, { channel }); setActivated(true); }
      } else {
        await activateOffer(offerId, { channel, anonId: getAnonId() });
        setActivated(true);
        // Toast has no action button (see ToastContext) — plain nudge; the
        // persistent "Sign in to save" link below is the real affordance.
        toast({ type: 'success', title: 'Activated!', message: 'Sign in to save it to My Offers.' });
      }
    } catch {
      toast({ type: 'error', title: 'Something went wrong', message: 'Could not activate this offer.' });
    } finally {
      setBusy(false);
    }
  }

  function goSignIn() {
    setReturnPath(returnTo || '/my-offers');
    navigate('/login');
  }

  return (
    <>
      <button
        className={`btn ${activated ? 'btn-secondary' : 'btn-primary'} ${className}`.trim()}
        onClick={onClick}
        disabled={busy}
        aria-pressed={activated}
      >
        {activated ? 'Activated ✓' : 'Activate'}
      </button>
      {!isAuth && activated && (
        <button type="button" className="btn btn-ghost" style={{ marginTop: 6 }} onClick={goSignIn}>
          Sign in to save
        </button>
      )}
    </>
  );
}
```

- [ ] **Step 4:** `npm test -- ActivateButton` → PASS. Then full `npm test` green.
- [ ] **Step 5:** Commit:
```bash
git add src/components/offers/ActivateButton.jsx src/components/offers/ActivateButton.test.jsx
git commit -m "feat: ActivateButton (capture-first anon activation)"
```

> Toast API confirmed: `toast({title,message,type,duration,offerId})` — **no `action`**. Plan uses a plain toast + the persistent inline "Sign in to save" button (above), which is more discoverable than a transient toast anyway.

---

## Task 6: My Offers page + tab repurpose

**Files:** Create `frontend-user/src/pages/MyOffers.jsx` (+ `.test.jsx`); Modify `frontend-user/src/components/layout/BottomNav.jsx`, `frontend-user/src/App.jsx`

- [ ] **Step 1: Failing test** — `frontend-user/src/pages/MyOffers.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
vi.mock('react-router-dom', async (o) => ({ ...(await o()), useNavigate: () => vi.fn() }));
vi.mock('../api/offers', () => ({ getMyOffers: vi.fn() }));
vi.mock('../utils/imageUrl', () => ({ resolveImageUrl: (u) => u }));
import { getMyOffers } from '../api/offers';
import MyOffers from './MyOffers';

const renderPage = () => render(<MemoryRouter><MyOffers /></MemoryRouter>);

describe('MyOffers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('lists activated offers', async () => {
    getMyOffers.mockResolvedValue({ success: true, offers: [{ id: 7, title: '20% off pastries', business_name: 'Joe' }] });
    renderPage();
    expect(await screen.findByText('20% off pastries')).toBeInTheDocument();
  });

  it('shows an empty state when none', async () => {
    getMyOffers.mockResolvedValue({ success: true, offers: [] });
    renderPage();
    expect(await screen.findByText(/no activated offers/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2:** `npm test -- "pages/MyOffers"` → FAIL.

- [ ] **Step 3: Implement** `frontend-user/src/pages/MyOffers.jsx`:
```jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyOffers } from '../api/offers';
import { Spinner } from '../components/ui/Spinner';
import { resolveImageUrl } from '../utils/imageUrl';

// My Offers — the customer's activated offers (Lidl-style), to apply at the
// till. Replaces the retired Coupons tab. Activated offers auto-hide at offer
// expiry (server filters); expired rows are retained server-side for analytics.
export default function MyOffers() {
  const navigate = useNavigate();
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyOffers()
      .then((d) => { if (alive) setOffers(Array.isArray(d.offers) ? d.offers : []); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  if (error) return (
    <div className="page" style={{ padding: 24, textAlign: 'center' }}>
      <div className="empty-state"><div className="empty-state-icon">😕</div>
        <div className="empty-state-title">Couldn't load your offers</div></div>
    </div>
  );
  if (offers === null) return (
    <div className="page" style={{ justifyContent: 'center', alignItems: 'center' }}><Spinner /></div>
  );

  return (
    <div className="page" style={{ padding: 16, overflowY: 'auto' }}>
      <h1 className="auth-title" style={{ marginBottom: 4 }}>My Offers</h1>
      <p className="text-muted" style={{ marginBottom: 16 }}>Activated offers — show up and ask staff to apply them at the till.</p>
      {offers.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div className="empty-state-icon">🏷️</div>
          <div className="empty-state-title">No activated offers yet</div>
          <p className="text-muted">Activate offers from Discover and they'll appear here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {offers.map((o) => (
            <div key={o.id} className="offer-card" role="button" tabIndex={0}
              onClick={() => navigate(`/offer/${o.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/offer/${o.id}`); } }}>
              <div className="offer-card-img">
                {o.image_url ? <img src={resolveImageUrl(o.image_url)} alt={o.title} loading="lazy" />
                  : <div className="offer-card-img-placeholder">🏪</div>}
              </div>
              <div className="offer-card-body">
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>{o.business_name}</div>
                <div className="offer-card-title">{o.title}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Repurpose the tab.** In `frontend-user/src/components/layout/BottomNav.jsx`, change the Coupons item to:
```jsx
  {
    to: '/my-offers',
    label: 'My Offers',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41 11 3.83V8H7a4 4 0 0 0-4 4v0M3 12l9.59 9.59a2 2 0 0 0 2.83 0l6.17-6.17a2 2 0 0 0 0-2.83" /><circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" />
      </svg>
    ),
  },
```
(Replace the existing `{ to: '/coupons', label: 'Coupons', ... }` object only; leave Discover/Saved/Profile.)

- [ ] **Step 5: Routing.** In `frontend-user/src/App.jsx`:
- Add import: `import MyOffers from './pages/MyOffers';`
- Inside the `AppShell` group, add: `<Route path="/my-offers" element={<MyOffers />} />`
- Replace the existing `<Route path="/coupons" element={<MyCoupons />} />` with a redirect: `<Route path="/coupons" element={<Navigate to="/my-offers" replace />} />` (keep the `MyCoupons` import or remove it; if removed, also drop `/coupons/claimed` + its import). Minimal: keep imports, just repoint `/coupons`. `Navigate` is already imported in App.jsx.

- [ ] **Step 6:** `npm test -- "pages/MyOffers"` → PASS; full `npm test` green; `npm run build` succeeds.
- [ ] **Step 7:** Commit:
```bash
git add src/pages/MyOffers.jsx src/pages/MyOffers.test.jsx src/components/layout/BottomNav.jsx src/App.jsx
git commit -m "feat: My Offers tab (repurpose Coupons → activated offers)"
```

---

## Task 7: Stitch on login (AuthContext)

**Files:** Modify `frontend-user/src/context/AuthContext.jsx`

- [ ] **Step 1:** Add imports:
```jsx
import { getAnonId } from '../services/anonId';
import { stitchActivations } from '../api/offers';
```

- [ ] **Step 2:** In the `login` callback, after `setUser(userData);`, add a fire-and-forget stitch:
```jsx
  const login = useCallback((accessToken, refreshToken, userData) => {
    setAccessToken(accessToken);
    localStorage.setItem('tapprove_refresh', refreshToken);
    setUser(userData);
    // Claim any anon offer activations made on this device before sign-in.
    stitchActivations(getAnonId()).catch(() => {});
  }, []);
```

- [ ] **Step 3:** `npm test` (full) → green (AuthContext has no test importing login side-effects; if a test breaks because `stitchActivations` isn't mocked, that's a real mock gap — mock `../api/offers` in that test. Report if so.). `npm run build` → success.
- [ ] **Step 4:** Commit:
```bash
git add src/context/AuthContext.jsx
git commit -m "feat: stitch anon activations to user on login"
```

---

## Task 8: Activate buttons on the three surfaces

**Files:** Modify `frontend-user/src/pages/OfferDetail.jsx`, `frontend-user/src/pages/BusinessOffers.jsx`, `frontend-user/src/components/offers/OfferCard.jsx`

- [ ] **Step 1: OfferDetail** — import `ActivateButton` and render it inside the bottom `detail-cta` block, ABOVE the "Redeem in store" guidance:
```jsx
import ActivateButton from '../components/offers/ActivateButton';
```
In the `<div className="detail-cta">`, before the "🏪 Redeem in store" block:
```jsx
        <ActivateButton offerId={offer.id} className="btn-block btn-lg" returnTo={`/offer/${offer.id}`} initialActivated={offer.is_activated ?? false} />
```
(`offer.is_activated` may be undefined — defaults to false; harmless.)

- [ ] **Step 2: BusinessOffers cards** — import `ActivateButton`; in each offer row's `offer-card-body`, after the price line, add (stop propagation is built into the button):
```jsx
                <div style={{ marginTop: 8 }}>
                  <ActivateButton offerId={o.id} returnTo={`/business/${id}/offers`} />
                </div>
```

- [ ] **Step 3: Discover cards** — in `frontend-user/src/components/offers/OfferCard.jsx`, import `ActivateButton` and add a quick-activate to the `OfferCard` body (the full-width list card), e.g. after the `offer-card-meta` row:
```jsx
import ActivateButton from './ActivateButton';
```
```jsx
          <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
            <ActivateButton offerId={offer.id} returnTo={`/offer/${offer.id}`} />
          </div>
```
(The button already calls `stopPropagation`; the wrapper is belt-and-braces so the card's navigate doesn't fire.)

- [ ] **Step 4:** Full `npm test` green; `npm run build` succeeds. (No new test required for placement — `ActivateButton` is unit-tested; placement is visual, verified on staging.)
- [ ] **Step 5:** Commit:
```bash
git add src/pages/OfferDetail.jsx src/pages/BusinessOffers.jsx src/components/offers/OfferCard.jsx
git commit -m "feat: Activate buttons on offer detail, business-offers, and Discover cards"
```

---

## Task 9: Merge + staging verify

- [ ] **Step 1:** Full `npm test` (all green) + `npm run build` (success).
- [ ] **Step 2:** Merge to `pre-staging` (FF), push (deploys staging frontend + the stitch route to staging-api).
- [ ] **Step 3: Manual on staging** (device-testing is the user's; do the automatable curl for stitch):
  - `My Offers` tab shows activated offers (after activating); empty state otherwise.
  - Logged-out activate from a card → "Activated! Sign in to save" → sign in → offer appears in My Offers (stitch worked).
  - Activate from `/business/:id/offers?src=sticker` → channel recorded as `sticker` (verify row via DB/dashboard later).
  - curl stitch (needs a user JWT — note as user-verified): `POST /api/offers/activations/stitch {anon_id}`.

---

## Self-Review

**Spec coverage:** activate from all surfaces (Tasks 5,8) ✓; My Offers tab repurpose (Task 6) ✓; capture-first anon + toast sign-in nudge (Task 5) ✓; stitch on login (Tasks 1,7) ✓; channel web/sticker via ?src (Task 3, used in Task 5) ✓; GDPR-flagged anon_id (Tasks 2 comments) ✓.
**Placeholders:** none — complete code per step.
**Type/name consistency:** `activateOffer(id,{channel,anonId})`, `deactivateOffer(id,{anonId})`, `getMyOffers()`, `stitchActivations(anonId)`; `getAnonId()`; `resolveActivationChannel(params)`; `ActivateButton({offerId,initialActivated,returnTo,className})` — consistent across tasks.
**Flags for implementer:** (a) confirm `toast({action})` API exists, else fallback (Task 5 note); (b) GDPR gate on anon_id — staging only.
