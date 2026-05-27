/**
 * offer/[id].tsx — placeholder offer detail screen. Will be expanded with
 * imagery, redemption flow, business profile etc. once the design lands.
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors } from '../../src/constants/colors';

export default function OfferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.screen}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Offer #{id}</Text>
      <Text style={styles.body}>
        Offer details are coming soon. For now, tap an offer from the home tab to come back here.
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
  back: { paddingVertical: 4 },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 12 },
  body:  { fontSize: 14, color: colors.textMuted, marginTop: 8 },
});
