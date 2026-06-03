/**
 * _layout.tsx — root layout. Wraps the whole app in <AuthProvider>, then
 * mounts the silent fingerprint + WiFi-scanner side effects, then renders
 * the route stack. Screens will be added by Chris as separate files in
 * this directory.
 */

import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { useDeviceFingerprint } from '../src/hooks/useDeviceFingerprint';
import { useWifiScanner } from '../src/hooks/useWifiScanner';
import useStepCounter from '../src/hooks/useStepCounter';
import { useBeaconScanner } from '../src/hooks/useBeaconScanner';
import { useTapLinkHandler } from '../src/hooks/useTapLinkHandler';
import { PermissionBanner } from '../src/components/PermissionBanner';
import { NfcCheckInScreen } from '../src/components/NfcCheckInScreen';

function SideEffects() {
  // All five hooks gate themselves on isAuth and platform/permissions, so
  // they're safe to mount unconditionally at the root.
  useDeviceFingerprint();
  useWifiScanner();
  useStepCounter();
  useBeaconScanner();
  useTapLinkHandler();
  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <SideEffects />
      <View style={{ flex: 1 }}>
        <PermissionBanner />
        <Stack screenOptions={{ headerShown: false }} />
        <NfcCheckInScreen />
      </View>
    </AuthProvider>
  );
}
