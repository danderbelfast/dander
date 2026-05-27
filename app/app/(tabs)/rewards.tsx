/**
 * (tabs)/rewards.tsx — points balance, redemption flow, "how to earn" list.
 *
 * The redemption endpoint isn't implemented server-side yet; the redeem
 * action shows "Coming soon" when it 404s rather than surfacing an error.
 */

import React, { useState } from 'react';
import axios from 'axios';
import {
  ActivityIndicator,
  Alert,
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

import { colors } from '../../src/constants/colors';
import { usePoints } from '../../src/hooks/usePoints';
import { redeemInStoreCredit } from '../../src/api/rewards';
import { ProgressBar } from '../../src/components/ProgressBar';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CREDIT_COST = 500;

const EARN_ROWS = [
  { icon: '👟', label: 'Steps',           detail: '1 pt per 100 steps' },
  { icon: '📶', label: 'WiFi networks',   detail: '2 pts each (first daily)' },
  { icon: '🏪', label: 'Business visits', detail: 'Points vary' },
  { icon: '☀️', label: 'Daily app open',  detail: '5 pts' },
  { icon: '🎯', label: 'Challenges',      detail: '50–500 pts each' },
  { icon: '👥', label: 'Referrals',       detail: 'Coming soon' },
  { icon: '🎁', label: 'Redeeming offers',detail: 'Points vary' },
];

export default function RewardsScreen() {
  const { loyalty, loading, refresh } = usePoints();
  const [refreshing, setRefreshing] = useState(false);
  const [howOpen, setHowOpen]       = useState(false);
  const [redeeming, setRedeeming]   = useState(false);

  const balance = loyalty?.total_points ?? 0;
  const canRedeem = balance >= CREDIT_COST;
  const toGo = Math.max(0, CREDIT_COST - balance);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function toggleHow() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHowOpen((v) => !v);
  }

  function confirmRedeem() {
    Alert.alert(
      'Redeem points',
      `Redeem 500 points for £10 in-store credit?\nBalance after: ${balance - CREDIT_COST} pts`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: 'default', onPress: doRedeem },
      ],
    );
  }

  async function doRedeem() {
    setRedeeming(true);
    try {
      await redeemInStoreCredit(CREDIT_COST);
      Alert.alert('Redeemed', 'Your £10 in-store credit is on the way.');
      await refresh();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        Alert.alert('Coming soon', 'In-store redemptions go live shortly.');
      } else {
        Alert.alert('Could not redeem', 'Please try again in a moment.');
      }
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Rewards</Text>
        {loading && !loyalty ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.balance}>{balance.toLocaleString()} pts available</Text>
        )}
      </View>

      <View style={styles.valueBanner}>
        <Text style={styles.valueBannerHead}>500 points = £10 in-store credit</Text>
        <Text style={styles.valueBannerBody}>
          Use at any Dander business — high street only.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Spend your points</Text>

      {/* Card 1 — In-store credit */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardIcon}>💳</Text>
          <View style={styles.cardHeadText}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>500 points = £10 credit</Text>
              <View style={styles.bestBadge}>
                <Text style={styles.bestBadgeText}>BEST VALUE</Text>
              </View>
            </View>
            <Text style={styles.cardSub}>Valid at any Dander business</Text>
            <Text style={styles.cardSub}>High street only — no online use</Text>
          </View>
        </View>

        <View style={styles.progressBlock}>
          <ProgressBar progress={Math.min(balance, CREDIT_COST)} target={CREDIT_COST} />
          <Text style={styles.progressLabel}>
            {Math.min(balance, CREDIT_COST)} / {CREDIT_COST} pts
          </Text>
        </View>

        <Pressable
          style={[styles.redeemBtn, !canRedeem && styles.redeemBtnDisabled]}
          disabled={!canRedeem || redeeming}
          onPress={confirmRedeem}
        >
          {redeeming ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.redeemBtnText}>
              {canRedeem ? 'Redeem' : `Need ${toGo} more points`}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Card 2 — Partner vouchers (coming soon) */}
      <View style={[styles.card, styles.cardMuted]}>
        <View style={styles.cardHead}>
          <Text style={styles.cardIcon}>🎁</Text>
          <View style={styles.cardHeadText}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, styles.titleMuted]}>Partner vouchers</Text>
              <View style={styles.soonBadge}>
                <Text style={styles.soonBadgeText}>COMING SOON</Text>
              </View>
            </View>
            <Text style={styles.cardSub}>Exclusive vouchers from Dander partners</Text>
            <Text style={styles.cardSub}>More partners joining soon</Text>
          </View>
        </View>
      </View>

      {/* Card 3 — Experiences (coming soon) */}
      <View style={[styles.card, styles.cardMuted]}>
        <View style={styles.cardHead}>
          <Text style={styles.cardIcon}>🎟️</Text>
          <View style={styles.cardHeadText}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, styles.titleMuted]}>Experiences & prizes</Text>
              <View style={styles.soonBadge}>
                <Text style={styles.soonBadgeText}>COMING SOON</Text>
              </View>
            </View>
            <Text style={styles.cardSub}>Events, prizes and exclusive experiences</Text>
          </View>
        </View>
      </View>

      <Pressable style={styles.collapseHead} onPress={toggleHow}>
        <Text style={styles.sectionTitle}>How to earn points</Text>
        <Text style={styles.collapseCaret}>{howOpen ? '▾' : '▸'}</Text>
      </Pressable>
      {howOpen ? (
        <View style={styles.earnList}>
          {EARN_ROWS.map((r) => (
            <View key={r.label} style={styles.earnRow}>
              <Text style={styles.earnIcon}>{r.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.earnLabel}>{r.label}</Text>
                <Text style={styles.earnDetail}>{r.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  title:   { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  balance: { fontSize: 15, fontWeight: '700', color: colors.primary },
  valueBanner: {
    backgroundColor: colors.primaryDim,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
  },
  valueBannerHead: { fontSize: 16, fontWeight: '700', color: colors.primary },
  valueBannerBody: { fontSize: 13, color: colors.text, marginTop: 4 },
  sectionTitle: {
    fontSize: 17, fontWeight: '700', color: colors.text, marginTop: 22, marginBottom: 8,
  },
  card: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, marginBottom: 12,
    backgroundColor: colors.bg,
  },
  cardMuted: { backgroundColor: colors.surface, opacity: 0.75 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start' },
  cardIcon: { fontSize: 26, marginRight: 12, marginTop: 2 },
  cardHeadText: { flex: 1 },
  cardTitleRow: {
    flexDirection: 'row', alignItems: 'center',
    flexWrap: 'wrap',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginRight: 8 },
  titleMuted: { color: colors.textMuted },
  cardSub:   { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  bestBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  bestBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  soonBadge: {
    backgroundColor: colors.border,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  soonBadgeText: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  progressBlock: { marginTop: 12 },
  progressLabel: { marginTop: 6, fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  redeemBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14,
  },
  redeemBtnDisabled: { backgroundColor: colors.border },
  redeemBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  collapseHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 4,
  },
  collapseCaret: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },
  earnList: { marginTop: 4 },
  earnRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  earnIcon: { fontSize: 22, marginRight: 12 },
  earnLabel:  { fontSize: 14, fontWeight: '600', color: colors.text },
  earnDetail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
});
