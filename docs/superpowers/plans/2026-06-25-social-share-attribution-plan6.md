# Social Share Per-Platform Attribution — Plan 6 (implementation)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps; TDD where a harness exists.

**Goal:** Recipient who opens a shared link and activates → stamped `channel='social'`, `source='social_<platform>'`, surfaced in Offer Performance's "By channel: Social". Built on the 5A/5B backbone.

**Sequence (load-bearing first):** Part B (forward `?src` through the OG redirect — without it nothing flows) → Part C (the `social` channel) → Part A (the per-platform ShareSheet UI).

**Tech Stack:** Express + pg; React + Vite + Vitest; node:test. **Branch:** worktree off `pre-staging`.

**Locked decisions:** social = own coarse channel; per-platform buttons FB/WhatsApp/X/Telegram (+ priority FB/WhatsApp/Instagram), IG/TikTok = copy tagged link, native "More…" → `social_other`; **generic "Copy link" = clean canonical (no tag)**; reuse OG image; **add `/o/` redirect to the staging site** (self-contained staging verification).

**Definition of done (verified on staging):**
- (a) `GET /api/v1/offers/:id/og?src=social_facebook` returns HTML whose redirect URL is `/offer/:id?src=social_facebook` (query forwarded);
- (b) `channelFromSource('social_x')` → `'social'`; `resolveActivationChannel('src=social_facebook')` → `{channel:'social', source:'social_facebook'}`;
- (c) DB: an activation via a `social_facebook` link stores `channel='social'`, `source='social_facebook'`;
- (d) Offer Performance "By channel" shows a **Social** row aggregating all `social_*`;
- (e) ShareSheet shows FB/WhatsApp/Instagram/X/Telegram/TikTok/Copy link/(More…); platform buttons build `?src=social_<platform>`, generic Copy is untagged;
- (f) staging `/o/:id` redirect resolves (no SPA 404).

---

## PART B — Forward `?src` through the OG redirect

### Task 1: OG handler preserves the query string

**Files:** Modify `backend/routes/v1.js`

- [ ] **Step 1:** In `GET /offers/:id/og`, replace the hardcoded `appUrl`:
```js
      const appUrl  = `${config.USER_APP_URL}/offer/${offer.id}`;
```
with a query-forwarding build (placed where `appUrl` is currently defined, after `ogUrl`):
```js
      const qs = new URLSearchParams(req.query).toString();
      const appUrl = `${config.USER_APP_URL}/offer/${offer.id}${qs ? `?${qs}` : ''}`;
```
(`og:url` stays the canonical `/o/:id` — crawlers don't need the tag. Only the meta-refresh + body link target carries `?src`. `URLSearchParams` encodes safely; the funnel re-sanitizes `src` via `normalizeSource` on activate.)

- [ ] **Step 2:** `node --check backend/routes/v1.js` → clean.
- [ ] **Step 3:** Commit: `fix: OG redirect forwards query string (so ?src survives to the offer page)`.

### Task 2: Add the `/o/` redirect to the staging site

**Files:** Modify `frontend-user/netlify.toml`

- [ ] **Step 1:** Add the redirect **immediately before** the `from = "/*"` catch-all (Netlify is first-match, so it must precede it):
```toml
# Social share OG/preview — /o/:id serves OpenGraph meta (backend) then
# redirects to /offer/:id, FORWARDING ?src so social attribution survives.
# Staging targets staging-api so the full recipient→activation chain is
# verifiable on staging (mirrors root netlify.toml's prod redirect).
[[redirects]]
  from   = "/o/:id"
  to     = "https://staging-api.tapprove.io/api/v1/offers/:id/og"
  status = 200
  force  = true
```

- [ ] **Step 2:** Commit: `chore: staging /o/ redirect for social-share OG (self-contained staging)`.

- [ ] **Step 3 (manual, note for the user — not a code change):** For the *full* recipient chain on staging, the staging frontend site needs `VITE_PUBLIC_APP_URL` = the staging frontend origin (so share links point at staging), and staging-api needs `USER_APP_URL` (+ `API_PUBLIC_URL`) pointing at staging hosts. The query-forward itself (DoD a) is verifiable without these via a direct `og` curl.

---

## PART C — `social` coarse channel (same shape as 5A)

### Task 3: Migration — allow `channel='social'`

**Files:** Create `backend/db/migrations/063_offer_activation_channel_social.sql`

- [ ] **Step 1:**
```sql
-- ============================================================
--  Add 'social' as a coarse attribution channel (per-platform
--  social shares roll up here; fine source = social_<platform>).
--  Inline CHECK from 061 auto-named offer_activations_channel_check.
-- ============================================================
ALTER TABLE offer_activations DROP CONSTRAINT IF EXISTS offer_activations_channel_check;
ALTER TABLE offer_activations ADD CONSTRAINT offer_activations_channel_check
  CHECK (channel IN ('app', 'web', 'sticker', 'social'));
```
- [ ] **Step 2:** Commit: `feat: offer_activations channel allows 'social'`.

### Task 4: `channelFromSource` + `VALID_CHANNELS` (backend, TDD)

**Files:** Modify `backend/utils/offerChannel.js`, `backend/utils/offerChannel.test.js`

- [ ] **Step 1: Failing tests** — append:
```js
test('VALID_CHANNELS includes social', () => {
  assert.strictEqual(VALID_CHANNELS.has('social'), true);
});
test('channelFromSource maps social_* to social', () => {
  assert.strictEqual(channelFromSource('social_facebook'), 'social');
  assert.strictEqual(channelFromSource('social_instagram'), 'social');
  assert.strictEqual(channelFromSource('social_other'), 'social');
  assert.strictEqual(channelFromSource('social'), 'social');
});
```
- [ ] **Step 2:** `node --test backend/utils/offerChannel.test.js` → new ones FAIL.
- [ ] **Step 3: Implement** — add `'social'` to the set:
```js
const VALID_CHANNELS = new Set(['app', 'web', 'sticker', 'social']);
```
and in `channelFromSource`, add the social branch before the `web` fallback:
```js
  if (source.startsWith('sticker')) return 'sticker';
  if (source.startsWith('social'))  return 'social';
  if (source === 'app') return 'app';
  return 'web';
```
- [ ] **Step 4:** `node --test backend/utils/offerChannel.test.js` → all PASS.
- [ ] **Step 5:** Commit: `feat: channelFromSource maps social_* -> social`.

### Task 5: `resolveActivationChannel` maps social (frontend, TDD)

**Files:** Modify `frontend-user/src/utils/activationChannel.js`, `frontend-user/src/utils/activationChannel.test.js`

- [ ] **Step 1: Failing tests** — append inside the describe:
```js
  it('maps a social platform src to { channel: social, source }', () => {
    expect(resolveActivationChannel(new URLSearchParams('src=social_facebook')))
      .toEqual({ channel: 'social', source: 'social_facebook' });
  });
  it('maps social_other (native fallback) to social', () => {
    expect(resolveActivationChannel(new URLSearchParams('src=social_other')))
      .toEqual({ channel: 'social', source: 'social_other' });
  });
```
- [ ] **Step 2:** `cd frontend-user && ../node_modules/.bin/vitest run src/utils/activationChannel.test.js` → new ones FAIL.
- [ ] **Step 3: Implement** — add the social branch to the channel derivation:
```js
  const channel = source.startsWith('sticker') ? 'sticker'
    : source.startsWith('social') ? 'social'
    : source === 'app' ? 'app'
    : 'web';
```
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit: `feat: resolveActivationChannel maps social_* -> social`.

### Task 6: Dashboard "Social" label

**Files:** Modify `frontend-business/src/pages/OfferPerformance.jsx`

- [ ] **Step 1:** Extend the channel labels:
```js
const CHANNEL_LABELS = { sticker: 'Window sticker', web: 'Web', app: 'App', social: 'Social' };
```
- [ ] **Step 2:** Commit: `feat: Offer Performance shows the Social channel`.

---

## PART A — Per-platform ShareSheet UI (frontend-user)

### Task 7: `buildShareUrl` util (TDD)

**Files:** Create `frontend-user/src/utils/shareUrl.js` (+ `.test.js`)

- [ ] **Step 1: Failing test** — `shareUrl.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { buildShareUrl, buildCanonicalShareUrl } from './shareUrl';
import { PUBLIC_APP_URL } from '../config';

describe('shareUrl', () => {
  it('tags a platform share link with ?src=social_<platform>', () => {
    expect(buildShareUrl(7, 'facebook')).toBe(`${PUBLIC_APP_URL}/o/7?src=social_facebook`);
    expect(buildShareUrl(7, 'instagram')).toBe(`${PUBLIC_APP_URL}/o/7?src=social_instagram`);
    expect(buildShareUrl(7, 'other')).toBe(`${PUBLIC_APP_URL}/o/7?src=social_other`);
  });
  it('builds a clean canonical link (no tag) for the generic copy', () => {
    expect(buildCanonicalShareUrl(7)).toBe(`${PUBLIC_APP_URL}/o/7`);
  });
});
```
- [ ] **Step 2:** Run → FAIL (no module).
- [ ] **Step 3: Implement** `shareUrl.js`:
```js
import { PUBLIC_APP_URL } from '../config';

// Tagged share link: ?src=social_<platform> rides on /o/:id, survives the OG
// redirect (backend forwards query), and is stamped on the recipient's activation.
export function buildShareUrl(offerId, platform) {
  return `${PUBLIC_APP_URL}/o/${offerId}?src=social_${platform}`;
}

// Generic, channel-agnostic copy — no tag, so the recipient is attributed to
// whatever channel they actually activate from (no Social over-attribution).
export function buildCanonicalShareUrl(offerId) {
  return `${PUBLIC_APP_URL}/o/${offerId}`;
}
```
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat: shareUrl builders (tagged per-platform + clean canonical)`.

### Task 8: `ShareSheet` component (TDD)

**Files:** Create `frontend-user/src/components/offers/ShareSheet.jsx` (+ `.test.jsx`)

- [ ] **Step 1: Failing test** — `ShareSheet.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/offers', () => ({ trackShare: vi.fn().mockResolvedValue({}) }));
const toastMock = vi.fn();
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast: toastMock }) }));
import { trackShare } from '../../api/offers';
import { PUBLIC_APP_URL } from '../../config';
import ShareSheet from './ShareSheet';

const props = { offerId: 7, title: '20% off', text: 'Check out this deal', onClose: vi.fn() };

describe('ShareSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.open = vi.fn();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } });
  });

  it('renders the priority platforms + copy', () => {
    render(<ShareSheet {...props} open />);
    ['Facebook', 'WhatsApp', 'Instagram', 'X', 'Telegram', 'TikTok', 'Copy link']
      .forEach((l) => expect(screen.getByRole('button', { name: l })).toBeInTheDocument());
  });

  it('Facebook opens an intent URL tagged social_facebook', async () => {
    render(<ShareSheet {...props} open />);
    await userEvent.click(screen.getByRole('button', { name: 'Facebook' }));
    expect(trackShare).toHaveBeenCalledWith(7);
    const url = window.open.mock.calls[0][0];
    expect(url).toContain('facebook.com/sharer');
    expect(url).toContain(encodeURIComponent(`${PUBLIC_APP_URL}/o/7?src=social_facebook`));
  });

  it('Instagram copies the social_instagram-tagged link', async () => {
    render(<ShareSheet {...props} open />);
    await userEvent.click(screen.getByRole('button', { name: 'Instagram' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${PUBLIC_APP_URL}/o/7?src=social_instagram`);
  });

  it('Copy link copies the clean canonical (untagged) link', async () => {
    render(<ShareSheet {...props} open />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${PUBLIC_APP_URL}/o/7`);
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ShareSheet {...props} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```
- [ ] **Step 2:** Run → FAIL (no module).
- [ ] **Step 3: Implement** `ShareSheet.jsx`:
```jsx
import React from 'react';
import { buildShareUrl, buildCanonicalShareUrl } from '../../utils/shareUrl';
import { trackShare } from '../../api/offers';
import { useToast } from '../../context/ToastContext';

// Per-platform share with attribution. Web-intent platforms open their share
// dialog; Instagram/TikTok (no web intent) copy a tagged link; the generic Copy
// is untagged; "More…" uses the native share sheet tagged social_other.
const PLATFORMS = [
  { key: 'facebook',  label: 'Facebook',  kind: 'intent', intent: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { key: 'whatsapp',  label: 'WhatsApp',  kind: 'intent', intent: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
  { key: 'instagram', label: 'Instagram', kind: 'copy' },
  { key: 'x',         label: 'X',         kind: 'intent', intent: (u, t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { key: 'telegram',  label: 'Telegram',  kind: 'intent', intent: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: 'tiktok',    label: 'TikTok',    kind: 'copy' },
];

export default function ShareSheet({ offerId, title, text, open, onClose }) {
  const { toast } = useToast();
  if (!open) return null;

  const shareText = text || title || 'Check out this deal';
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy(url, message) {
    try {
      await navigator.clipboard.writeText(url);
      toast({ type: 'success', title: 'Link copied', message });
    } catch {
      toast({ type: 'error', title: 'Copy failed', message: 'Could not copy the link.' });
    }
  }

  function onPlatform(p) {
    trackShare(offerId).catch(() => {});
    const url = buildShareUrl(offerId, p.key);
    if (p.kind === 'intent') window.open(p.intent(url, shareText), '_blank', 'noopener');
    else copy(url, `Link copied — paste it into your ${p.label} story or bio.`);
    onClose();
  }
  function onCopyGeneric() {
    trackShare(offerId).catch(() => {});
    copy(buildCanonicalShareUrl(offerId), 'Share link copied to clipboard.');
    onClose();
  }
  async function onMore() {
    trackShare(offerId).catch(() => {});
    try { await navigator.share({ title: title || 'TapProve', text: shareText, url: buildShareUrl(offerId, 'other') }); } catch {}
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Share this offer" onClick={onClose} style={backdrop}>
      <div onClick={(e) => e.stopPropagation()} style={sheet}>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 12 }}>Share this deal</div>
        <div style={grid}>
          {PLATFORMS.map((p) => (
            <button key={p.key} type="button" onClick={() => onPlatform(p)} style={btn}>{p.label}</button>
          ))}
          <button type="button" onClick={onCopyGeneric} style={btn}>Copy link</button>
          {canNativeShare && <button type="button" onClick={onMore} style={btn}>More…</button>}
        </div>
        <button type="button" onClick={onClose} style={cancel}>Cancel</button>
      </div>
    </div>
  );
}

const backdrop = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' };
const sheet = { width: '100%', maxWidth: 480, background: '#fff', borderRadius: '16px 16px 0 0', padding: 20, boxShadow: '0 -8px 32px rgba(0,0,0,0.2)' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 };
const btn = { padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer' };
const cancel = { marginTop: 12, width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--c-text-muted, #666)', fontWeight: 600, cursor: 'pointer' };
```
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat: ShareSheet (per-platform share with attribution tags)`.

### Task 9: Wire ShareSheet into the three entry points

**Files:** Modify `OfferDetail.jsx`, `OfferCard.jsx`, `CouponClaimed.jsx`

- [ ] **Step 1 — OfferDetail.jsx:** import `ShareSheet`; add `const [shareOpen, setShareOpen] = useState(false);`; replace the body of `handleShare` with `setShareOpen(true);` (drop the inline `shareUrl`/`navigator.share`/`trackShare` — the sheet owns them); render near the page root:
```jsx
      <ShareSheet offerId={id} title={offer.title}
        text={`Check out this deal: ${offer.title} at ${offer.business_name}`}
        open={shareOpen} onClose={() => setShareOpen(false)} />
```

- [ ] **Step 2 — OfferCard.jsx:** import `ShareSheet`; add `const [shareOpen, setShareOpen] = useState(false);`; replace the share button's inline `onClick` body with `e.stopPropagation(); setShareOpen(true);`; render the sheet inside the card root:
```jsx
      <ShareSheet offerId={offer.id} title={offer.title}
        text={`Check out this deal: ${offer.title} at ${offer.business_name}`}
        open={shareOpen} onClose={() => setShareOpen(false)} />
```
(Drop the now-unused inline `trackShare`/`navigator.share` import usage if no longer referenced — keep `trackShare` import only if still used elsewhere in the file; it isn't, so remove it.)

- [ ] **Step 3 — CouponClaimed.jsx:** import `ShareSheet`; add `const [shareOpen, setShareOpen] = useState(false);`; replace `handleShareReview` body with `setShareOpen(true);`; render:
```jsx
      <ShareSheet offerId={offerId} title={`${businessName} — ${'⭐'.repeat(rating)}`}
        text={`I just rated ${businessName} ${'⭐'.repeat(rating)} on TapProve! ${comment ? `"${comment}" ` : ''}Check out their deals:`}
        open={shareOpen} onClose={() => setShareOpen(false)} />
```
Remove the now-unused `trackShare` import from CouponClaimed if no longer referenced.

- [ ] **Step 4:** `cd frontend-user && ../node_modules/.bin/vitest run` → full suite green (existing OfferDetail/OfferCard tests still pass; update any that asserted the old inline `navigator.share`/`trackShare` behaviour — search `navigator.share`/`trackShare` in `*.test.jsx`).
- [ ] **Step 5:** Commit: `feat: open ShareSheet from offer detail, cards, and rating screen`.

---

## Task 10: Verify + merge

- [ ] **Step 1:** `node --test backend/utils/offerChannel.test.js`; `node --check backend/routes/v1.js`; `cd frontend-user && ../node_modules/.bin/vitest run` (all green); `cd frontend-business && VITE_UNLOCK_APP=true npm run build` (compiles; "Social"/OfferPerformance in bundle).
- [ ] **Step 2:** FF-merge to `pre-staging`, push (Railway runs migration 063 + the v1.js fix; Netlify redeploys both sites). Clean up worktree.
- [ ] **Step 3: Staging proof:**
  - **Part B (no full chain needed):** `curl "https://staging-api.tapprove.io/api/v1/offers/1/og?src=social_facebook"` → HTML contains `url=…/offer/1?src=social_facebook` (query forwarded). And `curl -I "https://<staging-frontend>/o/1"` resolves (DoD f).
  - **Part C:** anon-activate offer 1 with `source=social_facebook` (curl, as in 5A) → DB row `channel='social'`, `source='social_facebook'`; then `GET /api/offers/performance?range=all` (business JWT) shows a **Social** row.
  - **Part A:** device — open an offer, tap Share, confirm the sheet (FB/WhatsApp/Instagram/X/Telegram/TikTok/Copy/More), platform links carry `?src=social_<platform>`, generic Copy is untagged.
- [ ] **Step 4:** Note to user: set staging `VITE_PUBLIC_APP_URL` (frontend) + `USER_APP_URL`/`API_PUBLIC_URL` (staging-api) to staging hosts for a real end-to-end recipient click; otherwise share links resolve against prod.

---

## Self-Review
- **Sequence:** B (query-forward + staging redirect) → C (enum + mappings + label) → A (util, component, wiring). Each part independently verifiable. ✓
- **Decisions honoured:** social = own channel (C); per-platform tags + IG/TikTok copy + native social_other (A); generic Copy = untagged canonical (Task 8 test asserts it); OG image untouched; staging redirect added (Task 2). ✓
- **Type consistency:** `source='social_<platform>'` → `channelFromSource`/`resolveActivationChannel` `startsWith('social')` → `'social'` → CHECK allows it → dashboard `CHANNEL_LABELS.social`. `buildShareUrl` tag format matches both resolver tests and ShareSheet tests. ✓
- **Honesty:** generic copy untagged (no Social over-attribution); `social_other` only for the native sheet where social intent is explicit. ✓
- **No placeholders:** full code for every code step.
