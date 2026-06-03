/**
 * PermissionBanner — soft "Enable [permission] for [feature]" strip
 * rendered at the top of the app whenever a non-blocking permission
 * the app benefits from is denied.
 *
 * Surfaces the first denial it finds in priority order (Bluetooth first
 * because the loyalty greeting depends on it most directly, then
 * Location, then Activity). Each entry's [Enable] button opens the
 * system app-settings page; on return the AppState 'active' listener
 * re-checks and the banner disappears if the user fixed it.
 *
 * Never blocks. Never modal. Never hides app content — it sits in a
 * SafeAreaView at the top and the Stack renders beneath.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState, Linking, PermissionsAndroid, Platform,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

type Slot = {
  label: string;
  feature: string;
  /** Returns true when the permission *needs* nagging. */
  check: () => Promise<boolean>;
};

const isAndroid = Platform.OS === 'android';
const sdk = typeof Platform.Version === 'number'
  ? Platform.Version
  : parseInt(String(Platform.Version), 10);

async function androidPermDenied(perm: string): Promise<boolean> {
  if (!isAndroid) return false;
  try { return !(await PermissionsAndroid.check(perm as any)); }
  catch { return false; }
}

const PRIORITY_SLOTS: Slot[] = [
  {
    label: 'Bluetooth',
    feature: 'recognising you at local businesses',
    // BLUETOOTH_SCAN only matters on API 31+; pre-API-31 BLE is gated
    // by ACCESS_FINE_LOCATION (covered by the Location slot below).
    check: async () => isAndroid && sdk >= 31
      && await androidPermDenied('android.permission.BLUETOOTH_SCAN'),
  },
  {
    label: 'Location',
    feature: 'WiFi-based check-ins and Bluetooth scanning',
    check: async () => isAndroid
      && await androidPermDenied('android.permission.ACCESS_FINE_LOCATION'),
  },
  {
    label: 'Notifications',
    feature: 'loyalty points alerts and nearby offers',
    // expo-notifications cross-platform; reports 'undetermined' on first
    // launch which we treat as denied so we nag, then the friendly
    // walkthrough handles it on next launch.
    check: async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        return status !== 'granted';
      } catch { return false; }
    },
  },
  {
    label: 'Activity',
    feature: 'step counting',
    // ACTIVITY_RECOGNITION is a no-op runtime perm pre-API-29.
    check: async () => isAndroid && sdk >= 29
      && await androidPermDenied('android.permission.ACTIVITY_RECOGNITION'),
  },
];

async function findFirstDenied(): Promise<Slot | null> {
  for (const slot of PRIORITY_SLOTS) {
    try {
      if (await slot.check()) return slot;
    } catch {
      // If we can't even check, don't bother nagging the user.
    }
  }
  return null;
}

export function PermissionBanner() {
  const [denied, setDenied] = useState<Slot | null>(null);

  const check = useCallback(async () => {
    const slot = await findFirstDenied();
    setDenied(slot);
  }, []);

  useEffect(() => {
    check();
    // Re-check whenever the app returns to the foreground — typical path
    // after the user came back from the system settings screen.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  if (!denied) return null;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.row}>
        <Text style={styles.text}>
          Enable {denied.label} for {denied.feature}.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => Linking.openSettings()}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Enable</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: '#1F2A3A',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  text: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
