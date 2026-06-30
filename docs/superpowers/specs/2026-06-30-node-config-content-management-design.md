# Node Config + Content Management — Architecture Design (spec only)

**Status:** Spec for review. Design-only — **do not build**. This is the architecture for a future node project (after the safety stack). Includes a sequencing recommendation + the specific cheap steps Increment 2 should take *now* to avoid a later teardown.

## Goal
Manage **all node config AND content** from the business portal, pushed OTA, so an operator runs a fleet of nodes (multiple per business, awkwardly mounted) without physically touching each phone. Two layers:
- **Config:** hours, node mode, screen-on choice, thermal thresholds, zone — set in the portal, pushed OTA.
- **Content/design:** images, offer text, display layout — designed in the portal at the node's real canvas, pushed to the screen.

## What already exists (the channel is real, and it's the right shape)
The node↔backend OTA loop is already a **poll-response command channel**:
- Node POSTs a `Summary` to `/api/webhooks/phone-counter` every **60s open / 10min closed** (`Uploader.kt`).
- Backend replies on the 200 with `{ commands: {…}, display: {…}, latest_version, update_available }`.
- **Config already flows OTA today** via `commands`: `counting_enabled`, `zone_name`, `zone_type`, `sound_enabled`, `opening_hours`, `refresh_gifs`, `bt_salt` → node writes `Prefs` → re-derives state. Opening hours already work exactly this way.
- **Content already flows** via `display` (loyalty greeting JSON) + a **URL-and-cache image model**: `GifCache` (on-disk) + a `refresh_gifs` command + `GifRefreshWorker` (daily). The node already reports `orientation` (portrait/landscape).
- Real-time path: `WsClient` pushes `display` instantly; the 60s poll is the fallback.

So the vision is **extend this**, not replace it. The two genuinely new pieces are (a) the node reporting its **display canvas characteristics**, and (b) a **content/design template** layer (layout + assets) beyond ad-hoc greeting JSON.

---

## Architecture answers to the 8 key questions

### 1. Source of truth + conflict resolution
**Backend is the source of truth** (server-stored *desired state* per node). The device holds *applied state* only. The node **never originates config** except first-run pairing. So there's no true multi-writer conflict:
- Dashboard writes desired state → bumps a monotonic **`config_version`** (and a separate **`content_version`**).
- Node pulls on its next poll, compares versions, applies on change, echoes **`applied_config_version`/`applied_content_version`** back in its Summary.
- On-device Settings (long-press) is an **emergency local override**, explicitly *lower precedence*: the next OTA push (newer `config_version`) overwrites it. Document this so an operator isn't surprised a local tweak got reverted.

### 2. Offline nodes
Inherent in the pull model — **sync-on-reconnect, no push required**. Desired state lives server-side keyed by `device_id`; an offline node simply applies it on its next successful poll (version compare → apply delta). Optional speed-up: a WS "config changed, poll now" nudge when the node is connected. The dashboard shows per-node status from `applied_*_version` vs desired: **applied / pending / offline (last-seen)**.

### 3. Initial setup
**On-device first-run wizard for pairing only, then dashboard takes over.** `SetupActivity` already pairs via the 4-digit business code → `business_id`. Keep the device wizard minimal: pair + grant permissions + auto-detect orientation/canvas → from then on, **everything is portal-managed**. The node reports its characteristics immediately post-pair so the operator can design against the real canvas right away.

### 4. The round-trip
`dashboard edit → backend stores desired state + bumps version → node polls (or WS nudge) → node downloads any changed assets to cache → applies → next Summary echoes applied_*_version → dashboard shows "applied"`. The **confirm-back is the version echo in the existing Summary** (add `applied_config_version`, `applied_content_version` fields) — no new endpoint needed.

### 5. Does the channel support config AND content (images = big)?
- **Config:** yes as-is — small JSON in the command response. Just add fields.
- **Content/images:** **do NOT inline image bytes** in the 60s response (bloats every poll). **Extend the existing URL-and-cache pattern:** the command carries a `content_version` + a **content manifest** (layout JSON + asset URLs), the node downloads changed assets to disk (the `GifCache`/`GifRefreshWorker` model, generalised to a `ContentCache`) and renders from cache. Bytes travel over plain HTTPS GET on change only; the channel carries **pointers + versions**, not payloads. WS nudges for instant apply.

### 6. On-device long-press Settings
**Becomes diagnostics + re-pair + emergency override**, not the management surface. Once paired, config is portal-driven; the on-device screen shows read-only current state + the camera diagnostic + re-pair + a clearly-labelled "local override (until next portal push)". This keeps a no-network or pre-pairing escape hatch without competing with the portal as source of truth.

### 7. Display-characteristics reporting + portal canvas
**Node → portal (add to Summary):** `screen_width_px`, `screen_height_px`, `density_dpi`, `aspect_ratio`, current `orientation`, and a stable `display_signature` (so the portal knows when the canvas changed, e.g. phone swapped). Trivial to read (`Resources.displayMetrics` / `WindowMetrics`). **Portal:** renders a **design canvas at the node's real pixel dimensions + aspect**, with an accurate preview ("design your offer screen at this node's actual size"). Designs are authored per-canvas; if a node's canvas changes, the portal flags "design needs re-fit." Store the design as a **resolution-independent layout** (relative/percentage positions + safe-area) so minor density differences don't crop — the reported metrics drive the preview and the fit check, not pixel-baked coordinates.

### 8. Editable content surface in the portal
- **Images:** background / offer image / logo (uploaded → CDN/Cloudinary URL → manifest).
- **Offer text:** headline, body, price/discount, CTA, validity.
- **Layout:** a small set of **operator-friendly templates** (e.g. "image-full + caption", "split", "text-only") with editable slots + ordering — *not* a freeform design tool. Templates are resolution-independent; the canvas preview shows the real node shape. (Greeter loyalty greetings stay as-is; this is the idle/offer screen.)

---

## Sequencing recommendation (the headline question)

**Finish the safety build first. Your lean is right.** Safety (thermal monitor especially) is **launch-critical** — nodes can't be deployed unattended without it, and you accepted Feature 5 can't pre-screen bad batteries so the **thermal monitor is the live safety net**. Config+content management is a **scaling/usability** feature that only bites once there are multiple customers × multiple nodes. So: **safety stack (Increment 2 + Features 2–6) → nodes deployable → this config+content project next.** This is a separate, larger node project.

### What Increment 2 should do NOW to avoid a teardown (cheap, ~do these)
The architecture above is an *extension* of the existing pattern, so very little is needed now — but four small disciplines stop us painting into a corner:

1. **Single idempotent `applyConfig()` in MonitorService, reading Prefs.** All config (incl. the new thermal/mode/screen-on) lives in `Prefs` (already done in Increment 1). The service must **re-read Prefs on a "config changed" signal**, not cache values at construction. This is the natural shape anyway and is the whole anti-corner move — OTA later just writes Prefs + signals, and it Just Works.
2. **Extend the OTA `Commands` parser for the new safety fields now (~30 lines).** Add `node_mode`, `screen_on`, and `thermal_thresholds` (warm/hot/resume) to `Uploader.Commands` + `parseCommands` + the applier. Cost is tiny and it means the *later* portal work for these is **backend + frontend only — no node re-release**. Strong recommend.
3. **Report display characteristics + applied version in the Summary now (~20 lines).** Add `screen_width_px/height_px/density_dpi/aspect_ratio` and an `applied_config_version` (even if always 0 for now) to the Summary. The data starts flowing immediately, so when the portal canvas is built later it has real metrics + history, and the version-echo round-trip is pre-wired. Recommend.
4. **Decide the source-of-truth rule now (no code):** dashboard authoritative; on-device = setup + emergency override; OTA push wins. Bake this assumption into Increment 2's config handling (don't let the device persist config in a way that fights a future server push) — concretely, that just means #1 (server push overwrites Prefs freely).

**Do NOT build now:** the portal design canvas/preview, the content template engine + `ContentCache`, the per-node dashboard status UI, conflict/version UI. Those are the next project.

Net: Increment 2 keeps config in Prefs behind one `applyConfig()`, adds a handful of OTA fields + Summary fields. That's the entire "don't paint us into a corner" cost — no architecture is foreclosed, nothing later is a teardown.

## Deferred / open for the future project
- Backend: per-node desired-state store (config + content manifest) + version bumping + the manifest endpoint; node-health surfacing (ties to the already-captured business-dashboard node-health + thermal-alerting follow-up).
- Frontend-business: fleet view, per-node config forms, the design canvas + preview, content template editor, applied/pending/offline status.
- Node: `ContentCache` (generalised `GifCache`), template renderer, characteristics reporter, `applyConfig()` driven entirely by OTA.

## Self-review
- All 8 questions answered with concrete mechanisms grounded in the existing channel. ✓
- Sequencing: safety-first confirmed with the *why* (thermal is the live net since batteries can't be pre-screened); config+content is the next project. ✓
- Anti-corner guidance is minimal + specific (idempotent applyConfig + a few OTA/Summary fields), foreclosing no future design. ✓
- No build performed. ✓
