/**
 * AppLinksBanner — sits just under the PermissionBanner.
 *
 * On Samsung One UI (and any device that ships with "Open supported
 * links" disabled even though autoVerify succeeded), prompts the user
 * to enable the master toggle so NFC taps to /tap and /till open the
 * app instead of falling through to the browser.
 *
 * Detection + AppState polling + dismissal persistence live in
 * useAppLinksHandling — this file is just the visual.
 *
 * Hidden when status === 'ok' (Pixel path, iOS, Android <12) or
 * 'dismissed' (user said "Not now" for this version).
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppLinksHandling } from '../hooks/useAppLinksHandling';

export function AppLinksBanner() {
  const { status, openSettings, dismiss } = useAppLinksHandling();

  if (status !== 'needs-prompt') return null;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.row}>
        <Text style={styles.text}>
          Want NFC tags to open TapProve instantly? Enable in one tap.
        </Text>
        <View style={styles.buttons}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={dismiss}
            style={styles.dismiss}
          >
            <Text style={styles.dismissText}>Not now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={openSettings}
            style={styles.enable}
          >
            <Text style={styles.enableText}>Enable</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: '#1F2A3A',
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  dismiss: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  dismissText: {
    color: '#9AA4B1',
    fontWeight: '600',
    fontSize: 13,
  },
  enable: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  enableText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
