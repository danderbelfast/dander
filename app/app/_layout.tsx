/**
 * _layout.tsx — root layout. Wraps the whole app in <AuthProvider>, then
 * mounts the silent fingerprint + WiFi-scanner side effects, then renders
 * the route stack. Screens will be added by Chris as separate files in
 * this directory.
 */

import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../src/context/AuthContext';
import { useDeviceFingerprint } from '../src/hooks/useDeviceFingerprint';
import { useWifiScanner } from '../src/hooks/useWifiScanner';

function SideEffects() {
  // Both hooks gate themselves on isAuth and platform/permissions, so
  // they're safe to mount unconditionally at the root.
  useDeviceFingerprint();
  useWifiScanner();
  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <SideEffects />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
