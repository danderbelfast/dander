# Offer Attribution — Plan 2.5: Post-auth intent decoupling

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps.

**Goal:** Guarantee a check-in (and, later, `entry_conversion`) originates ONLY from a real `/tap` visit — the offer/window channel must NEVER produce a check-in. Make the two post-auth intents mutually exclusive (most-recent-wins) and consume the pending tap so it can't linger and hijack a different-channel signup.

**Why now:** before Plan 3 wires conversion hooks onto the check-in event, the check-in must be a clean "physical visit via `/tap`" signal. Today `postAuthDestination` is channel-blind (pending-tap > return-path > /home), so a stale pending tap from an earlier `/tap` hijacks an offer-link signup → unearned points + wrong destination, and would pollute/misattribute Plan 3's funnel.

**Architecture:** A tiny `postAuthIntent` coordinator owns the two setters and clears the other on set (single active intent; storage modules `tapContext`/`returnPath` stay storage-only — no circular imports). `postAuthDestination` clears the pending tap when it returns the `/tap` replay (tight consume). `setReturnPath`-via-coordinator clears any stale pending tap, so an offer signup can't inherit a check-in.

**Tech Stack:** React + Vitest. **Branch:** worktree off `pre-staging`.

**Definition of done (device-verified on staging):**
- (a) offer-link signup → lands back on the offer to activate, **no check-in points**;
- (b) check-in (`/tap`) signup → still awards points + reward overlay;
- (c) a stale pending tap from a prior `/tap` **cannot** replay during an offer-link signup.

---

## Task 1: `postAuthIntent` coordinator (TDD)

**Files:** Create `frontend-user/src/services/postAuthIntent.js` (+ `.test.js`)

- [ ] **Step 1: Failing test** — `frontend-user/src/services/postAuthIntent.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { setTapIntent, setReturnIntent } from './postAuthIntent';
import { getPendingTap, setPendingTap, clearPendingTap } from './tapContext';
import { getReturnPath, setReturnPath, clearReturnPath } from './returnPath';

describe('postAuthIntent (single active intent)', () => {
  beforeEach(() => { clearPendingTap(); clearReturnPath(); });

  it('setTapIntent sets the tap and clears any return path', () => {
    setReturnPath('/offer/3');
    setTapIntent({ node: 'node-abc', business: 42 });
    expect(getPendingTap()).toEqual({ node: 'node-abc', business: 42 });
    expect(getReturnPath()).toBeNull();
  });

  it('setReturnIntent sets the return path and clears any pending tap', () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    setReturnIntent('/business/4/offers');
    expect(getReturnPath()).toBe('/business/4/offers');
    expect(getPendingTap()).toBeNull();
  });

  it('most-recent-intent wins (offer after tap → only return path)', () => {
    setTapIntent({ node: 'n', business: 1 });
    setReturnIntent('/offer/9');
    expect(getPendingTap()).toBeNull();
    expect(getReturnPath()).toBe('/offer/9');
  });
});
```

- [ ] **Step 2:** `npm test -- postAuthIntent` → FAIL (no module).

- [ ] **Step 3: Implement** `frontend-user/src/services/postAuthIntent.js`:
```js
// Single source of truth for "what to do after auth". The two intents —
// a pending NFC tap (check-in) and a return path (offer/window) — are
// MUTUALLY EXCLUSIVE: setting one clears the other (most-recent-intent wins).
// This guarantees a check-in only ever originates from a real /tap, and an
// offer-link signup can never inherit a stale check-in.
import { setPendingTap, clearPendingTap } from './tapContext';
import { setReturnPath, clearReturnPath } from './returnPath';

export function setTapIntent({ node, business }) {
  clearReturnPath();
  setPendingTap({ node, business });
}

export function setReturnIntent(path) {
  clearPendingTap();
  setReturnPath(path);
}

export function clearAllIntents() {
  clearPendingTap();
  clearReturnPath();
}
```

- [ ] **Step 4:** `npm test -- postAuthIntent` → PASS (3).
- [ ] **Step 5:** Commit:
```bash
git add src/services/postAuthIntent.js src/services/postAuthIntent.test.js
git commit -m "feat: postAuthIntent coordinator (mutually-exclusive post-auth intents)"
```

---

## Task 2: Route TapLanding through `setTapIntent`

**Files:** Modify `frontend-user/src/components/checkin/TapLanding.jsx` (+ `.test.jsx`)

- [ ] **Step 1:** In `TapLanding.jsx`, replace the import:
```jsx
import { setPendingTap } from '../../services/tapContext';
```
with:
```jsx
import { setTapIntent } from '../../services/postAuthIntent';
```
and change the call site `setPendingTap({ node, business });` → `setTapIntent({ node, business });`.

- [ ] **Step 2:** In `TapLanding.test.jsx`, update the mock + import + assertions from `tapContext`/`setPendingTap` to `postAuthIntent`/`setTapIntent`:
```jsx
vi.mock('../../services/postAuthIntent', () => ({ setTapIntent: vi.fn() }));
```
```jsx
import { setTapIntent } from '../../services/postAuthIntent';
```
and the two assertions:
```jsx
    expect(setTapIntent).toHaveBeenCalledWith({ node: 'node-abc', business: 42 });
```
(Replace both `setPendingTap` assertions; remove the old `tapContext` mock/import.)

- [ ] **Step 3:** `npm test -- TapLanding` → PASS (4). Full `npm test` green.
- [ ] **Step 4:** Commit:
```bash
git add src/components/checkin/TapLanding.jsx src/components/checkin/TapLanding.test.jsx
git commit -m "feat: TapLanding sets tap intent via coordinator"
```

---

## Task 3: Route ActivateButton through `setReturnIntent`

**Files:** Modify `frontend-user/src/components/offers/ActivateButton.jsx` (+ `.test.jsx`)

- [ ] **Step 1:** In `ActivateButton.jsx`, replace the import:
```jsx
import { setReturnPath } from '../../services/returnPath';
```
with:
```jsx
import { setReturnIntent } from '../../services/postAuthIntent';
```
and change `setReturnPath(returnTo || '/my-offers');` → `setReturnIntent(returnTo || '/my-offers');`.

- [ ] **Step 2:** In `ActivateButton.test.jsx`, update the mock + import + assertion:
```jsx
vi.mock('../../services/postAuthIntent', () => ({ setReturnIntent: vi.fn() }));
```
```jsx
import { setReturnIntent } from '../../services/postAuthIntent';
```
```jsx
    expect(setReturnIntent).toHaveBeenCalledWith('/my-offers');
```
(Replace the `returnPath`/`setReturnPath` mock/import/assertion.)

- [ ] **Step 3:** `npm test -- ActivateButton` → PASS (2). Full `npm test` green.
- [ ] **Step 4:** Commit:
```bash
git add src/components/offers/ActivateButton.jsx src/components/offers/ActivateButton.test.jsx
git commit -m "feat: ActivateButton sets return intent via coordinator"
```

---

## Task 4: `postAuthDestination` consumes the pending tap

**Files:** Modify `frontend-user/src/utils/postAuthDestination.js` (+ `.test.js`)

- [ ] **Step 1: Failing test** — add to `postAuthDestination.test.js` inside the describe (the file already imports `setPendingTap`/`clearPendingTap` from tapContext):
```js
  it('consumes (clears) the pending tap after returning the /tap replay', () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    expect(postAuthDestination()).toBe('/tap?node=node-abc&business=42');
    expect(postAuthDestination()).toBe('/home');   // consumed — no replay second time
  });
```

- [ ] **Step 2:** `npm test -- postAuthDestination` → the new test FAILS (pending tap currently persists across calls).

- [ ] **Step 3: Implement** — update `frontend-user/src/utils/postAuthDestination.js` to import `clearPendingTap` and clear on consume:
```js
import { getPendingTap, clearPendingTap } from '../services/tapContext';
import { getReturnPath, clearReturnPath } from '../services/returnPath';

// Where to send a user the moment a session becomes real. The two intents are
// mutually exclusive (see postAuthIntent), but we still consume whichever we
// return so nothing lingers to hijack a later signup. Priority is a belt-and-
// braces tiebreak only — in practice at most one intent is ever set.
export function postAuthDestination() {
  const pending = getPendingTap();
  if (pending) {
    clearPendingTap();
    const node = encodeURIComponent(pending.node);
    const business = encodeURIComponent(String(pending.business));
    return `/tap?node=${node}&business=${business}`;
  }
  const ret = getReturnPath();
  if (ret) { clearReturnPath(); return ret; }
  return '/home';
}
```
(`Tap.jsx` still calls `clearPendingTap()` after the award — now a harmless no-op; Tap reads node/business from the URL, not the stash, so consuming here is safe.)

- [ ] **Step 4:** `npm test -- postAuthDestination` → all PASS (original + new). Full `npm test` green; `npm run build` succeeds.
- [ ] **Step 5:** Commit:
```bash
git add src/utils/postAuthDestination.js src/utils/postAuthDestination.test.js
git commit -m "fix: postAuthDestination consumes the pending tap (no lingering replay)"
```

---

## Task 5: Verify + merge

- [ ] **Step 1:** Full `npm test` (all green) + `npm run build` (success).
- [ ] **Step 2:** Merge to `pre-staging` (FF), push (staging deploy).
- [ ] **Step 3: Device-verify the DoD on staging** (user):
  - (a) From `/business/4/offers` (logged out) → Activate → "Sign in to save" → sign up → **land back on the offers**, no points/overlay.
  - (b) From `/tap?node=x&business=4` (logged out) → sign up → **points + reward overlay** as before.
  - (c) Start a `/tap` (don't finish) → then go to `/business/4/offers` → Activate → sign up → **back to offers, no points** (the stale tap was cleared by the offer intent).

---

## Self-Review

**DoD coverage:** (a) offer signup → returnPath only (pending cleared by `setReturnIntent`) → back to offer, no check-in — Tasks 1,3 ✓; (b) `/tap` signup → tap intent → replay → points/overlay — Tasks 1,2 unchanged behavior ✓; (c) stale pending tap cleared when offer activate sets return intent — Task 1,3 ✓; plus tight-consume so nothing lingers — Task 4 ✓.
**Principle locked:** check-in originates only from `/tap`; offer/window never checks in.
**Placeholders:** none. **Names:** `setTapIntent`/`setReturnIntent`/`clearAllIntents`; storage `setPendingTap`/`setReturnPath` now only called by the coordinator.
**No circular imports:** coordinator imports the two storage modules; they import nothing back.
