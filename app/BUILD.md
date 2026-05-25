# Building the Dander app

## First time only
1. Install EAS CLI: `npm install -g eas-cli`
2. Login: `eas login` (use the Expo account)
3. Link project: `eas init` (run from `app/` folder)

## Every time you want a new APK
Run this from the `app/` folder:

```sh
npm run build:preview
```

EAS will compile in the cloud (takes 5-10 mins).
When done it gives you a QR code or download link.
Install the APK on your Android phone directly.

## Notes
- You need an Expo account ([expo.dev](https://expo.dev)) — free
- Preview builds are internal APKs for testing
- Production builds go to the Play Store later
- WiFi scanning and steps only work in a proper build — not in Expo Go
