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

type Slot = {
  label: string;
  feature: string;
  permission: string;
};

const PRIORITY_SLOTS: Slot[] = [
  {
    label: 'Bluetooth',
    feature: 'recognising you at local businesses',
    // BLUETOOTH_SCAN only matters on API 31+. On older Android, BLE
    // is gated on ACCESS_FINE_LOCATION (covered by the next slot).
    permission: 'android.permission.BLUETOOTH_SCAN',
  },
  {
    label: 'Location',
    feature: 'WiFi-based check-ins and Bluetooth scanning',
    permission: 'android.permission.ACCESS_FINE_LOCATION',
  },
  {
    label: 'Activity',
    feature: 'step counting',
    permission: 'android.permission.ACTIVITY_RECOGNITION',
  },
];

async function findFirstDenied(): Promise<Slot | null> {
  if (Platform.OS !== 'android') return null;
  const sdk = typeof Platform.Version === 'number'
    ? Platform.Version
    : parseInt(String(Platform.Version), 10);

  for (const slot of PRIORITY_SLOTS) {
    // BLUETOOTH_SCAN is a no-op runtime perm pre-API-31 — skip it there
    // (location coverage is what actually gates BLE on those devices).
    if (slot.permission === 'android.permission.BLUETOOTH_SCAN' && sdk < 31) continue;
    // ACTIVITY_RECOGNITION is a no-op runtime perm pre-API-29.
    if (slot.permission === 'android.permission.ACTIVITY_RECOGNITION' && sdk < 29) continue;

    try {
      // Cast: TS types limit the union to known constants, but the
      // string form works at runtime and we control these values.
      const ok = await PermissionsAndroid.check(slot.permission as any);
      if (!ok) return slot;
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
