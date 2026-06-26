/**
 * _layout.tsx — root layout. Wraps the whole app in <AuthProvider>, then
 * mounts the silent fingerprint + WiFi-scanner side effects, then renders
 * the route stack. Screens will be added by Chris as separate files in
 * this directory.
 */

import React, { useEffect } from 'react';
import { Linking, View } from 'react-native';
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { ActivatedOffersProvider } from '../src/context/ActivatedOffersContext';
import { useDeviceFingerprint } from '../src/hooks/useDeviceFingerprint';
import { useWifiScanner } from '../src/hooks/useWifiScanner';
import useStepCounter from '../src/hooks/useStepCounter';
import { useBeaconScanner } from '../src/hooks/useBeaconScanner';
import { useUserSocket } from '../src/hooks/useUserSocket';
import { useLoginPermissionPrompt } from '../src/hooks/useLoginPermissionPrompt';
import { usePermissionWalkthrough } from '../src/hooks/usePermissionWalkthrough';
import { PermissionBanner } from '../src/components/PermissionBanner';
import { AppLinksBanner } from '../src/components/AppLinksBanner';
import { NfcCheckInScreen } from '../src/components/NfcCheckInScreen';
import { handleTapUrl, handleTillUrl } from '../src/services/nfcHandler';

function SideEffects() {
  // All hooks gate themselves on isAuth and platform/permissions, so
  // they're safe to mount unconditionally at the root. NFC tap-link URLs
  // (https://<host>/tap?... — tapprove.io and the legacy dander.io
  // intent-filter host) are handled by app/tap.tsx, which expo-router
  // routes to automatically when the deep link arrives.
  //
  // usePermissionWalkthrough runs the first-launch friendly prompts
  // (Notifications → Location → Nearby Devices) once per install.
  usePermissionWalkthrough();
  useDeviceFingerprint();
  useWifiScanner();
  useStepCounter();
  useBeaconScanner();
  // Keeps a Socket.IO connection open while authed and bridges
  // points_awarded pushes into the NfcCheckInScreen coins overlay so
  // the till flow re-uses the existing animation pipeline.
  useUserSocket();
  // First login after install — show the "Quick setup" Alert then
  // trigger location / Bluetooth / notifications grants in one pass.
  // Persistent flag means it doesn't re-prompt on later logins.
  useLoginPermissionPrompt();

  // Foreground deep-link bridge. expo-router handles cold-start URLs
  // (Android opens app → routes to /tap or /till → that route's
  // useEffect fires handleTapUrl / handleTillUrl). But when the app
  // is already foregrounded and a fresh App Link arrives, expo-router
  // doesn't always re-route, so we listen here and dispatch directly.
  //
  // tap.tsx / till.tsx each carry a per-mount fired.current guard, so
  // even if expo-router DOES re-mount the route on top of this
  // dispatch the POST only fires once per real tap.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('[deep-link] foreground url:', url);
      if (url.includes('/till')) handleTillUrl(url);
      else if (url.includes('/tap')) handleTapUrl(url);
    });
    return () => subscription.remove();
  }, []);

  return null;
}

export default function RootLayout() {
  // Platform lockdown — maintenance mode. Production APKs render a
  // blank white surface; dev-client builds (__DEV__ = true under
  // `expo start`) and staging APKs (EXPO_PUBLIC_UNLOCK_APP=true,
  // injected per-profile in eas.json) mount the full shell — auth,
  // side-effects, deep-link bridge, NFC overlay, route stack.
  //
  // Mirrors the VITE_UNLOCK_APP gate in frontend-user/src/main.jsx
  // and frontend-business/src/main.jsx. Reverting both branches to
  // the unconditional white View restores the all-environments
  // lockdown.
  if (!__DEV__ && process.env.EXPO_PUBLIC_UNLOCK_APP !== 'true') {
    return <View style={{ flex: 1, backgroundColor: '#ffffff' }} />;
  }
  return (
    <AuthProvider>
      <ActivatedOffersProvider>
        <SideEffects />
        <View style={{ flex: 1 }}>
          <PermissionBanner />
          <AppLinksBanner />
          <Stack screenOptions={{ headerShown: false }} />
          <NfcCheckInScreen />
        </View>
      </ActivatedOffersProvider>
    </AuthProvider>
  );
}
