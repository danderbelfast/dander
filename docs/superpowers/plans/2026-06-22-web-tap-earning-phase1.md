# Web Tap-Earning — Phase 1 (Check-in) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer who taps an NFC tag and lands on the `frontend-user` web PWA earn loyalty points (full check-in loop), regardless of whether the native app opens — including the resume-after-login flow for logged-out and brand-new users.

**Architecture:** The SPA takes ownership of `/tap`. A transient route component (`pages/Tap.jsx`) waits for session restore, then branches on auth: authed → POST the existing `/api/proximity/nfc-checkin` and show a global points overlay; not authed → show a React landing screen that stashes the tap context and routes to login/register. All auth-success paths (login direct, login 2FA, register OTP auto-login) converge on one `postAuthDestination()` helper that replays the stashed tap. No backend changes; one `netlify.toml` routing flip.

**Tech Stack:** React 18, react-router-dom 6, Vite 5, axios (shared `client.js` with Bearer-JWT + 401-refresh). Tests added in Task 1 via Vitest + @testing-library/react + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-22-web-tap-earning-design.md`
**Branch:** `pre-staging`
**Scope:** Phase 1 only. Till / Socket.IO (Phase 2) and the "Open in app" button are explicitly out of scope here.

**Run commands from `frontend-user/`** (this app's directory), not the monorepo root.

---

## File Structure (Phase 1)

**Create:**
- `frontend-user/vitest.setup.js` — test setup (jest-dom matchers)
- `frontend-user/src/services/tapContext.js` — pending-tap stash (sessionStorage, TTL, clear-on-consume)
- `frontend-user/src/services/tapContext.test.js`
- `frontend-user/src/utils/postAuthDestination.js` — post-auth redirect chokepoint
- `frontend-user/src/utils/postAuthDestination.test.js`
- `frontend-user/src/api/proximity.js` — `nfcCheckin()`
- `frontend-user/src/api/public.js` — `getStrangerDisplay()`, `fireStrangerVisit()`
- `frontend-user/src/context/CheckInOverlayProvider.jsx` — global overlay state + `useCheckInOverlay()`
- `frontend-user/src/components/checkin/PointsOverlay.jsx` — the reward overlay
- `frontend-user/src/components/checkin/PointsOverlay.css` — overlay styles + coin animation
- `frontend-user/src/components/checkin/TapLanding.jsx` — stranger landing screen
- `frontend-user/src/pages/Tap.jsx` — `/tap` state machine
- `frontend-user/src/pages/Tap.test.jsx` — branch tests

**Modify:**
- `frontend-user/package.json` — add devDeps + `test` script
- `frontend-user/vite.config.js` — add `test` config block
- `frontend-user/src/pages/Login.jsx` — both success paths use `postAuthDestination()`
- `frontend-user/src/pages/Register.jsx` — auto-login with returned tokens + `postAuthDestination()`
- `frontend-user/src/App.jsx` — add `/tap` route + mount `CheckInOverlayProvider` + render `<PointsOverlay/>`
- `netlify.toml` — remove the `/tap` proxy redirect block

---

## Task 1: Test infrastructure (Vitest + Testing Library)

The app currently has **no test runner**. Add the standard Vite test stack so the
TDD tasks below can run.

**Files:**
- Modify: `frontend-user/package.json`
- Modify: `frontend-user/vite.config.js`
- Create: `frontend-user/vitest.setup.js`
- Create: `frontend-user/src/smoke.test.js` (temporary, deleted in Step 6)

- [ ] **Step 1: Install dev dependencies**

Run (from `frontend-user/`):
```bash
npm install -D vitest@^2 jsdom@^25 @testing-library/react@^16 @testing-library/jest-dom@^6 @testing-library/user-event@^14
```
Expected: packages added to `devDependencies`, no errors.

- [ ] **Step 2: Add the `test` script to `package.json`**

In `frontend-user/package.json`, add to the `"scripts"` block:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```
(Keep the existing `dev`/`build`/`preview`/`lint` scripts.)

- [ ] **Step 3: Add the test config to `vite.config.js`**

Add a `test` key to the config object exported by `frontend-user/vite.config.js`:
```js
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    css: false,
  },
```
If the file uses `defineConfig(...)`, place `test` as a sibling of `plugins`. Leave all existing keys untouched.

- [ ] **Step 4: Create the setup file**

Create `frontend-user/vitest.setup.js`:
```js
import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
```

- [ ] **Step 5: Create a smoke test and run it**

Create `frontend-user/src/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('test infra', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```
Run: `npm test`
Expected: PASS — 1 test passed.

- [ ] **Step 6: Delete the smoke test and commit**

```bash
rm src/smoke.test.js
git add package.json package-lock.json vite.config.js vitest.setup.js
git commit -m "test: add Vitest + Testing Library to frontend-user"
```

---

## Task 2: Pending-tap context carrier

Stores the tap params across the login/register detour. sessionStorage, 30-min
TTL, clear-on-consume.

**Files:**
- Create: `frontend-user/src/services/tapContext.js`
- Test: `frontend-user/src/services/tapContext.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend-user/src/services/tapContext.test.js`:
```js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setPendingTap, getPendingTap, clearPendingTap, PENDING_TAP_TTL_MS } from './tapContext';

describe('tapContext', () => {
  beforeEach(() => { sessionStorage.clear(); vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns null when nothing is stashed', () => {
    expect(getPendingTap()).toBeNull();
  });

  it('stashes and reads back node + business', () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    expect(getPendingTap()).toEqual({ node: 'node-abc', business: 42 });
  });

  it('coerces business to a number', () => {
    setPendingTap({ node: 'node-abc', business: '42' });
    expect(getPendingTap()).toEqual({ node: 'node-abc', business: 42 });
  });

  it('clears on demand', () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    clearPendingTap();
    expect(getPendingTap()).toBeNull();
  });

  it('expires after the TTL and self-clears', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T10:00:00Z'));
    setPendingTap({ node: 'node-abc', business: 42 });

    vi.setSystemTime(new Date('2026-06-22T10:00:00Z').getTime() + PENDING_TAP_TTL_MS + 1);
    expect(getPendingTap()).toBeNull();
    // self-cleared from storage
    expect(sessionStorage.getItem('tapprove_pending_tap')).toBeNull();
  });

  it('ignores a tap missing node or business', () => {
    setPendingTap({ node: '', business: 42 });
    expect(getPendingTap()).toBeNull();
    setPendingTap({ node: 'node-abc', business: NaN });
    expect(getPendingTap()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tapContext`
Expected: FAIL — cannot import from `./tapContext` (module not found).

- [ ] **Step 3: Implement `tapContext.js`**

Create `frontend-user/src/services/tapContext.js`:
```js
// Carries the NFC tap context (node + business) across the login/register
// detour so a logged-out or brand-new user still earns at the end of the flow.
// sessionStorage survives page reload and same-tab SPA navigation; a 30-minute
// TTL and clear-on-consume stop a stale or abandoned tap replaying later.

const KEY = 'tapprove_pending_tap';
export const PENDING_TAP_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function setPendingTap({ node, business }) {
  const businessId = Number(business);
  if (!node || !Number.isFinite(businessId)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ node, business: businessId, ts: Date.now() }));
  } catch { /* storage unavailable — ignore */ }
}

export function getPendingTap() {
  let raw;
  try { raw = sessionStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;

  let parsed;
  try { parsed = JSON.parse(raw); } catch { clearPendingTap(); return null; }

  const businessId = Number(parsed?.business);
  const fresh = typeof parsed?.ts === 'number' && (Date.now() - parsed.ts) <= PENDING_TAP_TTL_MS;
  if (!parsed?.node || !Number.isFinite(businessId) || !fresh) {
    clearPendingTap();
    return null;
  }
  return { node: parsed.node, business: businessId };
}

export function clearPendingTap() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tapContext`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/tapContext.js src/services/tapContext.test.js
git commit -m "feat: pending-tap context carrier with TTL"
```

---

## Task 3: postAuthDestination chokepoint

Single helper deciding where to send a user after authentication: replay the tap
if one is pending, otherwise `/home`.

**Files:**
- Create: `frontend-user/src/utils/postAuthDestination.js`
- Test: `frontend-user/src/utils/postAuthDestination.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend-user/src/utils/postAuthDestination.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { postAuthDestination } from './postAuthDestination';
import { setPendingTap, clearPendingTap } from '../services/tapContext';

describe('postAuthDestination', () => {
  beforeEach(() => { clearPendingTap(); });

  it('returns /home when no tap is pending', () => {
    expect(postAuthDestination()).toBe('/home');
  });

  it('returns the /tap replay URL when a tap is pending', () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    expect(postAuthDestination()).toBe('/tap?node=node-abc&business=42');
  });

  it('url-encodes the node id', () => {
    setPendingTap({ node: 'node-a/b c', business: 7 });
    expect(postAuthDestination()).toBe('/tap?node=node-a%2Fb%20c&business=7');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- postAuthDestination`
Expected: FAIL — cannot import `./postAuthDestination`.

- [ ] **Step 3: Implement `postAuthDestination.js`**

Create `frontend-user/src/utils/postAuthDestination.js`:
```js
import { getPendingTap } from '../services/tapContext';

// Where to send a user the moment a session becomes real. If they arrived via an
// NFC tap before authenticating, replay that tap so earning happens; otherwise
// fall through to the normal home screen. Does NOT clear the pending tap — the
// /tap route consumes it after a successful award.
export function postAuthDestination() {
  const pending = getPendingTap();
  if (!pending) return '/home';
  const node = encodeURIComponent(pending.node);
  const business = encodeURIComponent(String(pending.business));
  return `/tap?node=${node}&business=${business}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- postAuthDestination`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/postAuthDestination.js src/utils/postAuthDestination.test.js
git commit -m "feat: postAuthDestination redirect chokepoint"
```

---

## Task 4: Proximity + public API clients

Thin wrappers over the existing backend endpoints, following the existing
`src/api/*.js` pattern (import the shared `client`, return `.data`).

**Files:**
- Create: `frontend-user/src/api/proximity.js`
- Create: `frontend-user/src/api/public.js`
- Test: `frontend-user/src/api/proximity.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend-user/src/api/proximity.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

import client from './client';
import { nfcCheckin } from './proximity';
import { getStrangerDisplay, fireStrangerVisit } from './public';

describe('proximity api', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('nfcCheckin posts node_device_id + business_id and returns data', async () => {
    client.post.mockResolvedValue({ data: { success: true, points_awarded: 50 } });
    const res = await nfcCheckin({ node: 'node-abc', business: 42 });
    expect(client.post).toHaveBeenCalledWith('/api/proximity/nfc-checkin', {
      node_device_id: 'node-abc',
      business_id: 42,
    });
    expect(res).toEqual({ success: true, points_awarded: 50 });
  });
});

describe('public api', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getStrangerDisplay GETs the business stranger-display and returns data', async () => {
    client.get.mockResolvedValue({ data: { success: true, business_name: 'Joe Coffee', todays_offer: null } });
    const res = await getStrangerDisplay(42);
    expect(client.get).toHaveBeenCalledWith('/api/public/business/42/stranger-display');
    expect(res.business_name).toBe('Joe Coffee');
  });

  it('fireStrangerVisit posts node + business and swallows errors', async () => {
    client.post.mockRejectedValue(new Error('network'));
    await expect(fireStrangerVisit({ node: 'node-abc', business: 42 })).resolves.toBeUndefined();
    expect(client.post).toHaveBeenCalledWith('/api/public/nfc-stranger', {
      node_device_id: 'node-abc',
      business_id: 42,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- "src/api/proximity"`
Expected: FAIL — cannot import `./proximity` / `./public`.

- [ ] **Step 3: Implement the two clients**

Create `frontend-user/src/api/proximity.js`:
```js
import client from './client';

// Award points for a check-in tap. Requires an authenticated session — the
// shared client attaches the Bearer token and refreshes on 401.
export const nfcCheckin = ({ node, business }) =>
  client
    .post('/api/proximity/nfc-checkin', { node_device_id: node, business_id: Number(business) })
    .then((r) => r.data);
```

Create `frontend-user/src/api/public.js`:
```js
import client from './client';

// Unauthenticated business summary used by the stranger landing: business name,
// today's active offer (or null), visitor count.
export const getStrangerDisplay = (businessId) =>
  client.get(`/api/public/business/${Number(businessId)}/stranger-display`).then((r) => r.data);

// Best-effort: fire the in-store kiosk "new visitor" display. Never throws —
// a failure here must not affect the landing page.
export const fireStrangerVisit = ({ node, business }) =>
  client
    .post('/api/public/nfc-stranger', { node_device_id: node, business_id: Number(business) })
    .then(() => undefined)
    .catch(() => undefined);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- "src/api/proximity"`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/api/proximity.js src/api/public.js src/api/proximity.test.js
git commit -m "feat: proximity + public api clients for web tap"
```

---

## Task 5: CheckInOverlay context

Global state so both `/tap` (sync) and, later, the till socket (async) can drive
one overlay. Holds the check-in result and an optional offer for the "Browse"
button.

**Files:**
- Create: `frontend-user/src/context/CheckInOverlayProvider.jsx`
- Test: `frontend-user/src/context/CheckInOverlayProvider.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend-user/src/context/CheckInOverlayProvider.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CheckInOverlayProvider, useCheckInOverlay } from './CheckInOverlayProvider';

function Probe() {
  const { active, result, offer, trigger, setOffer, dismiss } = useCheckInOverlay();
  return (
    <div>
      <span data-testid="active">{String(active)}</span>
      <span data-testid="points">{result?.points_awarded ?? '-'}</span>
      <span data-testid="offer">{offer?.id ?? '-'}</span>
      <button onClick={() => trigger({ points_awarded: 50 })}>trigger</button>
      <button onClick={() => setOffer({ id: 9 })}>offer</button>
      <button onClick={dismiss}>dismiss</button>
    </div>
  );
}

function setup() {
  return render(
    <CheckInOverlayProvider>
      <Probe />
    </CheckInOverlayProvider>
  );
}

describe('CheckInOverlayProvider', () => {
  it('starts inactive', () => {
    setup();
    expect(screen.getByTestId('active').textContent).toBe('false');
  });

  it('activates and stores the result on trigger', () => {
    setup();
    act(() => screen.getByText('trigger').click());
    expect(screen.getByTestId('active').textContent).toBe('true');
    expect(screen.getByTestId('points').textContent).toBe('50');
  });

  it('attaches an offer and clears everything on dismiss', () => {
    setup();
    act(() => screen.getByText('trigger').click());
    act(() => screen.getByText('offer').click());
    expect(screen.getByTestId('offer').textContent).toBe('9');
    act(() => screen.getByText('dismiss').click());
    expect(screen.getByTestId('active').textContent).toBe('false');
    expect(screen.getByTestId('offer').textContent).toBe('-');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- CheckInOverlayProvider`
Expected: FAIL — cannot import `./CheckInOverlayProvider`.

- [ ] **Step 3: Implement the provider**

Create `frontend-user/src/context/CheckInOverlayProvider.jsx`:
```jsx
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const CheckInOverlayContext = createContext(null);

export function CheckInOverlayProvider({ children }) {
  const [result, setResult] = useState(null);
  const [offer, setOfferState] = useState(null);

  const trigger = useCallback((checkinResult) => {
    setOfferState(null);
    setResult(checkinResult);
  }, []);

  const setOffer = useCallback((o) => setOfferState(o), []);

  const dismiss = useCallback(() => {
    setResult(null);
    setOfferState(null);
  }, []);

  const value = useMemo(
    () => ({ active: result != null, result, offer, trigger, setOffer, dismiss }),
    [result, offer, trigger, setOffer, dismiss]
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- CheckInOverlayProvider`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/context/CheckInOverlayProvider.jsx src/context/CheckInOverlayProvider.test.jsx
git commit -m "feat: global check-in overlay context"
```

---

## Task 6: PointsOverlay component

The reward moment. Reads from the overlay context; renders points, business name,
tier-scaled celebration, optional unlocks, and a conditional "Browse our latest
offers" button. Reuses the existing haptic/sound services. Animation via CSS —
budget care for feel, not a physics engine.

**Files:**
- Create: `frontend-user/src/components/checkin/PointsOverlay.jsx`
- Create: `frontend-user/src/components/checkin/PointsOverlay.css`
- Test: `frontend-user/src/components/checkin/PointsOverlay.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend-user/src/components/checkin/PointsOverlay.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CheckInOverlayContext } from '../../context/CheckInOverlayProvider';
import PointsOverlay from './PointsOverlay';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigateMock,
}));
vi.mock('../../services/hapticService', () => ({ custom: vi.fn() }));
vi.mock('../../services/soundService', () => ({ couponClaimed: vi.fn(), couponRedeemed: vi.fn() }));

function renderOverlay(ctx) {
  const value = {
    active: ctx.result != null, result: ctx.result ?? null, offer: ctx.offer ?? null,
    trigger: vi.fn(), setOffer: vi.fn(), dismiss: ctx.dismiss ?? vi.fn(),
  };
  return render(
    <MemoryRouter>
      <CheckInOverlayContext.Provider value={value}>
        <PointsOverlay />
      </CheckInOverlayContext.Provider>
    </MemoryRouter>
  );
}

describe('PointsOverlay', () => {
  beforeEach(() => { navigateMock.mockClear(); });

  it('renders nothing when inactive', () => {
    const { container } = renderOverlay({ result: null });
    expect(container.firstChild).toBeNull();
  });

  it('shows points and business name when active', () => {
    renderOverlay({ result: { points_awarded: 50, business_name: 'Joe Coffee', tier: 'silver' } });
    expect(screen.getByText(/50/)).toBeInTheDocument();
    expect(screen.getByText(/Joe Coffee/)).toBeInTheDocument();
  });

  it('shows the tier-upgrade badge only when tier_upgraded is true', () => {
    renderOverlay({ result: { points_awarded: 50, business_name: 'X', tier: 'gold', tier_upgraded: true } });
    expect(screen.getByText(/gold/i)).toBeInTheDocument();
  });

  it('shows the Browse offers button only when an offer is attached', async () => {
    const { rerender } = renderOverlay({ result: { points_awarded: 10, business_name: 'X' } });
    expect(screen.queryByRole('button', { name: /browse our latest offers/i })).toBeNull();

    renderOverlay({ result: { points_awarded: 10, business_name: 'X' }, offer: { id: 9 } });
    const btn = screen.getByRole('button', { name: /browse our latest offers/i });
    await userEvent.click(btn);
    expect(navigateMock).toHaveBeenCalledWith('/offer/9');
  });

  it('dismiss button navigates home', async () => {
    const dismiss = vi.fn();
    renderOverlay({ result: { points_awarded: 10, business_name: 'X' }, dismiss });
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(dismiss).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/home');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- PointsOverlay`
Expected: FAIL — cannot import `./PointsOverlay` and/or `CheckInOverlayContext` is not exported.

- [ ] **Step 3: Export the context object from the provider**

In `frontend-user/src/context/CheckInOverlayProvider.jsx`, change the context
declaration line so the raw context is exported (tests and the overlay consume it
directly):
```jsx
export const CheckInOverlayContext = createContext(null);
```
(Update the existing `const CheckInOverlayContext = createContext(null);` line; everything else in the file stays the same.)

- [ ] **Step 4: Implement the overlay + styles**

Create `frontend-user/src/components/checkin/PointsOverlay.css`:
```css
.po-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; padding: 24px; text-align: center;
  background: radial-gradient(circle at 50% 30%, #2a2a3d 0%, #11111a 70%);
  color: #fff; animation: po-fade 220ms ease-out;
}
.po-backdrop.tier-bronze { background: radial-gradient(circle at 50% 30%, #4a3526 0%, #11111a 70%); }
.po-backdrop.tier-silver { background: radial-gradient(circle at 50% 30%, #3a3f4a 0%, #11111a 70%); }
.po-backdrop.tier-gold   { background: radial-gradient(circle at 50% 30%, #4a4226 0%, #11111a 70%); }
@keyframes po-fade { from { opacity: 0; } to { opacity: 1; } }

.po-banner { font-size: 1.1rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.9; }
.po-points { font-size: 4rem; font-weight: 800; line-height: 1; animation: po-pop 420ms cubic-bezier(.2,1.3,.4,1); }
@keyframes po-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
.po-business { font-size: 1.1rem; opacity: 0.85; }
.po-badge { display: inline-block; padding: 6px 14px; border-radius: 999px; background: #FF6B35; font-weight: 700; }
.po-streak { font-size: 1rem; opacity: 0.9; }
.po-unlock { font-size: 0.95rem; opacity: 0.9; }
.po-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; width: 100%; max-width: 320px; }

/* Coin burst — lightweight: a handful of emoji coins falling on a stagger. */
.po-coins { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }
.po-coin { position: absolute; top: -40px; font-size: 1.6rem; animation: po-fall 1100ms ease-in forwards; }
@keyframes po-fall { to { transform: translateY(110vh) rotate(360deg); opacity: 0.2; } }
@media (prefers-reduced-motion: reduce) {
  .po-points { animation: none; }
  .po-coin { display: none; }
}
```

Create `frontend-user/src/components/checkin/PointsOverlay.jsx`:
```jsx
import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCheckInOverlay } from '../../context/CheckInOverlayProvider';
import * as haptics from '../../services/hapticService';
import * as sound from '../../services/soundService';
import './PointsOverlay.css';

const TIER_VARIANTS = {
  standard: { banner: null,        coins: 6,  haptic: [40],            sound: 'claimed'  },
  bronze:   { banner: 'Lucky!',    coins: 12, haptic: [60, 40, 60],    sound: 'claimed'  },
  silver:   { banner: 'Amazing!',  coins: 20, haptic: [80, 40, 80],    sound: 'redeemed' },
  gold:     { banner: 'JACKPOT!',  coins: 28, haptic: [100,50,100,50,100], sound: 'redeemed' },
};

export default function PointsOverlay() {
  const { active, result, offer, dismiss } = useCheckInOverlay();
  const navigate = useNavigate();

  const variant = TIER_VARIANTS[result?.reward_tier] ?? TIER_VARIANTS.standard;

  // Fire haptics + sound once per activation.
  useEffect(() => {
    if (!active) return;
    haptics.custom(variant.haptic);
    if (variant.sound === 'redeemed') sound.couponRedeemed();
    else sound.couponClaimed();
  }, [active, variant]);

  const coins = useMemo(
    () => Array.from({ length: variant.coins }, (_, i) => ({
      id: i,
      left: `${(i * 37) % 100}%`,
      delay: `${(i % 6) * 90}ms`,
    })),
    [variant.coins]
  );

  if (!active || !result) return null;

  const tierClass = result.reward_tier ? `tier-${result.reward_tier}` : '';

  function handleBrowse() {
    dismiss();
    navigate(`/offer/${offer.id}`);
  }
  function handleDone() {
    dismiss();
    navigate('/home');
  }

  return (
    <div className={`po-backdrop ${tierClass}`} role="dialog" aria-label="Points earned">
      <div className="po-coins" aria-hidden="true">
        {coins.map((c) => (
          <span key={c.id} className="po-coin" style={{ left: c.left, animationDelay: c.delay }}>🪙</span>
        ))}
      </div>

      {variant.banner && <div className="po-banner">{variant.banner}</div>}
      <div className="po-points">+{result.points_awarded}</div>
      <div className="po-business">points at {result.business_name}</div>

      {result.tier_upgraded && (
        <div className="po-badge">⭐ {result.tier} tier unlocked!</div>
      )}
      {result.streak > 1 && (
        <div className="po-streak">🔥 {result.streak}-day streak</div>
      )}
      {Array.isArray(result.rewards_unlocked) && result.rewards_unlocked.map((r) => (
        <div className="po-unlock" key={r.id}>🎁 Reward unlocked: {r.name}</div>
      ))}
      {result.collectable_unlocked && (
        <div className="po-unlock">🎪 {result.collectable_unlocked.name} unlocked!</div>
      )}

      <div className="po-actions">
        {offer && (
          <button className="btn btn-primary btn-block btn-lg" onClick={handleBrowse}>
            Browse our latest offers
          </button>
        )}
        <button className="btn btn-ghost btn-block" onClick={handleDone}>Done</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- PointsOverlay`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/checkin/PointsOverlay.jsx src/components/checkin/PointsOverlay.css src/components/checkin/PointsOverlay.test.jsx src/context/CheckInOverlayProvider.jsx
git commit -m "feat: PointsOverlay reward component"
```

---

## Task 7: TapLanding stranger screen

Shown when an unauthenticated visitor lands on `/tap`. Loads business name +
today's offer, fires the kiosk display, stashes the tap context, and routes to
login/register.

**Files:**
- Create: `frontend-user/src/components/checkin/TapLanding.jsx`
- Test: `frontend-user/src/components/checkin/TapLanding.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend-user/src/components/checkin/TapLanding.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigateMock,
}));
vi.mock('../../api/public', () => ({
  getStrangerDisplay: vi.fn(),
  fireStrangerVisit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/tapContext', () => ({ setPendingTap: vi.fn() }));

import { getStrangerDisplay, fireStrangerVisit } from '../../api/public';
import { setPendingTap } from '../../services/tapContext';
import TapLanding from './TapLanding';

function renderLanding(props = {}) {
  return render(
    <MemoryRouter>
      <TapLanding node="node-abc" business={42} {...props} />
    </MemoryRouter>
  );
}

describe('TapLanding', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('loads and shows the business name + offer preview', async () => {
    getStrangerDisplay.mockResolvedValue({
      success: true, business_name: 'Joe Coffee',
      todays_offer: { id: 9, title: '20% off pastries' },
    });
    renderLanding();
    expect(await screen.findByText(/Joe Coffee/)).toBeInTheDocument();
    expect(screen.getByText(/20% off pastries/)).toBeInTheDocument();
  });

  it('fires the kiosk stranger display on mount', async () => {
    getStrangerDisplay.mockResolvedValue({ success: true, business_name: 'X', todays_offer: null });
    renderLanding();
    await waitFor(() => expect(fireStrangerVisit).toHaveBeenCalledWith({ node: 'node-abc', business: 42 }));
  });

  it('Sign in stashes the tap and routes to /login', async () => {
    getStrangerDisplay.mockResolvedValue({ success: true, business_name: 'X', todays_offer: null });
    renderLanding();
    await screen.findByText(/X/);
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(setPendingTap).toHaveBeenCalledWith({ node: 'node-abc', business: 42 });
    expect(navigateMock).toHaveBeenCalledWith('/login');
  });

  it('Create account stashes the tap and routes to /register', async () => {
    getStrangerDisplay.mockResolvedValue({ success: true, business_name: 'X', todays_offer: null });
    renderLanding();
    await screen.findByText(/X/);
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(setPendingTap).toHaveBeenCalledWith({ node: 'node-abc', business: 42 });
    expect(navigateMock).toHaveBeenCalledWith('/register');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- TapLanding`
Expected: FAIL — cannot import `./TapLanding`.

- [ ] **Step 3: Implement `TapLanding.jsx`**

Create `frontend-user/src/components/checkin/TapLanding.jsx`:
```jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStrangerDisplay, fireStrangerVisit } from '../../api/public';
import { setPendingTap } from '../../services/tapContext';
import { Spinner } from '../ui/Spinner';
import tapproveLogoBlack from '../../assets/TapProve_Logo_Black.png';

// Landing for an unauthenticated NFC tapper. Earning requires a session, so we
// show who they tapped, preview today's offer, and route them to auth — stashing
// the tap context so it replays and awards after they log in / register.
export default function TapLanding({ node, business }) {
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getStrangerDisplay(business)
      .then((data) => { if (alive) setInfo(data); })
      .catch(() => { if (alive) setInfo(null); })
      .finally(() => { if (alive) setLoading(false); });
    // Best-effort kiosk "new visitor" display — never blocks the page.
    fireStrangerVisit({ node, business });
    return () => { alive = false; };
  }, [node, business]);

  function goAuth(path) {
    setPendingTap({ node, business });
    navigate(path);
  }

  if (loading) {
    return (
      <div className="auth-page page-full" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const name = info?.business_name ?? 'this business';
  const offer = info?.todays_offer ?? null;

  return (
    <div className="auth-page page-full" style={{ overflowY: 'auto' }}>
      <img src={tapproveLogoBlack} alt="TapProve" className="auth-logo" />
      <h1 className="auth-title">Welcome to {name}'s loyalty program.</h1>
      <p className="auth-subtitle">Powered by TapProve. Sign in or create an account to collect your points.</p>

      {offer && (
        <div className="card" style={{ margin: '12px 0', padding: 16, borderRadius: 12, background: 'rgba(255,107,53,0.08)' }}>
          <div style={{ fontWeight: 700, color: '#FF6B35' }}>Today at {name}</div>
          <div style={{ fontWeight: 600 }}>{offer.title}</div>
          {offer.description && <div className="text-muted" style={{ fontSize: '0.9rem' }}>{offer.description}</div>}
        </div>
      )}

      <div className="auth-form">
        <button className="btn btn-primary btn-block btn-lg" onClick={() => goAuth('/login')}>
          Sign in to collect points
        </button>
        <button className="btn btn-secondary btn-block btn-lg" onClick={() => goAuth('/register')}>
          Create account
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- TapLanding`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/checkin/TapLanding.jsx src/components/checkin/TapLanding.test.jsx
git commit -m "feat: TapLanding stranger screen"
```

---

## Task 8: Tap page state machine

The `/tap` route. Waits for session restore, validates params, then branches:
authed → check in + drive the overlay; not authed → render `TapLanding`.

**Files:**
- Create: `frontend-user/src/pages/Tap.jsx`
- Test: `frontend-user/src/pages/Tap.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend-user/src/pages/Tap.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig();
  return { ...actual, useNavigate: () => navigateMock };
});

let authState = { isAuth: false, loading: false };
vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));

const triggerMock = vi.fn();
const setOfferMock = vi.fn();
vi.mock('../context/CheckInOverlayProvider', () => ({
  useCheckInOverlay: () => ({ trigger: triggerMock, setOffer: setOfferMock }),
}));

vi.mock('../api/proximity', () => ({ nfcCheckin: vi.fn() }));
vi.mock('../api/public', () => ({ getStrangerDisplay: vi.fn(), fireStrangerVisit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/tapContext', () => ({ setPendingTap: vi.fn(), clearPendingTap: vi.fn() }));

import { nfcCheckin, /* */ } from '../api/proximity';
import { getStrangerDisplay } from '../api/public';
import { clearPendingTap } from '../services/tapContext';
import Tap from './Tap';

function renderTap(search) {
  return render(
    <MemoryRouter initialEntries={[`/tap${search}`]}>
      <Routes><Route path="/tap" element={<Tap />} /></Routes>
    </MemoryRouter>
  );
}

describe('Tap page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState = { isAuth: false, loading: false };
  });

  it('redirects to / when params are missing', async () => {
    renderTap('');
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('authed: checks in, triggers the overlay, clears the tap, navigates home', async () => {
    authState = { isAuth: true, loading: false };
    nfcCheckin.mockResolvedValue({ success: true, points_awarded: 50, business_name: 'Joe' });
    getStrangerDisplay.mockResolvedValue({ todays_offer: { id: 9 } });
    renderTap('?node=node-abc&business=42');

    await waitFor(() => expect(nfcCheckin).toHaveBeenCalledWith({ node: 'node-abc', business: 42 }));
    await waitFor(() => expect(triggerMock).toHaveBeenCalledWith({ success: true, points_awarded: 50, business_name: 'Joe' }));
    await waitFor(() => expect(setOfferMock).toHaveBeenCalledWith({ id: 9 }));
    expect(clearPendingTap).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/home', { replace: true });
  });

  it('not authed: renders the landing (no check-in call)', async () => {
    getStrangerDisplay.mockResolvedValue({ success: true, business_name: 'Joe Coffee', todays_offer: null });
    renderTap('?node=node-abc&business=42');
    expect(await screen.findByText(/Joe Coffee/)).toBeInTheDocument();
    expect(nfcCheckin).not.toHaveBeenCalled();
  });

  it('waits for auth loading before deciding', () => {
    authState = { isAuth: false, loading: true };
    renderTap('?node=node-abc&business=42');
    expect(nfcCheckin).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- "pages/Tap"`
Expected: FAIL — cannot import `./Tap`.

- [ ] **Step 3: Implement `Tap.jsx`**

Create `frontend-user/src/pages/Tap.jsx`:
```jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCheckInOverlay } from '../context/CheckInOverlayProvider';
import { nfcCheckin } from '../api/proximity';
import { getStrangerDisplay } from '../api/public';
import { clearPendingTap } from '../services/tapContext';
import TapLanding from '../components/checkin/TapLanding';
import { Spinner } from '../components/ui/Spinner';

// Transient /tap route. Authed users earn immediately and bounce to /home with
// the overlay over the top; unauthenticated users see the landing screen.
export default function Tap() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAuth, loading } = useAuth();
  const { trigger, setOffer } = useCheckInOverlay();

  const node = params.get('node');
  const business = Number(params.get('business'));
  const validParams = !!node && Number.isFinite(business);

  const [error, setError] = useState(false);
  const fired = useRef(false); // guard against double check-in (StrictMode / re-render)

  useEffect(() => {
    if (loading) return;                  // wait for session restore
    if (!validParams) { navigate('/', { replace: true }); return; }
    if (!isAuth) return;                  // unauthenticated → render landing below
    if (fired.current) return;
    fired.current = true;

    nfcCheckin({ node, business })
      .then((result) => {
        trigger(result);
        clearPendingTap();
        navigate('/home', { replace: true });
        // Resolve the conditional "Browse offers" button after the reward shows.
        getStrangerDisplay(business)
          .then((info) => { if (info?.todays_offer) setOffer(info.todays_offer); })
          .catch(() => {});
      })
      .catch(() => { setError(true); });
  }, [loading, isAuth, validParams, node, business, navigate, trigger, setOffer]);

  if (loading || (isAuth && validParams && !error)) {
    return (
      <div className="auth-page page-full" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-page page-full" style={{ justifyContent: 'center', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem' }}>😕</div>
        <h2 className="font-head">Couldn't collect your points</h2>
        <p className="text-muted">Please try tapping again.</p>
        <button className="btn btn-primary btn-lg" onClick={() => { fired.current = false; setError(false); }}>
          Retry
        </button>
      </div>
    );
  }

  // Unauthenticated and params valid → landing.
  return <TapLanding node={node} business={business} />;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- "pages/Tap"`
Expected: PASS — 4 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all tests from Tasks 2–8 green.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Tap.jsx src/pages/Tap.test.jsx
git commit -m "feat: /tap route state machine"
```

---

## Task 9: Wire routing + overlay into App

Add the `/tap` route (outside `PublicRoute` and `AppShell`), wrap the app in
`CheckInOverlayProvider`, and render `<PointsOverlay/>` once at the top level.

**Files:**
- Modify: `frontend-user/src/App.jsx`
- Modify: `frontend-user/src/main.jsx` (only if providers are composed there — see Step 1)

- [ ] **Step 1: Check where providers are mounted**

Run: `npm run lint --silent || true` then open `src/main.jsx` and `src/App.jsx`.
Decide where `AuthProvider` is mounted; `CheckInOverlayProvider` must sit **inside**
the Router and **inside** `AuthProvider` (the overlay uses `useNavigate`, and Tap
uses both). If `AuthProvider` + `BrowserRouter` are in `main.jsx`, wrap
`CheckInOverlayProvider` around `<App/>` there; otherwise wrap inside `App.jsx`.
This plan assumes wrapping inside `App.jsx`.

- [ ] **Step 2: Modify `App.jsx`**

In `frontend-user/src/App.jsx`:

Add imports near the other page/component imports:
```jsx
import Tap from './pages/Tap';
import { CheckInOverlayProvider } from './context/CheckInOverlayProvider';
import PointsOverlay from './components/checkin/PointsOverlay';
```

Wrap the returned tree in the provider and render the overlay once. Change the
top of the returned JSX from:
```jsx
  return (
    <>
      {hasUpdate && <UpdateBanner onRefresh={applyUpdate} onDismiss={dismiss} />}
```
to:
```jsx
  return (
    <CheckInOverlayProvider>
      {hasUpdate && <UpdateBanner onRefresh={applyUpdate} onDismiss={dismiss} />}
```
and the closing `</>` (just after `</Routes>`) to:
```jsx
      <PointsOverlay />
    </CheckInOverlayProvider>
```

Add the `/tap` route alongside the other public routes (it manages its own auth,
so it is NOT wrapped in `PublicRoute` and NOT inside `AppShell`):
```jsx
        <Route path="/tap" element={<Tap />} />
```

- [ ] **Step 3: Verify the app builds**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — all green.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: mount /tap route + check-in overlay in App"
```

---

## Task 10: Login replay wiring

Both login success paths route via `postAuthDestination()` so a pending tap
replays instead of always going to `/home`.

**Files:**
- Modify: `frontend-user/src/pages/Login.jsx`

- [ ] **Step 1: Add the import**

In `frontend-user/src/pages/Login.jsx`, add near the other imports:
```jsx
import { postAuthDestination } from '../utils/postAuthDestination';
```

- [ ] **Step 2: Update `handleCredentials` success path**

In `handleCredentials`, in the `else if (data.accessToken)` branch, change:
```jsx
        navigate('/home', { replace: true });
```
to:
```jsx
        navigate(postAuthDestination(), { replace: true });
```

- [ ] **Step 3: Update `handleTotp` success path**

In `handleTotp`, change:
```jsx
      navigate('/home', { replace: true });
```
to:
```jsx
      navigate(postAuthDestination(), { replace: true });
```

- [ ] **Step 4: Add a regression test**

Create `frontend-user/src/pages/Login.replay.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigateMock }));

const authLoginMock = vi.fn();
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: authLoginMock }) }));

vi.mock('../api/auth', () => ({
  login: vi.fn().mockResolvedValue({
    accessToken: 'eyJ.' + btoa(JSON.stringify({ sub: 1, email: 'a@b.com', role: 'user' })) + '.sig',
    refreshToken: 'r', user: { firstName: 'A' },
  }),
  verifyLogin2FA: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(), resendOtp: vi.fn(),
}));

import { setPendingTap } from '../services/tapContext';
vi.unmock('../services/tapContext');

import Login from './Login';

function renderLogin() {
  return render(<MemoryRouter><Login /></MemoryRouter>);
}

describe('Login replay', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

  it('navigates to /home when no tap is pending', async () => {
    renderLogin();
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'Password1');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(navigateMock).toHaveBeenCalledWith('/home', { replace: true });
  });

  it('replays the tap when one is pending', async () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    renderLogin();
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'Password1');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(navigateMock).toHaveBeenCalledWith('/tap?node=node-abc&business=42', { replace: true });
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm test -- "Login.replay"`
Expected: PASS — 2 tests. (If the password placeholder differs, match the actual `placeholder` text in `Login.jsx`.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/Login.jsx src/pages/Login.replay.test.jsx
git commit -m "feat: replay pending tap after login"
```

---

## Task 11: Register auto-login + replay

Use the access/refresh tokens the backend already returns from registration OTP
verification to log the new user straight in and replay the tap — no second login.

**Files:**
- Modify: `frontend-user/src/pages/Register.jsx`

- [ ] **Step 1: Add imports**

In `frontend-user/src/pages/Register.jsx`, add:
```jsx
import { useAuth } from '../context/AuthContext';
import { postAuthDestination } from '../utils/postAuthDestination';
```

- [ ] **Step 2: Pull `login` and add a JWT decoder**

Inside the `Register` component, add at the top (next to `const navigate = useNavigate();`):
```jsx
  const { login: authLogin } = useAuth();
```
Add a small decoder helper above the component (mirroring Login.jsx):
```jsx
function decodeJWT(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return {}; }
}
```

- [ ] **Step 3: Rewrite `handleVerify` to auto-login + replay**

Replace the body of `handleVerify` with:
```jsx
  async function handleVerify(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await verifySetup2FA(userId, otpCode);
      sessionStorage.removeItem(SESSION_KEY);

      // The backend returns full tokens here — log the new user in directly
      // (no bounce to /login) and replay any pending tap so they earn now.
      if (data?.accessToken && data?.refreshToken) {
        const payload = decodeJWT(data.accessToken);
        authLogin(data.accessToken, data.refreshToken, {
          id: payload.sub, email: payload.email, role: payload.role,
          firstName: data.user?.firstName ?? null,
          lastName: data.user?.lastName ?? null,
          avatarUrl: data.user?.avatarUrl ?? null,
        });
        navigate(postAuthDestination(), { replace: true });
      } else {
        // Fallback: backend didn't issue tokens — keep the old behaviour.
        setStep(3);
        setTimeout(() => navigate('/login'), 2000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code. Please try again.');
      setOtpCode('');
    } finally {
      setLoading(false);
    }
  }
```

- [ ] **Step 4: Add a regression test**

Create `frontend-user/src/pages/Register.replay.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigateMock }));

const authLoginMock = vi.fn();
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: authLoginMock }) }));

const accessToken = 'eyJ.' + btoa(JSON.stringify({ sub: 7, email: 'n@b.com', role: 'user' })) + '.sig';
vi.mock('../api/auth', () => ({
  register: vi.fn(),
  verifySetup2FA: vi.fn().mockResolvedValue({ verified: true, accessToken, refreshToken: 'r', user: { firstName: 'N' } }),
  resendOtp: vi.fn(),
}));

import Register from './Register';

describe('Register replay', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

  it('auto-logs-in and replays the pending tap after OTP verify', async () => {
    // Seed the OTP step directly via the component's sessionStorage restore key.
    sessionStorage.setItem('tapprove_register_otp', JSON.stringify({ userId: 7, email: 'n@b.com' }));
    sessionStorage.setItem('tapprove_pending_tap', JSON.stringify({ node: 'node-abc', business: 42, ts: Date.now() }));

    render(<MemoryRouter><Register /></MemoryRouter>);
    await userEvent.type(screen.getByPlaceholderText('000000'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify & activate account/i }));

    expect(authLoginMock).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/tap?node=node-abc&business=42', { replace: true });
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm test -- "Register.replay"`
Expected: PASS — 1 test.

- [ ] **Step 6: Run the full suite + build**

Run: `npm test && npm run build`
Expected: all tests PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Register.jsx src/pages/Register.replay.test.jsx
git commit -m "feat: auto-login + tap replay after registration"
```

---

## Task 12: Netlify routing flip

Stop proxying `/tap` to the backend stranger page so react-router serves the SPA
`/tap` route. (Leave `/till` proxy in place — Phase 2 handles it.)

**Files:**
- Modify: `netlify.toml` (repo root)

- [ ] **Step 1: Remove the `/tap` redirect block**

In `netlify.toml`, delete the block:
```toml
[[redirects]]
  from   = "/tap"
  to     = "https://api.tapprove.io/api/public/tap"
  status = 200
  force  = true
```
(Match the exact existing block, including its comment lines and any `status`/`force` keys. Keep the `/till` block and the `/* → /index.html` catch-all.)

- [ ] **Step 2: Confirm the catch-all still follows**

Verify the `/* → /index.html` rewrite (status 200) remains the last redirect rule,
so `/tap?node=…&business=…` now falls through to the SPA with its query string
intact.

- [ ] **Step 3: Commit**

```bash
git add netlify.toml
git commit -m "chore: route /tap to the SPA instead of the backend stranger page"
```

---

## Task 13: Manual verification on pre-staging

Automated tests cover logic and branches; this confirms the real loop end-to-end.

- [ ] **Step 1: Build + preview locally**

Run (from `frontend-user/`): `npm run build && npm run preview`
Open the preview URL. Manually visit `/tap?node=<real-node>&business=<real-business>`
for a business that exists in the connected backend.

- [ ] **Step 2: Logged-out path**

Logged out, visit `/tap?...`. Expected: landing shows the business name (+ offer if
any); "Sign in to collect points" and "Create account" appear. Click Sign in → log
in → land on the points overlay showing `+N points at <business>`; closing it lands
on `/home`.

- [ ] **Step 3: Logged-in path**

Already logged in, visit `/tap?...`. Expected: brief spinner → points overlay
directly, no landing. If the business has an active offer, "Browse our latest
offers" appears and opens `/offer/<id>`.

- [ ] **Step 4: New-user path**

Logged out, visit `/tap?...` → Create account → complete registration + email OTP.
Expected: no second login; the points overlay appears immediately after OTP.

- [ ] **Step 5: Idempotency / same-day**

Visit `/tap?...` twice in a row while logged in. Expected: the second tap shows the
overlay with 0 (or the backend's same-day result) and does not double-award.

- [ ] **Step 6: Deploy to pre-staging**

Push `pre-staging`. Confirm the Netlify deploy serves `/tap` from the SPA (not the
backend HTML page) by tapping a real tag on a device where the app does not open.

```bash
git push origin pre-staging
```

---

## Self-Review

**Spec coverage:**
- Resume-after-auth (3 cases) → Tasks 2, 3, 10, 11 ✓
- `/tap` SPA ownership + state machine → Tasks 8, 9, 12 ✓
- Stranger landing → Task 7 ✓
- PointsOverlay (tier variants, haptics/sound, conditional offer button) → Task 6 ✓
- Proximity + public API clients → Task 4 ✓
- Cold-start race guard → Task 8 (waits on `loading`) ✓
- Pending-tap TTL / clear-on-consume → Task 2 ✓
- Backend reuse only → no backend tasks ✓
- Till / Socket.IO / "Open in app" → correctly **excluded** (Phase 2 / dropped) ✓

**Out of scope for Phase 1 (tracked for Phase 2):** `/till` route, `socket.io-client`,
`userSocket`/`useUserSocket`, the `/till` netlify block, and `tillArrive()` in the
proximity client.

**Type/name consistency:** `nfcCheckin({node, business})`, `getStrangerDisplay(businessId)`,
`fireStrangerVisit({node, business})`, overlay context `{ active, result, offer, trigger,
setOffer, dismiss }`, `setPendingTap({node, business})` / `getPendingTap()` /
`clearPendingTap()`, `postAuthDestination()` — used consistently across Tasks 2–11.

**Assumptions to verify during execution (not blockers):**
- The exact `/tap` redirect block text in `netlify.toml` (Task 12) — match what's there.
- Button class names (`btn-secondary`, `btn-ghost`, `card`) exist in `global.css`; if a
  class is missing, use the nearest existing equivalent.
- The password field placeholder in `Login.jsx` (Task 10 test) — match the actual text.
