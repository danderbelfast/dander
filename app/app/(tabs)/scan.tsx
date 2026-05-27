/**
 * (tabs)/scan.tsx — never actually rendered in normal use. The Scan tab
 * intercepts its press in (tabs)/_layout.tsx and shows an alert instead of
 * navigating here. This screen exists so expo-router has a route to bind
 * the tab to.
 */

import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../src/constants/colors';

export default function ScanScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Scan</Text>
      <Text style={styles.body}>QR scanning is on the way.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop:    Platform.OS === 'ios' ? 64 : 36,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  body:  { fontSize: 14, color: colors.textMuted, marginTop: 8 },
});
