/**
 * index.tsx — home dashboard.
 *
 * Minimal test version: a live points summary (auto-refreshing every 30s
 * while foregrounded, on app resume, and on auth change) plus a button
 * to the leaderboard. Real UI work happens here later.
 */

import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '../src/context/AuthContext';
import { usePoints } from '../src/hooks/usePoints';

export default function Index() {
  const { isAuth, user } = useAuth();
  const points = usePoints();

  if (!isAuth) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.placeholder}>Please sign in.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
      <Text style={styles.greeting}>
        {user ? `Hi ${user.email}` : 'Welcome back'}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>This month</Text>

        <View style={styles.statsGrid}>
          <Stat label="Points"   value={fmt(points.pointsThisMonth)} />
          <Stat label="Rank"     value={points.rank ? `#${points.rank}` : '—'} />
          <Stat label="Steps today" value={fmt(points.stepsToday)} />
          <Stat label="WiFi networks" value={fmt(points.wifiNetworksThisMonth)} />
        </View>

        {points.loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" />
            <Text style={styles.loadingText}>Refreshing…</Text>
          </View>
        )}
        {points.error && (
          <Text style={styles.error}>{points.error}</Text>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={() => router.push('/leaderboard')}
      >
        <Text style={styles.buttonText}>View leaderboard</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function fmt(n: number) {
  return Number(n || 0).toLocaleString();
}

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: '#fff' },
  scroll:        { padding: 16, gap: 16 },
  center:        { alignItems: 'center', justifyContent: 'center' },
  placeholder:   { color: '#666', fontSize: 14 },
  greeting:      { fontSize: 18, fontWeight: '600', color: '#222' },
  card:          {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fafafa',
    gap: 12,
  },
  cardTitle:     { fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  statsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat:          { minWidth: '45%', flexGrow: 1 },
  statLabel:     { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue:     { fontSize: 22, fontWeight: '700', color: '#111', marginTop: 2 },
  loadingRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText:   { fontSize: 12, color: '#666' },
  error:         { color: '#b00020', fontSize: 13 },
  button:        {
    backgroundColor: '#111',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.7 },
  buttonText:    { color: '#fff', fontWeight: '600', fontSize: 15 },
});
