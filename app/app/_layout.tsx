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
import { useDailyLoginBonus } from '../src/hooks/useDailyLoginBonus';
import { useStepCounter } from '../src/hooks/useStepCounter';

function SideEffects() {
  // Every hook gates itself on isAuth and platform/permissions, so the
  // set is safe to mount unconditionally at the root.
  useDeviceFingerprint();
  useDailyLoginBonus();
  useWifiScanner();
  useStepCounter();
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
