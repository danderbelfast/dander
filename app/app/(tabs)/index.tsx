/**
 * (tabs)/index.tsx — home dashboard.
 *
 * Composes the points card, the active-challenges strip, nearby offers,
 * recent activity, and a 3-row leaderboard preview. All fetches happen in
 * parallel via Promise.allSettled so one missing endpoint never blocks the
 * rest of the screen.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '../../src/context/AuthContext';
import { usePoints } from '../../src/hooks/usePoints';
import { getLoyaltyHistory, LoyaltyTransaction } from '../../src/api/users';
import { getMonthlyLeaderboard, LeaderboardRow as TRow } from '../../src/api/leaderboard';
import { getActiveChallenges, Challenge } from '../../src/api/challenges';
import { getNearbyOffers, Offer } from '../../src/api/offers';

import { colors } from '../../src/constants/colors';
import { ProfileAvatar } from '../../src/components/ProfileAvatar';
import { PointsCard } from '../../src/components/PointsCard';
import { SectionTitle } from '../../src/components/SectionTitle';
import { ChallengeChip } from '../../src/components/ChallengeChip';
import { OfferCard } from '../../src/components/OfferCard';
import { ActivityRow } from '../../src/components/ActivityRow';
import { LeaderboardRow } from '../../src/components/LeaderboardRow';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { loyalty, me, loading: pointsLoading, refresh: refreshPoints } = usePoints();

  const [history, setHistory]         = useState<LoyaltyTransaction[]>([]);
  const [topBoard, setTopBoard]       = useState<TRow[]>([]);
  const [challenges, setChallenges]   = useState<Challenge[] | null>(null);
  const [offers, setOffers]           = useState<Offer[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  const loadExtras = useCallback(async () => {
    const [h, lb, ch, of] = await Promise.allSettled([
      getLoyaltyHistory(),
      getMonthlyLeaderboard(),
      getActiveChallenges(),
      // We don't have device location plumbed in yet; the nearby endpoint
      // requires lat/lng, so this will reject and we'll fall through to the
      // empty state. That's intentional — the section hides itself.
      getNearbyOffers({ lat: 0, lng: 0, radius: 5000 }),
    ]);
    if (h.status  === 'fulfilled') setHistory(h.value);
    if (lb.status === 'fulfilled') setTopBoard(lb.value);
    if (ch.status === 'fulfilled') setChallenges(ch.value);
    else                            setChallenges(null);   // hide the section
    if (of.status === 'fulfilled') setOffers(of.value);
    else                            setOffers([]);
    setLoadingExtras(false);
  }, []);

  useEffect(() => { void loadExtras(); }, [loadExtras]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refreshPoints(), loadExtras()]);
    setRefreshing(false);
  }

  const name = user?.firstName?.trim() || user?.email?.split('@')[0] || 'there';

  const incompleteChallenges = (challenges ?? []).filter(
    (c) => c.progress < c.target,
  );
  const topChallenges = incompleteChallenges.slice(0, 3);

  const recentHistory = history.slice(0, 5);
  const topThree      = topBoard.slice(0, 3);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <Text style={styles.wordmark}>dander</Text>
        <ProfileAvatar
          firstName={user?.firstName}
          lastName={user?.lastName}
          email={user?.email}
          avatarUrl={user?.avatarUrl}
          onPress={() => router.push('/profile')}
        />
      </View>

      <Text style={styles.greeting}>{greeting()}, {name}</Text>
      <Text style={styles.date}>{todayLabel()}</Text>

      {pointsLoading && !loyalty ? (
        <View style={styles.skeleton}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <PointsCard
          pointsThisMonth={me?.points_this_month ?? 0}
          steps={me?.steps_this_month ?? 0}
          wifiNetworks={me?.wifi_networks_this_month ?? 0}
          rank={me?.rank ?? null}
          tier={loyalty?.tier ?? null}
        />
      )}

      {challenges !== null && topChallenges.length > 0 ? (
        <>
          <SectionTitle
            title="Active challenges"
            actionLabel="See all →"
            onAction={() => router.push('/challenges')}
          />
          <FlatList
            data={topChallenges}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(c) => String(c.id)}
            renderItem={({ item }) => (
              <ChallengeChip
                challenge={item}
                onPress={() => router.push('/challenges')}
              />
            )}
          />
        </>
      ) : null}

      <SectionTitle title="Offers near you" />
      {loadingExtras && offers.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
      ) : offers.length === 0 ? (
        <Text style={styles.empty}>No offers nearby right now</Text>
      ) : (
        <FlatList
          data={offers}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(o) => String(o.id)}
          renderItem={({ item }) => (
            <OfferCard
              offer={item}
              onPress={() => router.push({ pathname: '/offer/[id]', params: { id: String(item.id) } })}
            />
          )}
        />
      )}

      <SectionTitle title="Recent activity" />
      {loadingExtras && recentHistory.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
      ) : recentHistory.length === 0 ? (
        <Text style={styles.empty}>Start exploring to earn points</Text>
      ) : (
        recentHistory.map((tx) => <ActivityRow key={tx.id} tx={tx} />)
      )}

      <SectionTitle
        title="This month's top explorers"
        actionLabel="See full leaderboard →"
        onAction={() => router.push('/leaderboard')}
      />
      {loadingExtras && topThree.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
      ) : topThree.length === 0 ? (
        <Text style={styles.empty}>The leaderboard is empty so far this month</Text>
      ) : (
        topThree.map((row) => (
          <LeaderboardRow key={row.user_id} row={row} isMe={user?.id === row.user_id} />
        ))
      )}

      <Pressable
        onPress={() => router.push('/leaderboard')}
        style={styles.fullLink}
      >
        <Text style={styles.fullLinkText}>See full leaderboard →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop:    Platform.OS === 'ios' ? 64 : 36,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wordmark: {
    fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.8,
  },
  greeting: {
    fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 18,
  },
  date: {
    fontSize: 13, color: colors.textMuted, marginTop: 2,
  },
  skeleton: {
    height: 180,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    marginTop: 12,
  },
  empty: {
    fontSize: 14, color: colors.textMuted, marginTop: 6,
  },
  fullLink: {
    marginTop: 18,
    alignItems: 'center',
  },
  fullLinkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
