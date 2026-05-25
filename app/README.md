# Dander User App

Expo (managed workflow + dev client) + TypeScript + expo-router. Skeleton
only — no screens yet. The silent fingerprint and WiFi-scanner side effects
are wired into the root layout and run after login.

## Setup

```sh
cd app
cp .env.example .env       # leave EXPO_PUBLIC_API_URL=https://api.dander.io
npm install
```

Pinned to Expo SDK 52. If `npm install` complains about peer-dep versions,
run `npx expo install --fix` to align everything to the SDK.

## Running

**You cannot use Expo Go.** `react-native-wifi-reborn` ships native code
that isn't bundled into Expo Go — the app will crash on require. Use a dev
client build:

```sh
# First time on a fresh machine
npx expo prebuild              # generates android/ + ios/ projects
npx eas build --profile development --platform android
# Install the resulting APK on a device or emulator, then:
npm start
```

After that, `npm start` connects the dev server to the dev-client app.
`npm run android` / `npm run ios` rebuild and reinstall the dev client
locally if you don't want to use EAS Build.

## Platform support for WiFi scanning

| Platform | Behaviour |
|---|---|
| Android | Full scan of nearby networks via `react-native-wifi-reborn`. Requires `ACCESS_FINE_LOCATION` (granted at runtime via `expo-location`) and `ACCESS_WIFI_STATE` (declared in `app.json`). |
| iOS     | Apple does not expose a public API for scanning nearby networks. The scanner service silently no-ops on iOS — only `react-native-wifi-reborn`-style scanning, not the current-network read. If we ever need the current SSID on iOS, that requires the *Hotspot Configuration* or *Network Extension* entitlement (Apple developer console + provisioning profile work). |

## Project layout

```
app/                          # expo-router file-based routes
  _layout.tsx                 # root: AuthProvider + side effects + <Stack />
  index.tsx                   # placeholder route
src/
  env.ts                      # EXPO_PUBLIC_API_URL → typed env object
  api/
    client.ts                 # axios instance + token interceptor
    auth.ts                   # POST /api/auth/{login,register}
    device.ts                 # POST /api/device/fingerprint
    wifi.ts                   # POST /api/wifi/observations
  context/
    AuthContext.tsx           # login / register / logout, AsyncStorage-backed
  hooks/
    useDeviceFingerprint.ts   # fires once on auth; stores flag silently
    useWifiScanner.ts         # starts the scan loop on auth
  services/
    wifiScanner.ts            # Android scan loop → POST /api/wifi/observations
  utils/
    fingerprint.ts            # installId + SHA-256 device fingerprint
```

## Anti-fraud notes (read me before adding the points UI)

- `useDeviceFingerprint` writes the backend's response to AsyncStorage —
  `dander_device_flagged` (`'1'` or `'0'`) and `dander_device_flag_reason`.
  The points/rewards UI should call `isFlagged()` from
  `src/hooks/useDeviceFingerprint.ts` and silently suppress reward accrual
  when it returns `true`. **Do not surface the flag to the user.**
- The install UUID at `dander_install_id` is set on first launch and
  **never rotates** — not on logout, not on re-install (it does reset on
  app uninstall, which is fine). The backend relies on this to detect
  "multiple accounts on the same install".

## What's intentionally not done

- No screens — Chris owns this.
- No refresh-token rotation (the AuthContext only handles the access token
  for now; layer refresh on top once the auth UI exists).
- No background WiFi scanning. The scanner runs only while the app is in
  the foreground.
- No telemetry / Sentry / error reporting hooks.
