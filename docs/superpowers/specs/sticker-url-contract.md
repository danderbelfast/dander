# Sticker URL contract

Authoritative reference for programming physical NFC/QR stickers.

## Check-in (loyalty points) — door / node
`https://<host>/tap?node=<node_id>&business=<business_id>`
- Awards loyalty points (staff-verified at till later). NOT an offer-attribution channel.

## Offer page — window / offer stickers
`https://<host>/business/<business_id>/offers?src=sticker_<location>`
- Opens the public offers page; an Activate there records `channel='sticker'`, `source='sticker_<location>'`.
- `src` format: `sticker_<location>`, lowercase, `[a-z0-9_]`, ≤32 chars.
  - Examples: `sticker_window`, `sticker_door`, `sticker_counter`, `sticker_poster`, `sticker_table`.
  - Bare `?src=sticker` is valid (→ `source='sticker'`).
- Coarse channel (server-derived, for rollups): `^sticker` → `sticker`; `app` → `app`; anything else → `web`.

The per-channel dashboard groups by the coarse `channel` (so all `sticker_*` roll up to `sticker`).
The per-sticker view (later) groups by `source`.

> Capture is live as of Plan 5A. Program window stickers with `?src=sticker_window` etc. — per-sticker data accumulates from first tap.
