/**
 * useLoginPermissionPrompt — first-login-after-install permission flow.
 *
 * Spec: show a single "Quick setup" Alert AFTER the user successfully
 * logs in (not on app open), then trigger the OS prompts for Location
 * (foreground), Bluetooth scan/connect (Android 12+), and
 * Notifications.
 *
 * Persists a one-shot flag in AsyncStorage so the Alert + system
 * prompt train fires once per install, not on every subsequent login.
 * Session restores on cold start (where AuthContext rehydrates the
 * user from AsyncStorage) do NOT count as a "login" here — we only
 * fire when isAuth transitions from false to true at runtime.
 *
 * Independent from usePermissionWalkthrough (which still runs the
 * first-app-launch friendly prompts). Both being present is fine: if
 * the OS has already granted, the system dialogs don't reappear.
 */

import { useEffect, useRef } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../context/AuthContext';

const FLAG_KEY = 'dander_login_permissions_prompted_v1';

async function requestPermissions(): Promise<void> {
  // Location — foreground only. Background location is requested
  // separately by the geofencing flow if/when the user opts in.
  try {
    await Location.requestForegroundPermissionsAsync();
  } catch (e) {
    console.warn('[permissions] location:', (e as Error).message);
  }

  // Bluetooth — Android 12+ requires runtime grants for scan/connect.
  // ACCESS_FINE_LOCATION is also bundled because the loyalty-recognition
  // BLE scan paths still need it on Android 11 and the platform makes
  // grouping them in the same dialog UX nicer.
  if (Platform.OS === 'android') {
    try {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    } catch (e) {
      console.warn('[permissions] bluetooth:', (e as Error).message);
    }
  }

  // Notifications — needed for push offers and birthday/streak nudges.
  try {
    await Notifications.requestPermissionsAsync();
  } catch (e) {
    console.warn('[permissions] notifications:', (e as Error).message);
  }
}

function showPromptAndRequest(): void {
  Alert.alert(
    'Quick setup',
    'TapProve needs a few permissions to recognise you at local businesses and send you offers nearby.',
    [{
      text: "OK let's go",
      onPress: async () => {
        await requestPermissions();
        try { await AsyncStorage.setItem(FLAG_KEY, '1'); } catch { /* swallow */ }
      },
    }],
  );
}

export function useLoginPermissionPrompt(): void {
  const { isAuth } = useAuth();
  // prevAuthRef starts false so the very first true (after fresh
  // login or AsyncStorage rehydrate at boot) counts as a transition.
  // The AsyncStorage flag is what stops boot-time rehydrates from
  // re-firing — once the prompt has run once, the flag is set forever.
  const prevAuthRef = useRef(false);

  useEffect(() => {
    if (!isAuth) {
      prevAuthRef.current = false;
      return;
    }
    if (prevAuthRef.current) return; // already prompted this session
    prevAuthRef.current = true;

    AsyncStorage.getItem(FLAG_KEY)
      .then((flag) => {
        if (flag) return;
        showPromptAndRequest();
      })
      .catch(() => { /* swallow — best effort */ });
  }, [isAuth]);
}
