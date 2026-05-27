/**
 * (tabs)/offers.tsx — placeholder. Will be wired to /api/offers/nearby once
 * we have a location plumbed in from the device.
 */

import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../src/constants/colors';

export default function OffersScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Offers</Text>
      <Text style={styles.body}>
        The full offers list is coming soon. For now, check &quot;Offers near you&quot; on the home tab.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1, backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop:    Platform.OS === 'ios' ? 64 : 36,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  body:  { fontSize: 14, color: colors.textMuted, marginTop: 8 },
});
