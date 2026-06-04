/**
 * display-preference.tsx — one-time onboarding choice between
 * personalised greetings and anonymous check-ins. Shown after
 * account creation; users can change it later from
 * Settings → Privacy.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { setDisplayPreference, DisplayPreference } from '../../src/api/users';

export default function DisplayPreferenceOnboarding() {
  const [submitting, setSubmitting] = useState<DisplayPreference | null>(null);

  async function choose(pref: DisplayPreference) {
    if (submitting) return;
    setSubmitting(pref);
    await setDisplayPreference(pref);
    // Always continue — if the save failed the user can change it later.
    router.replace('/');
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>How would you like to be recognised?</Text>
        <Text style={styles.subtitle}>You can change this anytime in Settings → Privacy.</Text>

        <Card
          emoji="🎉"
          title="Personalised"
          body="Show my name when I check in at local businesses. Get birthday surprises and personalised greetings."
          accent="#FF6B35"
          loading={submitting === 'personalised'}
          onPress={() => choose('personalised')}
        />

        <Card
          emoji="🕵️"
          title="Anonymous"
          body="Check in privately — no name shown on screen. Points and rewards work exactly the same."
          accent="#90A4AE"
          loading={submitting === 'anonymous'}
          onPress={() => choose('anonymous')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({
  emoji, title, body, accent, loading, onPress,
}: {
  emoji: string; title: string; body: string; accent: string;
  loading: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: accent },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={styles.cardEmoji}>{emoji}</Text>
      <Text style={[styles.cardTitle, { color: accent }]}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
      <View style={[styles.cardCta, { backgroundColor: accent }]}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.cardCtaText}>Select</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#0F1115' },
  scroll:   { padding: 22, paddingBottom: 48 },
  title:    { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 12 },
  subtitle: { color: '#9AA4B1', fontSize: 14, marginTop: 6, marginBottom: 24 },
  card: {
    borderWidth: 2, borderRadius: 16, padding: 20, marginBottom: 16,
    backgroundColor: '#11141B', alignItems: 'flex-start', gap: 8,
  },
  cardEmoji:    { fontSize: 36 },
  cardTitle:    { fontSize: 22, fontWeight: '800', marginTop: 4 },
  cardBody:     { color: '#E0E0E0', fontSize: 15, lineHeight: 21, marginTop: 2 },
  cardCta:      {
    alignSelf: 'stretch', borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', marginTop: 14,
  },
  cardCtaText:  { color: '#fff', fontWeight: '700', fontSize: 15 },
});
