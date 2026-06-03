/**
 * LoyaltyMeter — per-business progress bar with reward markers, tier
 * badge, streak chip and optional collectable card.
 *
 * Pure presentational; the caller fetches rewards/collectable data.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const TIER_LABELS: Record<string, string> = {
  bronze: '🥉 BRONZE', silver: '🥈 SILVER', gold: '🥇 GOLD',
  platinum: '💎 PLATINUM', diamond: '💎 DIAMOND',
  obsidian: '🌑 OBSIDIAN', legend: '👑 LEGEND',
};

export type LoyaltyReward = {
  id: string; name: string; emoji: string; points_required: number;
};

export type LoyaltyCollectable = {
  emoji: string; name: string; rarity: string; unlock_visits: number; unlocked: boolean;
};

export function LoyaltyMeter({
  currentPoints, rewards, businessName, tier, streak, collectable,
}: {
  currentPoints: number;
  rewards: LoyaltyReward[];
  businessName: string;
  tier: string;
  streak: number;
  collectable?: LoyaltyCollectable;
}) {
  const sortedRewards = [...rewards].sort((a, b) => a.points_required - b.points_required);
  const maxPoints = sortedRewards[sortedRewards.length - 1]?.points_required || 1;
  const progressPct = Math.max(0, Math.min(1, currentPoints / maxPoints));
  const nextReward = sortedRewards.find((r) => currentPoints < r.points_required);
  const pointsAway = nextReward ? nextReward.points_required - currentPoints : 0;

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.tierBadge}>{TIER_LABELS[tier] ?? tier.toUpperCase()}</Text>
        {streak > 0 && <Text style={styles.streakBadge}>🔥 {streak} day streak</Text>}
      </View>

      <Text style={styles.businessName}>{businessName}</Text>
      <Text style={styles.points}>{currentPoints.toLocaleString()} pts</Text>

      <View style={styles.markersRow}>
        {sortedRewards.map((r) => (
          <Text key={r.id} style={[
            styles.markerEmoji,
            currentPoints >= r.points_required ? styles.markerUnlocked : styles.markerLocked,
          ]}>{r.emoji}</Text>
        ))}
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${progressPct * 100}%` }]} />
      </View>

      {nextReward ? (
        <Text style={styles.away}>{nextReward.emoji} {nextReward.name} — {pointsAway} points away</Text>
      ) : (
        <Text style={styles.away}>All rewards unlocked. You legend.</Text>
      )}

      {collectable && (
        <View style={styles.collectable}>
          <Text style={styles.collectableEmoji}>{collectable.emoji}</Text>
          <Text style={styles.collectableName}>{collectable.name}</Text>
          <Text style={styles.collectableMeta}>
            {collectable.rarity.toUpperCase()} · {collectable.unlocked
              ? `${collectable.unlock_visits} visits ✅`
              : `${collectable.unlock_visits} visits to unlock`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: 18, backgroundColor: '#11141B', borderRadius: 14, marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  tierBadge: { color: '#FFD54F', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  streakBadge: { color: '#FF8A65', fontSize: 12 },
  businessName: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 8 },
  points: { color: '#FF6B35', fontSize: 22, fontWeight: '800', marginTop: 2 },
  markersRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 14, marginBottom: 6,
  },
  markerEmoji: { fontSize: 22 },
  markerUnlocked: { opacity: 1 },
  markerLocked:   { opacity: 0.3 },
  barTrack: {
    height: 12, backgroundColor: '#1F2530', borderRadius: 6, overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: '#FF6B35', borderRadius: 6 },
  away: { color: '#9AA4B1', fontSize: 13, marginTop: 8 },
  collectable: {
    marginTop: 14, padding: 14, borderRadius: 12,
    backgroundColor: '#1A1F29', alignItems: 'center',
  },
  collectableEmoji: { fontSize: 36 },
  collectableName:  { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 2 },
  collectableMeta:  { color: '#9AA4B1', fontSize: 11, marginTop: 4, letterSpacing: 0.5 },
});
