# Social Share Per-Platform Attribution — Design (Plan 6)

**Status:** Spec for review. Design-only — no build until approved.

## Goal

Turn the existing "share offer to socials" feature into a **per-platform attributed channel**: a recipient who opens a shared link and activates the offer is stamped `channel='social'`, `source='social_<platform>'` (e.g. `social_facebook`), flowing into the **Offer Performance** "By channel" breakdown — same channel-stamped pattern as sticker/web/app (Plans 5A/5B).

## Context (current state — from investigation)

- Sharing = the **native Web Share API** (`navigator.share`) + clipboard fallback, inline in three places: `OfferDetail.jsx`, `OfferCard.jsx`, `CouponClaimed.jsx`. There is no custom share UI.
- **The crux:** `navigator.share` hands off to the OS share sheet and **never reports which platform was chosen** — so per-platform attribution is impossible without an explicit per-platform UI.
- Share link = `${PUBLIC_APP_URL}/o/:id` with **no `?src`**. `/o/:id` → (root `netlify.toml`) proxies to backend `GET /api/v1/offers/:id/og` → an OG-meta HTML page that **`<meta http-equiv="refresh">` redirects to a hardcoded `/offer/:id` with no query string** (`backend/routes/v1.js:117`).
- `trackShare` → `POST /api/v1/offers/:id/share` just increments `offers.share_count` + fires an `offer.shared` webhook. Aggregate counter, not attribution.
- `channel` is CHECK-constrained to `app/web/sticker`; `channelFromSource('social_*')` currently falls through to `web`.
- The read side (5A) already works: a recipient landing on `/offer/:id?src=…` → `resolveActivationChannel` → `ActivateButton` stamps the activation. So once `?src` *reaches* the offer page, attribution is automatic.

## Decisions locked

1. **"Social" is its own coarse channel** (not under web). Fine `source` = `social_<platform>` for a future per-platform drill-down. Added the same shape as 5A.
2. **Per-platform buttons** for web-intent platforms: **Facebook, WhatsApp, X/Twitter, Telegram**. **Instagram & TikTok** have no web share intent → "copy tagged link" action. All carry `?src=social_<platform>`. Priority order surfaced: **Facebook, WhatsApp, Instagram** (Belfast retail audience).
3. **Keep native share as a "More…" fallback**, tagged `social_other` (partial attribution — known social, unknown platform).
4. **Reuse the existing OG image** (`/preview.png`) as-is.

**Must-fix (flagged in investigation, in scope here):** the OG redirect drops the query string — forward `req.query` through so `?src` survives; and add `social` to the channel enum.

---

## Architecture

### Part A — Per-platform Share UI (frontend-user)

New reusable component **`frontend-user/src/components/offers/ShareSheet.jsx`** (+ a small URL-builder util + tests). Replaces the three inline `navigator.share` handlers with one consistent sheet.

- **Trigger:** each existing share button (OfferDetail full button, OfferCard icon, CouponClaimed) opens the sheet for that offer instead of calling `navigator.share` directly.
- **Sheet contents (in priority order):** Facebook · WhatsApp · Instagram · X · Telegram · Copy link · More… (native, only if `navigator.share` exists).
- **Tagged link builder** — new `frontend-user/src/utils/shareUrl.js`:
  ```
  buildShareUrl(offerId, platform) → `${PUBLIC_APP_URL}/o/${offerId}?src=social_${platform}`
  ```
  `platform` ∈ `facebook | whatsapp | instagram | tiktok | x | telegram | other`. The `?src` rides on the `/o/:id` link so it survives to the recipient's offer page (after the Part B fix).
- **Per-platform actions** (each fires `trackShare(offerId)` first — keeps the aggregate counter):
  - **Facebook:** open `https://www.facebook.com/sharer/sharer.php?u=<enc(shareUrl)>` (FB pulls OG meta; custom text not reliable).
  - **WhatsApp:** open `https://wa.me/?text=<enc(text + ' ' + shareUrl)>`.
  - **X:** open `https://twitter.com/intent/tweet?text=<enc(text)>&url=<enc(shareUrl)>`.
  - **Telegram:** open `https://t.me/share/url?url=<enc(shareUrl)>&text=<enc(text)>`.
  - **Instagram / TikTok:** `navigator.clipboard.writeText(shareUrl)` + toast "Link copied — paste it into your Instagram/TikTok story or bio." (no web intent exists).
  - **Copy link:** copies the `social_other`-tagged (or untagged canonical?) link — see open question Q3.
  - **More…:** `navigator.share({ title, text, url: buildShareUrl(id, 'other') })` → `social_other`.
  - Intents open via `window.open(url, '_blank', 'noopener')`.
- **Share text:** `Check out this deal: ${title} at ${business_name}` (current copy), passed where the platform supports text.
- The sheet is presentational + self-contained; entry points just render `<ShareSheet offer={{id,title,business_name}} trigger={…}/>` or toggle it via state. Exact trigger wiring per page in the implementation plan.

### Part B — Preserve `?src` through the OG redirect (backend)

In `backend/routes/v1.js` (`GET /offers/:id/og`), the meta-refresh + body link currently hardcode `appUrl = ${USER_APP_URL}/offer/:id`. Change to **forward the incoming query string**:
```js
const qs = new URLSearchParams(req.query).toString();
const appUrl = `${config.USER_APP_URL}/offer/${offer.id}${qs ? `?${qs}` : ''}`;
```
(Use `req.query` so `?src=social_facebook` — preserved by the Netlify proxy, which appends the original query when the destination has none — lands on `appUrl`.) `og:url` can stay the canonical `/o/:id` (crawlers don't need the tag). Only the redirect target carries `?src`. Sanitize: rely on `URLSearchParams` encoding; the SPA/`normalizeSource` already sanitizes `src` server-side on activate, so no injection risk into the funnel.

### Part C — Add `social` as a coarse channel (same shape as 5A)

- **Migration** `backend/db/migrations/0xx_offer_activation_channel_social.sql`:
  ```sql
  ALTER TABLE offer_activations DROP CONSTRAINT IF EXISTS offer_activations_channel_check;
  ALTER TABLE offer_activations ADD CONSTRAINT offer_activations_channel_check
    CHECK (channel IN ('app', 'web', 'sticker', 'social'));
  ```
  (Idempotent via `IF EXISTS` + re-add; no existing rows are `social`.)
- **`backend/utils/offerChannel.js`:** add `'social'` to `VALID_CHANNELS`; in `channelFromSource`, `source.startsWith('social')` → `'social'` (before the `web` fallback).
- **`frontend-user/src/utils/activationChannel.js`:** `resolveActivationChannel` — `source.startsWith('social')` → `channel='social'`.
- **`frontend-business/src/pages/OfferPerformance.jsx`:** `CHANNEL_LABELS.social = 'Social'`.
- Coarse only for now: all `social_*` roll up under one **Social** row in the breakdown (per-platform drill-down using fine `source` is a later view, like the per-sticker view).

### Data flow

```
ShareSheet (sender) → buildShareUrl(id, 'facebook')
  → https://tapprove.io/o/<id>?src=social_facebook   (shared to FB)
recipient clicks
  → netlify /o/:id proxy (forwards ?src)
  → backend /api/v1/offers/:id/og  [Part B: appends ?src to appUrl]
  → /offer/<id>?src=social_facebook  (SPA)
  → resolveActivationChannel → { channel:'social', source:'social_facebook' }   [Part C]
  → Activate → offer_activations row (channel='social', source='social_facebook')
  → funnel (entry_conversion / qualified_sale, unchanged)
  → Offer Performance "By channel: Social"   [Part C label]
```

## Attribution semantics
- Attribution fires on the **recipient's activation** (last-touch, 7-day window) — consistent with sticker/web/app. The sender's `trackShare` counter is unrelated to the funnel.
- `social_other` (native fallback) = known-social, unknown-platform → counts under **Social** in the coarse breakdown; simply lacks a specific platform in the future fine drill-down.
- Pre-existing untagged shares (`/o/:id` with no `?src`) keep landing as `web` — unchanged.

## Edge cases
- **IG/TikTok have no web intent** → copy-link only (explicit in the UI copy). Accepted.
- **Native "More…"** only shown when `navigator.share` exists; otherwise platform buttons + Copy cover it.
- **Query survival:** depends entirely on Part B; without it the feature silently no-ops (everything lands as `web`). Build + verify Part B first.
- **Double `?src`:** if a link somehow has two, `URLSearchParams.get('src')` takes the first — deterministic.
- **`channel` coercion is server-authoritative** (Part C `channelFromSource`), so a forged `channel` can't mis-file a `social_*` source — same integrity guarantee as 5A.

## Testing approach
- **Vitest (frontend-user):** `buildShareUrl` (tag format per platform); `resolveActivationChannel` (`social_facebook` → `{social, social_facebook}`, `social_other` → `{social, social_other}`); ShareSheet renders the platform buttons / copy actions (mock `navigator`/`window.open`/clipboard).
- **node:test (backend):** `channelFromSource('social_instagram')` → `'social'`; `VALID_CHANNELS` includes `social`.
- **node --check** on `v1.js`; migration eyeballed (Railway runs on boot).
- **frontend-business:** no harness — `OfferPerformance` Social label verified by build + device.
- **Recipient-flow caveat (staging):** share links are built from `PUBLIC_APP_URL` (defaults to **prod** `tapprove.io`), and the `/o/:id` Netlify redirect + its prod-api target live in **root** `netlify.toml` (not the staging `frontend-user/netlify.toml`). So the full recipient→activation chain naturally exercises **prod** infra. To test end-to-end on staging we'd need `VITE_PUBLIC_APP_URL` set to the staging site **and** the `/o/:id` redirect present on the staging site. Flag for the plan: decide whether to add the `/o/` redirect to `frontend-user/netlify.toml` (so staging is self-contained) or accept testing Part B against prod. (Part A — the sheet + tag generation — is fully testable on staging regardless.)

## Out of scope / later
- Per-platform **drill-down view** (grouping by fine `source` within Social) — later, like the per-sticker view.
- Share-side platform analytics (recording which platform the *sender* picked into `share_count`/a new table) — the funnel attributes the recipient, not the sender; not needed.
- Changing the OG image or the `share_count` counter.

## Self-review
- **Decision coverage:** social-as-own-channel (Part C); per-platform buttons + IG/TikTok copy + priority order (Part A); native "More…" → social_other (Part A); reuse OG image (untouched). ✓
- **Must-fixes in scope:** OG query-forward (Part B); channel enum migration (Part C). ✓
- **Reuses 5A backbone:** `source` capture, server-derived channel, `normalizeSource` sanitization, Offer Performance rollup — only additions are the `social` enum value + the `social_*` → `social` mapping + the share UI. ✓
- **Ambiguity flagged for decision:** Q3 (Copy-link tag) below; staging recipient-flow testing caveat documented.

## Open question for you (one)
- **Q3 — Copy link tag:** should the standalone **"Copy link"** action copy a `social_other`-tagged URL (counts as Social if the recipient activates) or the **clean canonical** `/o/:id` (no tag → lands as web)? IG/TikTok copy actions are explicitly `social_instagram`/`social_tiktok`; this is only about the *generic* Copy button. Recommend **clean canonical** (a generic copy isn't necessarily a social share — tagging it Social would over-attribute), but happy to make it `social_other` if you'd rather every share from the sheet count as Social.
