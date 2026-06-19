# Privacy signage — drop-in replacement directory

This directory is served verbatim at `/signage/<filename>` by the
business dashboard (Vite copies `public/` to the build root).

When the final solicitor-reviewed signage is ready:

1. Replace each per-country file below with the real artwork.
   The dashboard's download buttons reference these exact filenames
   via `backend/services/signageVersions.js` — keep the names
   identical, or update both at once.

2. If the version number changes (e.g. v1 → v2), do BOTH:
   - Rename the file (e.g. `gb-v1.txt` → `gb-v2.pdf`)
   - Bump the matching entry in `backend/services/signageVersions.js`
   The dashboard then prompts every business in that country to
   re-accept on next node activation, and the audit table records
   the new version verbatim.

3. Real artwork is most useful as a **print-ready PDF** (A5 / A4)
   PLUS a **PNG preview** the business can see before downloading.
   The dashboard surfaces only the PDF link today — extend the
   `signageVersions` module to expose both URLs if you want both.

## Current placeholders

- `ie-v1.txt` — Ireland (EU GDPR / Irish DPC)
- `gb-v1.txt` — United Kingdom (UK GDPR / ICO)
- `us-v1.txt` — United States (CCPA-aligned baseline)
- `au-v1.txt` — Australia (Privacy Act 1988 / OAIC)
- `nz-v1.txt` — New Zealand (Privacy Act 2020 / OPC)

All files contain clearly-marked PLACEHOLDER text — they are NOT
suitable for actual store-window display.
