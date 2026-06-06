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
import { useUserSocket } from '../src/hooks/useUserSocket';
import { usePermissionWalkthrough } from '../src/hooks/usePermissionWalkthrough';
import { PermissionBanner } from '../src/components/PermissionBanner';
import { NfcCheckInScreen } from '../src/components/NfcCheckInScreen';

function SideEffects() {
  // All hooks gate themselves on isAuth and platform/permissions, so
  // they're safe to mount unconditionally at the root. NFC tap-link URLs
  // (https://dander.io/tap?...) are handled by app/tap.tsx, which
  // expo-router routes to automatically when the deep link arrives.
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
