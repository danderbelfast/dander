# Android App Links — `assetlinks.json`

Served by the backend at `GET /.well-known/assetlinks.json` with
`Content-Type: application/json`. Wire `dander.io` (the apex, not
`api.dander.io`) so this path resolves to the backend — either by
proxying `https://dander.io/.well-known/assetlinks.json` straight to the
backend (Cloudflare Worker route or DNS) or by copying the served file
to whatever's hosting `dander.io`.

## How to fill in the SHA256 fingerprint

The placeholder `YOUR_APK_SHA256_FINGERPRINT` must be replaced with the
fingerprint of every signing key you ship.

### EAS / Expo build (production)

```bash
cd app
eas credentials -p android
```

Pick `Production keystore` → `View keystore credentials` → copy the
`SHA256 Fingerprint`. EAS prints it as `AA:BB:CC:…` (32 hex pairs,
colon-separated). Paste it verbatim into the array.

### Local debug APK

```bash
keytool -printcert -jarfile app-debug.apk
```

Use the `SHA256` line.

### Multiple keys

Both debug and release can coexist — App Links matches any entry in the
array. Useful while you're still distributing test builds.

```json
"sha256_cert_fingerprints": [
  "AA:BB:CC:…",   // release
  "11:22:33:…"    // debug
]
```

## Cloudflare gotchas

- **No redirects.** If Cloudflare's "Always Use HTTPS" page rule
  rewrites `http://dander.io/.well-known/...` → `https://...`, the
  Android verifier follows it but fails because the *initial* request
  must not redirect. Put a Page Rule that bypasses this for
  `/.well-known/*` if you see verification fail.
- **No Bot Fight Mode / Browser Integrity Check.** Both have been seen
  to challenge Google's verifier with a JS challenge → it sees HTML
  instead of JSON. Add a WAF skip rule for the `Google-Verifier-Bot`
  user agent on this path.
- **Content-Type matters.** Make sure Cloudflare doesn't strip or
  override `application/json`. The Workers / Page Rules shouldn't
  touch it, but Apps that minify by default sometimes do.

## Verifying it works

```bash
curl -i https://dander.io/.well-known/assetlinks.json
```

The first line should be `HTTP/2 200`, the `content-type` should be
`application/json`, and there should be no `location` header.

Then on a connected Android device with the app installed:

```bash
adb shell pm get-app-links io.dander.app
```

Look for `https://dander.io: verified` — you're done.
