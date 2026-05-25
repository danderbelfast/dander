/**
 * Leaderboard.tsx — monthly leaderboard for the Expo app.
 *
 * Pulls /api/leaderboard/monthly and /api/leaderboard/me. Top-50 list
 * with the caller's own row highlighted. "My rank" card pinned at the
 * top. Friends and All Time tabs are disabled placeholders.
 *
 * Simple FlatList view — efficient with hundreds of rows. Minimal styling.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, ActivityIndicator, RefreshControl,
  Pressable, StyleSheet,
} from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '../context/AuthContext';
import {
  getMonthlyLeaderboard, getMyLeaderboard,
  LeaderboardRow, MyLeaderboard,
} from '../api/leaderboard';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmt(n: number) {
  return Number(n || 0).toLocaleString();
}

function daysUntilReset(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function Leaderboard() {
  const { user } = useAuth();
  const [tab, setTab]         = useState<'monthly' | 'friends' | 'all_time'>('monthly');
  const [rows, setRows]       = useState<LeaderboardRow[]>([]);
  const [me, setMe]           = useState<MyLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [board, mine] = await Promise.all([
        getMonthlyLeaderboard().catch(() => [] as LeaderboardRow[]),
        getMyLeaderboard().catch(() => null),
      ]);
      setRows(board);
      setMe(mine);
      setError(null);
    } catch {
      setError('Failed to load the leaderboard.');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const now = new Date();
  const monthLabel = useMemo(
    () => `${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`,
    [now]
  );
  const resetIn = useMemo(daysUntilReset, []);

  const header = (
    <View style={styles.headerBlock}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Belfast Leaderboard</Text>
      <Text style={styles.subtitle}>
        {monthLabel} — resets in {resetIn} day{resetIn === 1 ? '' : 's'}
      </Text>

      {/* Tabs */}
      <View style={styles.tabs}>
        {([
          { key: 'monthly',  label: 'Monthly',  enabled: true  },
          { key: 'friends',  label: 'Friends',  enabled: false },
          { key: 'all_time', label: 'All Time', enabled: false },
        ] as const).map((t) => (
          <Pressable
            key={t.key}
            onPress={() => t.enabled && setTab(t.key)}
            disabled={!t.enabled}
            style={[
              styles.tab,
              tab === t.key && t.enabled && styles.tabActive,
              !t.enabled && styles.tabDisabled,
            ]}
          >
            <Text style={[
              styles.tabText,
              tab === t.key && t.enabled && styles.tabTextActive,
              !t.enabled && styles.tabTextDisabled,
            ]}>{t.label}</Text>
            {!t.enabled && <Text style={styles.tabSoon}>coming soon</Text>}
          </Pressable>
        ))}
      </View>

      {/* My rank card */}
      {me && (
        <View style={styles.meCard}>
          <View style={styles.meCardRow}>
            <Text style={styles.meCardLabel}>Your rank</Text>
            <Text style={styles.meCardRank}>{me.rank ? `#${me.rank}` : '—'}</Text>
          </View>
          <View style={styles.meStats}>
            <MeStat label="Points"   value={fmt(me.points_this_month)} />
            <MeStat label="Steps"    value={fmt(me.steps_this_month)} />
            <MeStat label="Networks" value={fmt(me.wifi_networks_this_month)} />
          </View>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (tab !== 'monthly') {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.center}>
          <Text style={styles.placeholder}>Coming soon.</Text>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.listContent}
      data={rows}
      keyExtractor={(item) => String(item.user_id)}
      ListHeaderComponent={header}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListEmptyComponent={
        error ? (
          <Text style={[styles.placeholder, styles.errorText]}>{error}</Text>
        ) : (
          <Text style={styles.placeholder}>
            No one has earned points yet this month — be the first!
          </Text>
        )
      }
      renderItem={({ item }) => {
        const isMe = item.user_id === user?.id;
        return (
          <View style={[styles.row, isMe && styles.rowMe]}>
            <Text style={[
              styles.rank,
              item.rank <= 3 ? styles.rankTop : null,
            ]}>{item.rank}</Text>
            <View style={styles.rowMain}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.display_name}{isMe ? ' (you)' : ''}
              </Text>
              <Text style={styles.rowSub}>
                {fmt(item.steps_this_month)} steps · {fmt(item.wifi_networks_this_month)} networks
              </Text>
            </View>
            <View style={styles.rowPts}>
              <Text style={styles.rowPtsValue}>{fmt(item.points_this_month)}</Text>
              <Text style={styles.rowPtsLabel}>pts</Text>
            </View>
          </View>
        );
      }}
    />
  );
}

function MeStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.meStatLabel}>{label}</Text>
      <Text style={styles.meStatValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:          { flex: 1, backgroundColor: '#fff' },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  listContent:     { paddingBottom: 32 },
  headerBlock:     { padding: 16, gap: 8 },
  backBtn:         { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 12 },
  backText:        { color: '#444', fontSize: 14 },
  title:           { fontSize: 22, fontWeight: '700', color: '#111' },
  subtitle:        { fontSize: 13, color: '#666', marginBottom: 6 },

  tabs:            { flexDirection: 'row', gap: 0, borderBottomWidth: 1, borderColor: '#e5e5e5' },
  tab:             { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive:       { borderBottomWidth: 2, borderColor: '#111' },
  tabDisabled:     { opacity: 0.5 },
  tabText:         { fontSize: 13, color: '#444', fontWeight: '500' },
  tabTextActive:   { color: '#111', fontWeight: '700' },
  tabTextDisabled: { color: '#999' },
  tabSoon:         { fontSize: 9, color: '#aaa', marginTop: 2 },

  meCard:          {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 10,
  },
  meCardRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meCardLabel:     { color: 'rgba(255,255,255,0.7)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  meCardRank:      { color: '#fff', fontSize: 26, fontWeight: '800' },
  meStats:         { flexDirection: 'row', gap: 12 },
  meStatLabel:     { color: 'rgba(255,255,255,0.7)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  meStatValue:     { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 2 },

  row:             {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 8,
    borderRadius: 8,
    gap: 12,
  },
  rowMe:           { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#111' },
  rank:            { width: 32, textAlign: 'right', fontWeight: '700', fontSize: 15, color: '#888' },
  rankTop:         { color: '#111' },
  rowMain:         { flex: 1, minWidth: 0 },
  rowName:         { fontSize: 14, fontWeight: '600', color: '#111' },
  rowSub:          { fontSize: 11, color: '#777', marginTop: 2 },
  rowPts:          { alignItems: 'flex-end' },
  rowPtsValue:     { fontSize: 15, fontWeight: '700', color: '#111' },
  rowPtsLabel:     { fontSize: 10, color: '#888' },

  placeholder:     { textAlign: 'center', color: '#777', fontSize: 14 },
  errorText:       { color: '#b00020' },
});
