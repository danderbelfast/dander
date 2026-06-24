# Offer Attribution — Plan 2.6: Firm the activate acquisition journey

> REQUIRED SUB-SKILL: subagent-driven-development / executing-plans. Checkbox steps. Worktree off `pre-staging`, TDD, device-verify.

**Goal:** Turn anon Activate into a proper customer-acquisition journey (the window sticker is the funnel): capture the anon intent immediately, then route to a **value-framed register** screen, and after signup **stitch → land on My Offers with the offer there**. Authed Activate stays put (toast + "Activated ✓"). Resolves the offers-page dead-end (the way off the page IS this journey).

**Confirmed decisions:**
- Anon Activate → capture anon (keep) → route **register-first** (with "already have an account? Sign in") + offer-context banner → after auth, stitch → **My Offers** (refines Plan 2.5 DoD(a): destination is now My Offers, not back to the offer).
- Authed Activate → **stay put**: toast "Saved to My Offers" + button → "Activated ✓" (don't interrupt browsing).
- Browse all offers freely; the signup ask fires only on Activate.

**Reuses** Plans 2/2.5: `setReturnIntent` + `postAuthDestination` + `AuthContext` stitch already exist. New: an `authPrompt` stash + banner, ActivateButton behavior change, and My-Offers stitch-then-fetch (race fix).

**DoD (device-verified on staging):**
- (a) Logged-out Activate (any surface) → register screen shows the offer-context banner → create account → **lands on My Offers with that offer listed**.
- (b) "Already have an account? Sign in" from that screen → login → same My Offers landing with the offer.
- (c) Authed Activate → toast "Saved to My Offers" + "Activated ✓", **no navigation**; offer shows when you open the My Offers tab.
- (d) Browsing offers without activating never prompts signup.

---

## Task 1: `authPrompt` stash (TDD)

**Files:** Create `frontend-user/src/services/authPrompt.js` (+ `.test.js`)

- [ ] **Step 1: Failing test** — `authPrompt.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { setAuthPrompt, getAuthPrompt, clearAuthPrompt } from './authPrompt';

describe('authPrompt', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('returns null when unset', () => { expect(getAuthPrompt()).toBeNull(); });

  it('stores and reads back an offer-context prompt', () => {
    setAuthPrompt({ offerTitle: '20% off pastries' });
    expect(getAuthPrompt()).toEqual({ offerTitle: '20% off pastries' });
  });

  it('tolerates a missing title (generic prompt)', () => {
    setAuthPrompt({});
    expect(getAuthPrompt()).toEqual({ offerTitle: null });
  });

  it('clears', () => {
    setAuthPrompt({ offerTitle: 'x' });
    clearAuthPrompt();
    expect(getAuthPrompt()).toBeNull();
  });
});
```

- [ ] **Step 2:** `npm test -- authPrompt` → FAIL.

- [ ] **Step 3: Implement** `frontend-user/src/services/authPrompt.js`:
```js
// Offer-context for the auth screen when a logged-out user activates an offer.
// Drives the value-framed banner ("save this offer"). sessionStorage, 30-min TTL.
const KEY = 'tapprove_auth_prompt';
const TTL_MS = 30 * 60 * 1000;

export function setAuthPrompt({ offerTitle } = {}) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ offerTitle: offerTitle ?? null, ts: Date.now() }));
  } catch { /* ignore */ }
}

export function getAuthPrompt() {
  let raw;
  try { raw = sessionStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  let p;
  try { p = JSON.parse(raw); } catch { clearAuthPrompt(); return null; }
  const fresh = typeof p?.ts === 'number' && (Date.now() - p.ts) <= TTL_MS;
  if (!fresh) { clearAuthPrompt(); return null; }
  return { offerTitle: p.offerTitle ?? null };
}

export function clearAuthPrompt() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
```

- [ ] **Step 4:** `npm test -- authPrompt` → PASS (4). **Step 5:** Commit `feat: authPrompt stash for value-framed auth banner`.

---

## Task 2: `AuthPromptBanner` (TDD)

**Files:** Create `frontend-user/src/components/auth/AuthPromptBanner.jsx` (+ `.test.jsx`)

- [ ] **Step 1: Failing test** — `AuthPromptBanner.test.jsx`:
```jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setAuthPrompt, clearAuthPrompt } from '../../services/authPrompt';
import AuthPromptBanner from './AuthPromptBanner';

describe('AuthPromptBanner', () => {
  beforeEach(() => { clearAuthPrompt(); });

  it('renders nothing when no prompt', () => {
    const { container } = render(<AuthPromptBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a value-framed message with the offer title', () => {
    setAuthPrompt({ offerTitle: '20% off pastries' });
    render(<AuthPromptBanner />);
    expect(screen.getByText(/20% off pastries/)).toBeInTheDocument();
    expect(screen.getByText(/redeem it in store/i)).toBeInTheDocument();
  });

  it('shows a generic message when no title', () => {
    setAuthPrompt({});
    render(<AuthPromptBanner />);
    expect(screen.getByText(/save your offer/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2:** `npm test -- AuthPromptBanner` → FAIL.

- [ ] **Step 3: Implement** `frontend-user/src/components/auth/AuthPromptBanner.jsx`:
```jsx
import React from 'react';
import { getAuthPrompt } from '../../services/authPrompt';

// Value-framed banner shown on Register/Login when a logged-out user activated
// an offer — turns a cold auth screen into "create an account to save your offer".
export default function AuthPromptBanner() {
  const prompt = getAuthPrompt();
  if (!prompt) return null;
  return (
    <div className="card" style={{ margin: '0 0 16px', padding: 14, borderRadius: 12, background: 'rgba(255,107,53,0.10)', borderLeft: '3px solid #FF6B35' }}>
      <div style={{ fontWeight: 700 }}>🎟️ Create a free account to save your offer</div>
      <div className="text-muted" style={{ fontSize: '0.9rem', marginTop: 4 }}>
        {prompt.offerTitle
          ? <>Save <strong>{prompt.offerTitle}</strong> and redeem it in store at the till.</>
          : <>Save your offer and redeem it in store at the till.</>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4:** `npm test -- AuthPromptBanner` → PASS (3). **Step 5:** Commit `feat: AuthPromptBanner (offer-context value framing)`.

---

## Task 3: ActivateButton — route anon to register, authed stays put (TDD)

**Files:** Modify `frontend-user/src/components/offers/ActivateButton.jsx` (+ `.test.jsx`)

- [ ] **Step 1: Update the test** — `ActivateButton.test.jsx`. Add mocks for `authPrompt` + keep `postAuthIntent`:
```jsx
vi.mock('../../services/authPrompt', () => ({ setAuthPrompt: vi.fn() }));
```
Import `setAuthPrompt`. Replace the toast mock usage. New test bodies:
```jsx
  it('authed: activates, shows Activated, toasts saved, does NOT navigate', async () => {
    renderBtn({ offerTitle: '20% off pastries' });
    await userEvent.click(screen.getByRole('button', { name: /^activate$/i }));
    expect(activateOffer).toHaveBeenCalledWith(7, { channel: 'web' });
    expect(await screen.findByRole('button', { name: /activated/i })).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('anon: captures, stashes auth prompt + return intent to My Offers, routes to register', async () => {
    authState = { isAuth: false };
    renderBtn({ offerTitle: '20% off pastries' });
    await userEvent.click(screen.getByRole('button', { name: /^activate$/i }));
    expect(activateOffer).toHaveBeenCalledWith(7, { channel: 'web', anonId: 'anon-test' });
    expect(setAuthPrompt).toHaveBeenCalledWith({ offerTitle: '20% off pastries' });
    expect(setReturnIntent).toHaveBeenCalledWith('/my-offers');
    expect(navigateMock).toHaveBeenCalledWith('/register');
  });
```
(Import `setReturnIntent` from `'../../services/postAuthIntent'` — it's already mocked from Plan 2.5. Add `setAuthPrompt` to imports.)

- [ ] **Step 2:** `npm test -- ActivateButton` → FAIL (current behavior toasts + inline link, doesn't route).

- [ ] **Step 3: Implement** — replace `ActivateButton.jsx` body. Key changes: add `offerTitle` prop; authed branch toasts "Saved to My Offers"; anon branch routes to register; remove the inline "Sign in to save" button:
```jsx
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { activateOffer, deactivateOffer } from '../../api/offers';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getAnonId } from '../../services/anonId';
import { setReturnIntent } from '../../services/postAuthIntent';
import { setAuthPrompt } from '../../services/authPrompt';
import { resolveActivationChannel } from '../../utils/activationChannel';

// Activate = the attribution intent event. Authed → save to My Offers, stay put.
// Anon → capture the intent (funnel signal) THEN route to a value-framed register
// (the acquisition journey); after signup the offer is stitched onto the account
// and they land on My Offers. Channel from the URL (?src).
export default function ActivateButton({ offerId, offerTitle, initialActivated = false, className = '' }) {
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
        else {
          await activateOffer(offerId, { channel });
          setActivated(true);
          toast({ type: 'success', title: 'Saved to My Offers', message: 'Show it at the till to redeem.' });
        }
      } else {
        // Capture the anon intent first (funnel signal), then route to the
        // value-framed acquisition journey → register → stitch → My Offers.
        await activateOffer(offerId, { channel, anonId: getAnonId() });
        setAuthPrompt({ offerTitle: offerTitle ?? null });
        setReturnIntent('/my-offers');
        navigate('/register');
      }
    } catch {
      toast({ type: 'error', title: 'Something went wrong', message: 'Could not activate this offer.' });
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <button
      className={`btn ${activated ? 'btn-secondary' : 'btn-primary'} ${className}`.trim()}
      onClick={onClick}
      disabled={busy}
      aria-pressed={activated}
    >
      {activated ? 'Activated ✓' : 'Activate'}
    </button>
  );
}
```

- [ ] **Step 4:** `npm test -- ActivateButton` → PASS. **Step 5:** Commit `feat: ActivateButton acquisition journey (anon→register, authed→save+stay)`.

---

## Task 4: Banner on Register + Login; clear on auth

**Files:** Modify `Register.jsx`, `Login.jsx`, `context/AuthContext.jsx`

- [ ] **Step 1:** In `Register.jsx`: `import AuthPromptBanner from '../components/auth/AuthPromptBanner';` and render `<AuthPromptBanner />` near the top of the step-1 (create-account) form (right after the logo / above the title).
- [ ] **Step 2:** In `Login.jsx`: same import; render `<AuthPromptBanner />` near the top of the step-1 (credentials) form.
- [ ] **Step 3:** In `AuthContext.jsx` `login` callback, add `clearAuthPrompt()` (import it) right after the stitch line, so the banner is gone post-auth:
```jsx
import { clearAuthPrompt } from '../services/authPrompt';
```
```jsx
    stitchActivations(getAnonId()).catch(() => {});
    clearAuthPrompt();
```
- [ ] **Step 4:** Full `npm test` green; `npm run build` succeeds. **Step 5:** Commit `feat: show offer-context banner on register/login; clear on auth`.

---

## Task 5: My Offers stitch-then-fetch + offerTitle on surfaces

**Files:** Modify `pages/MyOffers.jsx` (+ `.test.jsx`), `pages/OfferDetail.jsx`, `pages/BusinessOffers.jsx`, `components/offers/OfferCard.jsx`

- [ ] **Step 1: MyOffers race fix.** In `MyOffers.jsx`, stitch before fetching so a just-claimed anon offer is present on landing. Add imports `import { stitchActivations } from '../api/offers';` and `import { getAnonId } from '../services/anonId';`, and change the effect:
```jsx
  useEffect(() => {
    let alive = true;
    (async () => {
      try { await stitchActivations(getAnonId()); } catch { /* idempotent; ignore */ }
      try {
        const d = await getMyOffers();
        if (alive) setOffers(Array.isArray(d.offers) ? d.offers : []);
      } catch { if (alive) setError(true); }
    })();
    return () => { alive = false; };
  }, []);
```
- [ ] **Step 2: MyOffers test.** In `MyOffers.test.jsx`, extend the `../api/offers` mock to include `stitchActivations: vi.fn().mockResolvedValue({ stitched: 0 })`, and mock `../services/anonId` → `{ getAnonId: () => 'a' }`. Existing assertions still hold.
- [ ] **Step 3: Pass offerTitle.** Add `offerTitle={...}` to each ActivateButton:
  - `OfferDetail.jsx`: `<ActivateButton offerId={offer.id} offerTitle={offer.title} className="btn-block btn-lg" initialActivated={offer.is_activated ?? false} />` (drop the now-unused `returnTo` prop).
  - `BusinessOffers.jsx`: `<ActivateButton offerId={o.id} offerTitle={o.title} />`
  - `OfferCard.jsx`: `<ActivateButton offerId={offer.id} offerTitle={offer.title} />`
- [ ] **Step 4:** `npm test -- "pages/MyOffers"` → PASS; full `npm test` green; `npm run build` succeeds. **Step 5:** Commit `feat: My Offers stitch-then-fetch + offer titles on activate buttons`.

---

## Task 6: Verify + merge

- [ ] **Step 1:** Full `npm test` (all green) + `npm run build`.
- [ ] **Step 2:** Merge to `pre-staging` (FF), push (staging deploy).
- [ ] **Step 3: Device-verify DoD (a)-(d) on staging** (user). Curl can't cover the JS journey; this is a device check.

---

## Self-Review
- DoD(a)/(b): anon Activate → register/login banner → auth → stitch → My Offers with offer — Tasks 1-5 ✓ (My-Offers stitch-then-fetch guarantees "offer there").
- DoD(c): authed Activate → toast + Activated ✓, no nav — Task 3 ✓.
- DoD(d): browse-free, prompt only on Activate — unchanged (Activate is the only trigger) ✓.
- Reuses Plan 2.5 coordinator: `setReturnIntent('/my-offers')` clears any stale tap → no points on the offer journey ✓.
- Names: `setAuthPrompt/getAuthPrompt/clearAuthPrompt`; `AuthPromptBanner`; `ActivateButton({offerId, offerTitle, initialActivated, className})` (returnTo prop removed). No circular imports.
- Login-time stitch (Plan 2) retained for non-My-Offers landings; My-Offers stitch is the authoritative one for the landing (both idempotent).
