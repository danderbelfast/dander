/**
 * (tabs)/leaderboard.tsx — top 50 + caller's rank for the current UTC month.
 *
 * The "me" row is pinned just under the top three so the user can always
 * see their own standing without scrolling.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors } from '../../src/constants/colors';
import {
  getMonthlyLeaderboard,
  getMyRank,
  LeaderboardRow as TRow,
} from '../../src/api/leaderboard';
import { useAuth } from '../../src/context/AuthContext';
import { LeaderboardRow } from '../../src/components/LeaderboardRow';

export default function LeaderboardScreen() {
  const { user } = useAuth();
  const [board, setBoard]           = useState<TRow[]>([]);
  const [me, setMe]                 = useState<TRow | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [lb, m] = await Promise.allSettled([getMonthlyLeaderboard(), getMyRank()]);
    if (lb.status === 'fulfilled') setBoard(lb.value);
    if (m.status  === 'fulfilled') setMe(m.value);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const showMePinned = me && (me.rank == null || me.rank > 3);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Text style={styles.title}>Leaderboard</Text>
      <Text style={styles.subtitle}>This month&apos;s top explorers</Text>

      {loading && board.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : board.length === 0 ? (
        <Text style={styles.empty}>The leaderboard is empty so far this month</Text>
      ) : (
        <View style={{ marginTop: 8 }}>
          {board.slice(0, 3).map((row) => (
            <LeaderboardRow key={row.user_id} row={row} isMe={user?.id === row.user_id} />
          ))}

          {showMePinned ? (
            <>
              <Text style={styles.divider}>YOU</Text>
              <LeaderboardRow row={me!} isMe />
              <Text style={styles.divider}>FULL RANKING</Text>
            </>
          ) : null}

          {board.slice(3).map((row) => (
            <LeaderboardRow key={row.user_id} row={row} isMe={user?.id === row.user_id} />
          ))}
        </View>
      )}
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
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: 12 },
  empty:    { fontSize: 14, color: colors.textMuted, marginTop: 24, textAlign: 'center' },
  divider: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    marginTop: 18, marginBottom: 6, letterSpacing: 1,
  },
});
