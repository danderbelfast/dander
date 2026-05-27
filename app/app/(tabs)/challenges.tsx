/**
 * (tabs)/challenges.tsx — active and completed challenges + a small nudge
 * back to the leaderboard.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { colors } from '../../src/constants/colors';
import { getActiveChallenges, Challenge } from '../../src/api/challenges';
import { usePoints } from '../../src/hooks/usePoints';
import { ChallengeCard } from '../../src/components/ChallengeCard';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ChallengesScreen() {
  const { me } = usePoints();
  const [challenges, setChallenges]   = useState<Challenge[] | null>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await getActiveChallenges();
      setChallenges(list);
    } catch {
      setChallenges([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function toggleCompleted() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCompletedOpen((v) => !v);
  }

  const active    = (challenges ?? []).filter((c) => c.progress <  c.target);
  const completed = (challenges ?? []).filter((c) => c.progress >= c.target);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Text style={styles.title}>Challenges</Text>
      <Text style={styles.subtitle}>Complete challenges to earn bonus points</Text>

      {loading && (challenges ?? []).length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : active.length === 0 ? (
        <Text style={styles.empty}>No active challenges right now</Text>
      ) : (
        active.map((c) => <ChallengeCard key={c.id} challenge={c} />)
      )}

      {completed.length > 0 ? (
        <>
          <Pressable style={styles.collapseHead} onPress={toggleCompleted}>
            <Text style={styles.sectionTitle}>Completed this month</Text>
            <Text style={styles.caret}>{completedOpen ? '▾' : '▸'}</Text>
          </Pressable>
          {completedOpen ? (
            <View style={{ marginTop: 4 }}>
              {completed.map((c) => <ChallengeCard key={c.id} challenge={c} done />)}
            </View>
          ) : null}
        </>
      ) : null}

      <View style={styles.nudge}>
        <Text style={styles.nudgeText}>
          You&apos;re ranked {me?.rank == null ? '—' : `#${me.rank}`} this month
        </Text>
        <Pressable onPress={() => router.push('/leaderboard')}>
          <Text style={styles.nudgeLink}>View Leaderboard →</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: 20,
    paddingTop:    Platform.OS === 'ios' ? 64 : 36,
    paddingBottom: 32,
  },
  title:    { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: 18 },
  empty:    { fontSize: 14, color: colors.textMuted, marginTop: 24, textAlign: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 16 },
  collapseHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  caret: { color: colors.textMuted, fontSize: 16, marginTop: 16 },
  nudge: {
    marginTop: 24,
    padding: 14,
    backgroundColor: colors.primaryDim,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nudgeText: { fontSize: 13, color: colors.text, fontWeight: '600', flex: 1, marginRight: 8 },
  nudgeLink: { fontSize: 13, color: colors.primary, fontWeight: '700' },
});
