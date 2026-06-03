/**
 * NfcCheckInScreen — full-screen takeover triggered by a tap check-in.
 *
 * Animation budget (5s total):
 *   0–2000ms   Tap detected. Six coins spawn at the bottom of the screen
 *              and stream upward toward the pot icon at the top. Light
 *              haptic pulses every ~250ms; the point counter ticks up.
 *   2000–3500  Coins settle into the pot. Counter lands on the final
 *              total. Strong haptic.
 *   3500–5000  Card stays up: business name, message, +N points, tier
 *              badge, streak, collectable unlock card.
 *   5000       Auto-dismiss.
 *
 * Mounted at app root inside the SideEffects tree (zero direct callers).
 * Subscribes to onNfcCheckin and renders an absolutely-positioned
 * overlay when an event arrives.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, Modal, StyleSheet, Text, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { onNfcCheckin } from '../services/nfcHandler';
import { NfcCheckinResponse, RewardUnlocked, CollectableUnlocked } from '../api/proximity';

const COIN_COUNT = 6;
const DURATION_MS = 5_000;

const TIER_LABELS: Record<string, string> = {
  bronze: '🥉 BRONZE', silver: '🥈 SILVER', gold: '🥇 GOLD',
  platinum: '💎 PLATINUM', diamond: '💎 DIAMOND',
  obsidian: '🌑 OBSIDIAN', legend: '👑 LEGEND',
};

export function NfcCheckInScreen() {
  const [result, setResult] = useState<NfcCheckinResponse | null>(null);

  useEffect(() => {
    const off = onNfcCheckin((res) => {
      setResult(res);
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch { /* swallow */ }
      // Stagger a few impacts during the coin transfer for tactile feedback.
      const t1 = setTimeout(() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }, 400);
      const t2 = setTimeout(() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }, 900);
      const t3 = setTimeout(() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} }, 1400);
      const t4 = setTimeout(() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {} }, 2400);
      const dismiss = setTimeout(() => setResult(null), DURATION_MS);
      return () => { [t1, t2, t3, t4, dismiss].forEach(clearTimeout); };
    });
    return off;
  }, []);

  if (!result) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setResult(null)}>
      <CheckInOverlay result={result} onClose={() => setResult(null)} />
    </Modal>
  );
}

function CheckInOverlay({ result, onClose }: { result: NfcCheckinResponse; onClose: () => void }) {
  return (
    <View style={styles.root}>
      <PotAtTop />
      <CoinSwarm />
      <PointCounter target={result.points_awarded} />
      <View style={styles.card}>
        <Text style={styles.business}>{result.business_name}</Text>
        <Text style={styles.points}>+{result.points_awarded} POINTS!</Text>
        <Text style={styles.balance}>Balance: {result.total_points.toLocaleString()}</Text>
        {result.tier_upgraded && (
          <Text style={styles.tier}>⭐ {TIER_LABELS[result.tier] ?? result.tier.toUpperCase()} MEMBER!</Text>
        )}
        {result.streak > 1 && (
          <Text style={styles.streak}>🔥 {result.streak} day streak!</Text>
        )}
        {result.collectable_unlocked && <CollectableCard kind="unlocked" c={result.collectable_unlocked} />}
        {result.collectable_evolved  && <CollectableCard kind="evolved"  c={result.collectable_evolved}  />}
        {result.rewards_unlocked.length > 0 && <RewardList rewards={result.rewards_unlocked} />}
      </View>
    </View>
  );
}

function PotAtTop() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // Quick pop when coins arrive ~2200ms in.
    const t = setTimeout(() => {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.25, duration: 200, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,    duration: 200, useNativeDriver: true }),
      ]).start();
    }, 2200);
    return () => clearTimeout(t);
  }, []);
  return (
    <Animated.View style={[styles.pot, { transform: [{ scale }] }]}>
      <Text style={styles.potIcon}>💰</Text>
    </Animated.View>
  );
}

function CoinSwarm() {
  // Six coins, each with a slightly staggered launch.
  const coins = useMemo(() => Array.from({ length: COIN_COUNT }, (_, i) => i), []);
  return (
    <View pointerEvents="none" style={styles.swarm}>
      {coins.map((i) => <Coin key={i} index={i} />)}
    </View>
  );
}

function Coin({ index }: { index: number }) {
  const y = useRef(new Animated.Value(0)).current;
  const x = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const delay = index * 80;
    const lateralOffset = (index - COIN_COUNT / 2) * 22;
    Animated.parallel([
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, {
          toValue: -1,                        // -1 = "all the way up" in our coordinate.
          duration: 1600,
          easing: Easing.bezier(0.5, 0, 0.4, 1),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(x, {
          toValue: lateralOffset,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(x, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);
  // y maps from 0 (bottom) to -1 (top); convert to a px translate.
  const translateY = y.interpolate({ inputRange: [-1, 0], outputRange: [-560, 0] });
  return (
    <Animated.Text style={[styles.coin, { opacity, transform: [{ translateY }, { translateX: x }] }]}>
      🪙
    </Animated.Text>
  );
}

function PointCounter({ target }: { target: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target <= 0) return;
    const steps = 30;
    const step = Math.max(1, Math.round(target / steps));
    let v = 0;
    const id = setInterval(() => {
      v = Math.min(target, v + step);
      setVal(v);
      if (v >= target) clearInterval(id);
    }, 60);
    return () => clearInterval(id);
  }, [target]);
  return <Text style={styles.counter}>+{val}</Text>;
}

function CollectableCard({ kind, c }: { kind: 'unlocked' | 'evolved'; c: CollectableUnlocked }) {
  return (
    <View style={styles.collectable}>
      <Text style={styles.collectableEmoji}>{c.emoji}</Text>
      <Text style={styles.collectableName}>{c.name}</Text>
      <Text style={styles.collectableMeta}>
        {kind === 'evolved' ? 'EVOLVED ✨' : `${c.rarity.toUpperCase()} ✨ UNLOCKED`}
      </Text>
    </View>
  );
}

function RewardList({ rewards }: { rewards: RewardUnlocked[] }) {
  return (
    <View style={styles.rewards}>
      <Text style={styles.rewardsHeading}>🎁 REWARD UNLOCKED</Text>
      {rewards.map((r) => (
        <Text key={r.id} style={styles.rewardLine}>{r.emoji} {r.name}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: '#1A1A1A',
    justifyContent: 'flex-end', alignItems: 'center',
    paddingBottom: 28,
  },
  pot: {
    position: 'absolute', top: 64, alignSelf: 'center',
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6B35', shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
  },
  potIcon: { fontSize: 56 },
  swarm: {
    position: 'absolute', bottom: 80, left: 0, right: 0,
    alignItems: 'center', height: 0,
  },
  coin: { fontSize: 32, position: 'absolute' },
  counter: {
    position: 'absolute', top: 188, color: '#FFD54F',
    fontSize: 44, fontWeight: '800',
  },
  card: {
    width: '100%', maxWidth: 480, paddingHorizontal: 24, paddingVertical: 28,
    alignItems: 'center', backgroundColor: '#0E0E12',
    borderRadius: 18, borderColor: '#222', borderWidth: 1,
  },
  business: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  points:   { color: '#FF6B35', fontSize: 34, fontWeight: '800', marginTop: 10 },
  balance:  { color: '#E0E0E0', fontSize: 16, marginTop: 6 },
  tier:     { color: '#FFD54F', fontSize: 18, fontWeight: '700', marginTop: 14, textShadowColor: '#FFD54F', textShadowRadius: 8 },
  streak:   { color: '#FF8A65', fontSize: 16, marginTop: 8 },
  collectable: {
    marginTop: 16, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 12, backgroundColor: '#1A1F29', alignItems: 'center',
  },
  collectableEmoji: { fontSize: 44 },
  collectableName:  { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 4 },
  collectableMeta:  { color: '#FFD54F', fontSize: 12, marginTop: 2, letterSpacing: 1 },
  rewards: { marginTop: 14, alignItems: 'center' },
  rewardsHeading: { color: '#FFD54F', fontSize: 12, letterSpacing: 2, marginBottom: 6 },
  rewardLine: { color: '#FFFFFF', fontSize: 16, marginTop: 2 },
});
