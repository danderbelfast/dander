# Web Business-Offers Page (Phase 1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public per-business offers page (`/business/:id/offers`) with individual offers viewable without login (claim requires auth and returns you to the offer), and route the post-earning overlay to it.

**Architecture:** One new public backend endpoint lists a business's active offers. The web SPA gets a public `BusinessOffers` page plus public `/offer/:id` (un-gated from `AppShell` by making `OfferDetail`'s location dependency optional). "Sign in to claim" reuses the Phase 1 `postAuthDestination` chokepoint via a new `returnPath` stash. The check-in overlay's CTA points at the business offers list.

**Tech Stack:** React 18, react-router-dom 6, Vite 5, Vitest + Testing Library (frontend); Express + pg (backend).

**Spec:** `docs/superpowers/specs/2026-06-23-web-offers-page-design.md`
**Branch:** `feature/web-offers-page` (off `pre-staging`; merges to `pre-staging`, not `main`).
**Run frontend commands from `frontend-user/`.**

---

## File Structure

**Create:**
- `frontend-user/src/services/returnPath.js` (+ `.test.js`) — safe internal return-path stash (sessionStorage, TTL).
- `frontend-user/src/pages/BusinessOffers.jsx` (+ `.test.jsx`) — public per-business offers list + empty state.

**Modify:**
- `backend/routes/public.js` — add `GET /business/:id/offers`.
- `frontend-user/src/api/public.js` — add `getBusinessOffers`.
- `frontend-user/src/context/LocationContext.jsx` — add `useOptionalLocation`.
- `frontend-user/src/utils/postAuthDestination.js` (+ `.test.js`) — fall back to return path.
- `frontend-user/src/pages/OfferDetail.jsx` (+ new `.test.jsx`) — optional location; logged-out claim → return-path + `/login`; hide save when logged out.
- `frontend-user/src/App.jsx` — move `/offer/:id` to public; add `/business/:id/offers`.
- `frontend-user/src/context/CheckInOverlayProvider.jsx` (+ `.test.jsx`) — `offer`→`offersBusinessId`.
- `frontend-user/src/components/checkin/PointsOverlay.jsx` (+ `.test.jsx`) — CTA → business offers list.
- `frontend-user/src/pages/Tap.jsx` (+ `.test.jsx`) — overlay offers target via `getBusinessOffers`.

---

## Task 1: returnPath service

**Files:**
- Create: `frontend-user/src/services/returnPath.js`
- Test: `frontend-user/src/services/returnPath.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend-user/src/services/returnPath.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setReturnPath, getReturnPath, clearReturnPath, RETURN_PATH_TTL_MS } from './returnPath';

describe('returnPath', () => {
  beforeEach(() => { sessionStorage.clear(); vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns null when nothing is stashed', () => {
    expect(getReturnPath()).toBeNull();
  });

  it('stashes and reads back a safe internal path', () => {
    setReturnPath('/offer/3');
    expect(getReturnPath()).toBe('/offer/3');
  });

  it('clears on demand', () => {
    setReturnPath('/offer/3');
    clearReturnPath();
    expect(getReturnPath()).toBeNull();
  });

  it('rejects unsafe paths (absolute URL or protocol-relative)', () => {
    setReturnPath('https://evil.com');
    expect(getReturnPath()).toBeNull();
    setReturnPath('//evil.com');
    expect(getReturnPath()).toBeNull();
    setReturnPath('not-a-path');
    expect(getReturnPath()).toBeNull();
  });

  it('expires after the TTL and self-clears', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T10:00:00Z'));
    setReturnPath('/offer/3');
    vi.setSystemTime(new Date('2026-06-23T10:00:00Z').getTime() + RETURN_PATH_TTL_MS + 1);
    expect(getReturnPath()).toBeNull();
    expect(sessionStorage.getItem('tapprove_return_path')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- returnPath`
Expected: FAIL — cannot import `./returnPath`.

- [ ] **Step 3: Implement `returnPath.js`**

Create `frontend-user/src/services/returnPath.js`:
```js
// Stashes a safe internal return path so the post-auth chokepoint can send a
// user back where they were (e.g. an offer they tried to claim) after login.
// Mirrors tapContext: sessionStorage, 30-min TTL. Only same-origin internal
// paths are accepted (must start with a single '/').

const KEY = 'tapprove_return_path';
export const RETURN_PATH_TTL_MS = 30 * 60 * 1000; // 30 minutes

function isSafeInternalPath(p) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');
}

export function setReturnPath(path) {
  if (!isSafeInternalPath(path)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path, ts: Date.now() }));
  } catch { /* storage unavailable — ignore */ }
}

export function getReturnPath() {
  let raw;
  try { raw = sessionStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;

  let parsed;
  try { parsed = JSON.parse(raw); } catch { clearReturnPath(); return null; }

  const fresh = typeof parsed?.ts === 'number' && (Date.now() - parsed.ts) <= RETURN_PATH_TTL_MS;
  if (!isSafeInternalPath(parsed?.path) || !fresh) {
    clearReturnPath();
    return null;
  }
  return parsed.path;
}

export function clearReturnPath() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- returnPath`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/returnPath.js src/services/returnPath.test.js
git commit -m "feat: returnPath stash for post-auth return-to-offer"
```

---

## Task 2: postAuthDestination — fall back to return path

**Files:**
- Modify: `frontend-user/src/utils/postAuthDestination.js`
- Modify: `frontend-user/src/utils/postAuthDestination.test.js`

- [ ] **Step 1: Add failing tests**

Append these tests inside the existing `describe('postAuthDestination', ...)` block in `frontend-user/src/utils/postAuthDestination.test.js` (and add the import at the top of the file: `import { setReturnPath, clearReturnPath as clearRet } from '../services/returnPath';`):
```js
  it('returns the stashed return path when no tap is pending', () => {
    setReturnPath('/offer/3');
    expect(postAuthDestination()).toBe('/offer/3');
  });

  it('consumes (clears) the return path after returning it', () => {
    setReturnPath('/offer/3');
    postAuthDestination();
    expect(postAuthDestination()).toBe('/home');
  });

  it('pending tap wins over a return path', () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    setReturnPath('/offer/3');
    expect(postAuthDestination()).toBe('/tap?node=node-abc&business=42');
  });
```
Also ensure the existing `beforeEach` clears both: change it to:
```js
  beforeEach(() => { clearPendingTap(); clearRet(); });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test -- postAuthDestination`
Expected: FAIL — return-path cases fail (current code only knows pending tap).

- [ ] **Step 3: Update `postAuthDestination.js`**

Replace the contents of `frontend-user/src/utils/postAuthDestination.js` with:
```js
import { getPendingTap } from '../services/tapContext';
import { getReturnPath, clearReturnPath } from '../services/returnPath';

// Where to send a user the moment a session becomes real. Priority:
//  1. A pending NFC tap → replay it (the /tap route consumes it after award).
//  2. A stashed return path (e.g. an offer they tried to claim) → consumed here.
//  3. Otherwise the home screen.
export function postAuthDestination() {
  const pending = getPendingTap();
  if (pending) {
    const node = encodeURIComponent(pending.node);
    const business = encodeURIComponent(String(pending.business));
    return `/tap?node=${node}&business=${business}`;
  }
  const ret = getReturnPath();
  if (ret) { clearReturnPath(); return ret; }
  return '/home';
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `npm test -- postAuthDestination`
Expected: PASS — original 3 + 3 new.

- [ ] **Step 5: Commit**

```bash
git add src/utils/postAuthDestination.js src/utils/postAuthDestination.test.js
git commit -m "feat: postAuthDestination falls back to stashed return path"
```

---

## Task 3: useOptionalLocation

**Files:**
- Modify: `frontend-user/src/context/LocationContext.jsx`
- Test: `frontend-user/src/context/LocationContext.optional.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend-user/src/context/LocationContext.optional.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useOptionalLocation } from './LocationContext';

function Probe() {
  const loc = useOptionalLocation();
  return <span data-testid="v">{loc === null ? 'null' : 'ctx'}</span>;
}

describe('useOptionalLocation', () => {
  it('returns null when there is no LocationProvider (no throw)', () => {
    render(<Probe />);
    expect(screen.getByTestId('v').textContent).toBe('null');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- LocationContext.optional`
Expected: FAIL — `useOptionalLocation` not exported.

- [ ] **Step 3: Add the hook**

In `frontend-user/src/context/LocationContext.jsx`, add this export right after the existing `useLocation` function (do not modify `useLocation`):
```jsx
// Non-throwing variant for components that may render outside a LocationProvider
// (e.g. the public /offer/:id route). Returns null when no provider is present.
export function useOptionalLocation() {
  return useContext(LocationContext);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- LocationContext.optional`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/context/LocationContext.jsx src/context/LocationContext.optional.test.jsx
git commit -m "feat: useOptionalLocation (non-throwing) for public routes"
```

---

## Task 4: Backend — list a business's active offers

**Files:**
- Modify: `backend/routes/public.js`

> **Note on testing:** the backend test suite is `node --test utils/*.test.js` — pure-function tests only; routes are not unit-tested in this repo and there is no DB test harness. Per "follow existing patterns," this endpoint is verified by the web component tests (which mock it) and the manual staging step in Task 10, not a new backend test.

- [ ] **Step 1: Add the route handler**

In `backend/routes/public.js`, insert this handler immediately AFTER the `GET /business/:id/stranger-display` handler (after its closing `});`, before the `stranger-milestone` section):
```js
// ---------------------------------------------------------------------------
// GET /api/public/business/:id/offers
//
// All active offers for a business (newest first) + business name/logo. No
// auth — powers the web "see our latest offers" page (window sticker + the
// post-earning overlay). business_name is returned even when there are no
// offers so the page can render its empty state.
// ---------------------------------------------------------------------------

router.get('/business/:id/offers', async (req, res) => {
  const businessId = parseInt(req.params.id, 10);
  if (!Number.isFinite(businessId)) {
    return res.status(400).json({ success: false, code: 'INVALID_ID', message: 'business id must be numeric.' });
  }
  try {
    const { rows: bizRows } = await pool.query(
      'SELECT id, name, logo_url FROM businesses WHERE id = $1 LIMIT 1',
      [businessId]
    );
    if (bizRows.length === 0) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Business not found.' });
    }
    const { rows: offers } = await pool.query(
      `SELECT id, title, description, image_url, category, offer_type,
              original_price, offer_price, discount_percent, expires_at
         FROM offers
        WHERE business_id = $1 AND is_active = TRUE
        ORDER BY created_at DESC`,
      [businessId]
    );
    return res.status(200).json({
      success: true,
      business_name: bizRows[0].name,
      business_logo_url: bizRows[0].logo_url,
      offers,
    });
  } catch (err) {
    console.error('[public/business/:id/offers]', err);
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Failed to load offers.' });
  }
});
```

- [ ] **Step 2: Lint the backend file**

Run (from repo root): `cd backend && npm run lint -- routes/public.js || true`
Expected: no new errors introduced by the added handler. (Return to `frontend-user/` afterward for subsequent tasks.)

- [ ] **Step 3: Commit**

```bash
git add backend/routes/public.js
git commit -m "feat: public GET /api/public/business/:id/offers (active offers list)"
```

---

## Task 5: getBusinessOffers API client

**Files:**
- Modify: `frontend-user/src/api/public.js`
- Test: `frontend-user/src/api/public.businessOffers.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend-user/src/api/public.businessOffers.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

import client from './client';
import { getBusinessOffers } from './public';

describe('getBusinessOffers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('GETs the business offers endpoint and returns data', async () => {
    client.get.mockResolvedValue({ data: { success: true, business_name: 'Joe Coffee', offers: [{ id: 1 }] } });
    const res = await getBusinessOffers(4);
    expect(client.get).toHaveBeenCalledWith('/api/public/business/4/offers');
    expect(res.offers).toHaveLength(1);
    expect(res.business_name).toBe('Joe Coffee');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- public.businessOffers`
Expected: FAIL — `getBusinessOffers` not exported.

- [ ] **Step 3: Add the client function**

Append to `frontend-user/src/api/public.js`:
```js
// All active offers for a business (+ name/logo). Unauthenticated — powers the
// web business offers page.
export const getBusinessOffers = (businessId) =>
  client.get(`/api/public/business/${Number(businessId)}/offers`).then((r) => r.data);
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- public.businessOffers`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/api/public.js src/api/public.businessOffers.test.js
git commit -m "feat: getBusinessOffers api client"
```

---

## Task 6: BusinessOffers page

**Files:**
- Create: `frontend-user/src/pages/BusinessOffers.jsx`
- Test: `frontend-user/src/pages/BusinessOffers.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend-user/src/pages/BusinessOffers.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig();
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../api/public', () => ({ getBusinessOffers: vi.fn() }));
vi.mock('../utils/imageUrl', () => ({ resolveImageUrl: (u) => u }));

import { getBusinessOffers } from '../api/public';
import BusinessOffers from './BusinessOffers';

function renderAt(id = '4') {
  return render(
    <MemoryRouter initialEntries={[`/business/${id}/offers`]}>
      <Routes><Route path="/business/:id/offers" element={<BusinessOffers />} /></Routes>
    </MemoryRouter>
  );
}

describe('BusinessOffers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the business name and its offers', async () => {
    getBusinessOffers.mockResolvedValue({
      success: true, business_name: 'Joe Coffee', business_logo_url: null,
      offers: [{ id: 7, title: '20% off pastries', description: 'All day', offer_price: null, discount_percent: 20 }],
    });
    renderAt();
    expect(await screen.findByText('Joe Coffee')).toBeInTheDocument();
    expect(screen.getByText('20% off pastries')).toBeInTheDocument();
  });

  it('shows the empty state with the business name when there are no offers', async () => {
    getBusinessOffers.mockResolvedValue({ success: true, business_name: 'Joe Coffee', offers: [] });
    renderAt();
    expect(await screen.findByText('No Offers Currently Available for Joe Coffee')).toBeInTheDocument();
  });

  it('navigates to the offer detail when an offer is clicked', async () => {
    getBusinessOffers.mockResolvedValue({
      success: true, business_name: 'Joe Coffee', offers: [{ id: 7, title: '20% off pastries' }],
    });
    renderAt();
    await userEvent.click(await screen.findByText('20% off pastries'));
    expect(navigateMock).toHaveBeenCalledWith('/offer/7');
  });

  it('shows an error state when the fetch fails', async () => {
    getBusinessOffers.mockRejectedValue(new Error('boom'));
    renderAt();
    expect(await screen.findByText(/couldn't load offers/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- "pages/BusinessOffers"`
Expected: FAIL — cannot import `./BusinessOffers`.

- [ ] **Step 3: Implement `BusinessOffers.jsx`**

Create `frontend-user/src/pages/BusinessOffers.jsx`:
```jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getBusinessOffers } from '../api/public';
import { Spinner } from '../components/ui/Spinner';
import { resolveImageUrl } from '../utils/imageUrl';

function fmt(p) { return p != null ? `£${parseFloat(p).toFixed(2)}` : null; }

// Public per-business offers page. Reached from the window sticker
// (/business/:id/offers) and the post-earning overlay. No auth required to view.
export default function BusinessOffers() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    getBusinessOffers(id)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="page-full" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-full" style={{ padding: 24, textAlign: 'center' }}>
        <div className="empty-state">
          <div className="empty-state-icon">😕</div>
          <div className="empty-state-title">Couldn't load offers</div>
          <p className="text-muted">Please try again.</p>
        </div>
      </div>
    );
  }

  const name = data.business_name || 'this business';
  const offers = Array.isArray(data.offers) ? data.offers : [];

  return (
    <div className="page-full" style={{ overflowY: 'auto', padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
        {data.business_logo_url
          ? <img src={resolveImageUrl(data.business_logo_url)} alt={name} style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} />
          : <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1f29', fontSize: '1.4rem' }}>🏪</div>}
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>{name}</div>
          <div className="text-muted" style={{ fontSize: '0.9rem' }}>Latest offers</div>
        </div>
      </header>

      {offers.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 40 }}>
          <div className="empty-state-icon">🏷️</div>
          <div className="empty-state-title">No Offers Currently Available for {name}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {offers.map((o) => (
            <div
              key={o.id}
              className="offer-card"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/offer/${o.id}`)}
            >
              <div className="offer-card-img">
                {o.image_url
                  ? <img src={resolveImageUrl(o.image_url)} alt={o.title} loading="lazy" />
                  : <div className="offer-card-img-placeholder">🏪</div>}
              </div>
              <div className="offer-card-body">
                <div className="offer-card-title">{o.title}</div>
                {o.description && (
                  <div className="text-muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>{o.description}</div>
                )}
                {(o.offer_price != null || o.discount_percent != null) && (
                  <div style={{ marginTop: 6, fontWeight: 700, color: '#FF6B35' }}>
                    {o.offer_price != null ? fmt(o.offer_price) : `${Math.round(o.discount_percent)}% off`}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- "pages/BusinessOffers"`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/pages/BusinessOffers.jsx src/pages/BusinessOffers.test.jsx
git commit -m "feat: public BusinessOffers page with empty state"
```

---

## Task 7: OfferDetail — public viewing + return-to-offer claim

**Files:**
- Modify: `frontend-user/src/pages/OfferDetail.jsx`
- Test: `frontend-user/src/pages/OfferDetail.public.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend-user/src/pages/OfferDetail.public.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig();
  return { ...actual, useNavigate: () => navigateMock };
});

// Logged OUT
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isAuth: false }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../context/PwaInstallContext', () => ({ usePwa: () => ({ trackOfferView: vi.fn(), trackCouponClaim: vi.fn() }) }));
vi.mock('../services/alertService', () => ({ couponClaimed: vi.fn() }));
vi.mock('../api/coupons', () => ({ generateCoupon: vi.fn() }));
vi.mock('../api/offers', () => ({
  getOffer: vi.fn().mockResolvedValue({ offer: { id: 3, title: 'Free coffee', business_name: 'Joe', is_saved: false } }),
  recordView: vi.fn().mockResolvedValue({}),
  saveOffer: vi.fn(), unsaveOffer: vi.fn(), trackShare: vi.fn(),
}));
const setReturnPathMock = vi.fn();
vi.mock('../services/returnPath', () => ({ setReturnPath: (...a) => setReturnPathMock(...a) }));

import OfferDetail from './OfferDetail';

function renderAt(id = '3') {
  return render(
    // NOTE: deliberately NO LocationProvider — proves public render works.
    <MemoryRouter initialEntries={[`/offer/${id}`]}>
      <Routes><Route path="/offer/:id" element={<OfferDetail />} /></Routes>
    </MemoryRouter>
  );
}

describe('OfferDetail (public, logged out)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the offer without a LocationProvider (no throw)', async () => {
    renderAt();
    expect(await screen.findByText(/free coffee/i)).toBeInTheDocument();
  });

  it('claim CTA says "Sign in to claim", stashes return path, goes to /login', async () => {
    renderAt();
    const btn = await screen.findByRole('button', { name: /sign in to claim/i });
    await userEvent.click(btn);
    expect(setReturnPathMock).toHaveBeenCalledWith('/offer/3');
    expect(navigateMock).toHaveBeenCalledWith('/login');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- "OfferDetail.public"`
Expected: FAIL — currently `useLocation()` throws without a provider, and the CTA text is "Log in to claim" with a different onClick.

- [ ] **Step 3: Edit `OfferDetail.jsx`**

(a) Change the location import. Replace:
```jsx
import { useLocation } from '../context/LocationContext';
```
with:
```jsx
import { useOptionalLocation } from '../context/LocationContext';
import { setReturnPath } from '../services/returnPath';
```

(b) Replace the hook usage. Change:
```jsx
  const { location } = useLocation();
```
to:
```jsx
  const locationCtx = useOptionalLocation();
  const location = locationCtx?.location ?? null;
```

(c) Replace the logged-out CTA. Change:
```jsx
        {!isAuth ? (
          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={() => navigate('/login', { state: { from: `/offer/${id}` } })}
          >
            Log in to claim
          </button>
        ) : capReached ? (
```
to:
```jsx
        {!isAuth ? (
          <button
            className="btn btn-primary btn-block btn-lg"
            onClick={() => { setReturnPath(`/offer/${id}`); navigate('/login'); }}
          >
            Sign in to claim
          </button>
        ) : capReached ? (
```

(d) Hide the save (heart) button for logged-out users. Find the save button in the floating top-right group:
```jsx
        <button className="detail-save-btn" onClick={toggleSave} aria-label={saved ? 'Unsave' : 'Save'} style={{ position: 'static' }}>
```
Wrap that entire `<button …>…</button>` in `{isAuth && ( … )}` so it only renders when logged in. (Leave the share button untouched — share needs no auth.)

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- "OfferDetail.public"`
Expected: PASS — 2 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all green (no existing test imported the throwing `useLocation` from OfferDetail).

- [ ] **Step 6: Commit**

```bash
git add src/pages/OfferDetail.jsx src/pages/OfferDetail.public.test.jsx
git commit -m "feat: public offer viewing + return-to-offer claim in OfferDetail"
```

---

## Task 8: App routing — public offer + business offers routes

**Files:**
- Modify: `frontend-user/src/App.jsx`

- [ ] **Step 1: Add the import**

In `frontend-user/src/App.jsx`, add with the other page imports:
```jsx
import BusinessOffers from './pages/BusinessOffers';
```

- [ ] **Step 2: Remove `/offer/:id` from the AppShell group**

Delete this line from inside the `<Route element={<AppShell />}>` block:
```jsx
          <Route path="/offer/:id"                element={<OfferDetail />} />
```

- [ ] **Step 3: Add the public routes**

Next to the `/tap` route, add `/offer/:id` and `/business/:id/offers` as top-level public routes:
```jsx
        {/* Full-screen — no auth wrapper, no AppShell */}
        <Route path="/tap" element={<Tap />} />
        <Route path="/offer/:id" element={<OfferDetail />} />
        <Route path="/business/:id/offers" element={<BusinessOffers />} />
```
(`OfferDetail` is already imported at the top of `App.jsx`.)

- [ ] **Step 4: Build + full suite**

Run: `npm run build` (expected: success) then `npm test` (expected: all green).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: public /offer/:id and /business/:id/offers routes"
```

---

## Task 9: Overlay rewire — CTA points at the business offers list

**Files:**
- Modify: `frontend-user/src/context/CheckInOverlayProvider.jsx` (+ `.test.jsx`)
- Modify: `frontend-user/src/components/checkin/PointsOverlay.jsx` (+ `.test.jsx`)
- Modify: `frontend-user/src/pages/Tap.jsx` (+ `.test.jsx`)

- [ ] **Step 1: Update the provider + its test (rename `offer` → `offersBusinessId`)**

Replace the body of `frontend-user/src/context/CheckInOverlayProvider.jsx` with:
```jsx
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export const CheckInOverlayContext = createContext(null);

export function CheckInOverlayProvider({ children }) {
  const [result, setResult] = useState(null);
  const [offersBusinessId, setOffersBusinessIdState] = useState(null);

  const trigger = useCallback((checkinResult) => {
    setOffersBusinessIdState(null);
    setResult(checkinResult);
  }, []);

  const setOffersBusinessId = useCallback((businessId) => setOffersBusinessIdState(businessId), []);

  const dismiss = useCallback(() => {
    setResult(null);
    setOffersBusinessIdState(null);
  }, []);

  const value = useMemo(
    () => ({ active: result != null, result, offersBusinessId, trigger, setOffersBusinessId, dismiss }),
    [result, offersBusinessId, trigger, setOffersBusinessId, dismiss]
  );

  return (
    <CheckInOverlayContext.Provider value={value}>
      {children}
    </CheckInOverlayContext.Provider>
  );
}

export function useCheckInOverlay() {
  const ctx = useContext(CheckInOverlayContext);
  if (!ctx) throw new Error('useCheckInOverlay must be used inside <CheckInOverlayProvider>');
  return ctx;
}
```

In `frontend-user/src/context/CheckInOverlayProvider.test.jsx`, update the `Probe` and the third test to use the new names:
- In `Probe`, replace the destructure and the offer markup/button:
```jsx
  const { active, result, offersBusinessId, trigger, setOffersBusinessId, dismiss } = useCheckInOverlay();
  return (
    <div>
      <span data-testid="active">{String(active)}</span>
      <span data-testid="points">{result?.points_awarded ?? '-'}</span>
      <span data-testid="offers">{offersBusinessId ?? '-'}</span>
      <button onClick={() => trigger({ points_awarded: 50 })}>trigger</button>
      <button onClick={() => setOffersBusinessId(42)}>offers</button>
      <button onClick={dismiss}>dismiss</button>
    </div>
  );
```
- Replace the third test body:
```jsx
  it('attaches an offers business id and clears everything on dismiss', () => {
    setup();
    act(() => screen.getByText('trigger').click());
    act(() => screen.getByText('offers').click());
    expect(screen.getByTestId('offers').textContent).toBe('42');
    act(() => screen.getByText('dismiss').click());
    expect(screen.getByTestId('active').textContent).toBe('false');
    expect(screen.getByTestId('offers').textContent).toBe('-');
  });
```

- [ ] **Step 2: Run provider test**

Run: `npm test -- CheckInOverlayProvider`
Expected: PASS — 3 tests.

- [ ] **Step 3: Update PointsOverlay + its test**

In `frontend-user/src/components/checkin/PointsOverlay.jsx`:
- Change the destructure:
```jsx
  const { active, result, offersBusinessId, dismiss } = useCheckInOverlay();
```
- Replace `handleBrowse`:
```jsx
  function handleBrowse() {
    dismiss();
    navigate(`/business/${offersBusinessId}/offers`);
  }
```
- Replace the conditional button block (the `{offer && (…)}` actions button) with:
```jsx
        {offersBusinessId != null && (
          <button className="btn btn-primary btn-block btn-lg" onClick={handleBrowse}>
            See our latest offers
          </button>
        )}
```

In `frontend-user/src/components/checkin/PointsOverlay.test.jsx`:
- In the `renderOverlay` helper, replace `offer: ctx.offer ?? null` with `offersBusinessId: ctx.offersBusinessId ?? null` and the `setOffer` field with `setOffersBusinessId: vi.fn()`.
- Replace the "Browse offers" test with:
```jsx
  it('shows the offers button only when an offers business id is set', async () => {
    renderOverlay({ result: { points_awarded: 10, business_name: 'X' } });
    expect(screen.queryByRole('button', { name: /see our latest offers/i })).toBeNull();

    renderOverlay({ result: { points_awarded: 10, business_name: 'X' }, offersBusinessId: 42 });
    const btn = screen.getByRole('button', { name: /see our latest offers/i });
    await userEvent.click(btn);
    expect(navigateMock).toHaveBeenCalledWith('/business/42/offers');
  });
```

- [ ] **Step 4: Run PointsOverlay test**

Run: `npm test -- PointsOverlay`
Expected: PASS (the same-day "0 points" tests and others unchanged still pass).

- [ ] **Step 5: Update Tap.jsx + its test**

In `frontend-user/src/pages/Tap.jsx`:
- Change the public-api import from `getStrangerDisplay` to `getBusinessOffers`:
```jsx
import { getBusinessOffers } from '../api/public';
```
- Change the overlay destructure:
```jsx
  const { trigger, setOffersBusinessId } = useCheckInOverlay();
```
- In the `nfcCheckin(...).then(...)` success body, replace the background `getStrangerDisplay` block with:
```jsx
        trigger(result);
        clearPendingTap();
        navigate('/home', { replace: true });
        // Enable the "See our latest offers" CTA only if the business has any.
        getBusinessOffers(business)
          .then((d) => { if (d?.offers?.length) setOffersBusinessId(business); })
          .catch(() => {});
```
- Update the effect dependency array: replace `setOffer` with `setOffersBusinessId`.

In `frontend-user/src/pages/Tap.test.jsx`:
- Update the overlay mock:
```jsx
const triggerMock = vi.fn();
const setOffersBusinessIdMock = vi.fn();
vi.mock('../context/CheckInOverlayProvider', () => ({
  useCheckInOverlay: () => ({ trigger: triggerMock, setOffersBusinessId: setOffersBusinessIdMock }),
}));
```
- Update the public-api mock to provide `getBusinessOffers`:
```jsx
vi.mock('../api/public', () => ({ getBusinessOffers: vi.fn(), fireStrangerVisit: vi.fn().mockResolvedValue(undefined), getStrangerDisplay: vi.fn() }));
```
- Update the imports line to `import { getBusinessOffers } from '../api/public';`.
- In the authed test, replace the `getStrangerDisplay.mockResolvedValue({ todays_offer: { id: 9 } })` with `getBusinessOffers.mockResolvedValue({ offers: [{ id: 9 }] })`, and replace the `setOfferMock` assertion with:
```jsx
    await waitFor(() => expect(setOffersBusinessIdMock).toHaveBeenCalledWith(42));
```

- [ ] **Step 6: Run Tap test + full suite + build**

Run: `npm test -- "pages/Tap"` (expected: pass), then `npm test` (expected: all green), then `npm run build` (expected: success).

- [ ] **Step 7: Commit**

```bash
git add src/context/CheckInOverlayProvider.jsx src/context/CheckInOverlayProvider.test.jsx src/components/checkin/PointsOverlay.jsx src/components/checkin/PointsOverlay.test.jsx src/pages/Tap.jsx src/pages/Tap.test.jsx
git commit -m "feat: overlay CTA routes to business offers list"
```

---

## Task 10: Manual verification on staging

(After merge to `pre-staging` and the staging deploy.)

- [ ] **Step 1: Business offers page (typed URL)**

Open `https://staging.tapprove.io/business/4/offers` (and a business with no active offers). Expected: list of offers with the business header; for the empty business, exactly **"No Offers Currently Available for {business name}"**.

- [ ] **Step 2: Public offer viewing + claim gate**

Logged out, open `https://staging.tapprove.io/offer/<id>`. Expected: the offer renders (no redirect to login); bottom CTA reads **"Sign in to claim"**; clicking it goes to `/login`; after signing in you land **back on `/offer/<id>`**, now able to claim.

- [ ] **Step 3: Post-earning route**

Tap-earn (logged in) → overlay shows **"See our latest offers"** when the business has offers → opens `/business/:id/offers` → open an offer → claim works (already logged in).

- [ ] **Step 4: Empty-offers business after earning**

Earn at a business with no active offers → overlay shows **no** offers button (CTA hidden).

---

## Self-Review

**Spec coverage:**
- Backend list endpoint → Task 4 ✓
- `getBusinessOffers` client → Task 5 ✓
- BusinessOffers page + exact empty state → Task 6 ✓
- Public offer viewing (un-gate via `useOptionalLocation`, move route) → Tasks 3, 7, 8 ✓
- Login-only-to-claim + return-to-offer (`returnPath` + `postAuthDestination`) → Tasks 1, 2, 7 ✓
- Overlay → business offers list → Task 9 ✓
- No netlify change (catch-all serves new paths) → covered (Task 8 adds SPA routes only) ✓
- Sticker-URL contract → documented in spec; no code here (node/sticker is non-web) ✓

**Placeholder scan:** none — every code step has complete code.

**Type/name consistency:** `getBusinessOffers(businessId)` → `{ business_name, business_logo_url, offers[] }`; overlay context `{ active, result, offersBusinessId, trigger, setOffersBusinessId, dismiss }` used consistently in Tasks 9 across provider/overlay/Tap; `setReturnPath/getReturnPath/clearReturnPath`; `useOptionalLocation`; `postAuthDestination` priority tap → returnPath → /home.

**Assumptions to verify during execution (not blockers):**
- `.offer-card`, `.offer-card-img`, `.offer-card-img-placeholder`, `.offer-card-body`, `.offer-card-title`, `.empty-state*`, `.page-full`, `.text-muted` classes exist in `global.css` (used by existing components — confirmed for OfferCard/OfferDetail).
- The `offers` table has the selected columns (`image_url`, `category`, `offer_type`, `original_price`, `offer_price`, `discount_percent`, `expires_at`) — confirmed against existing offer queries in `public.js`/`offers.js`.
