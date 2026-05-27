/**
 * PointsCard — orange hero card for the home dashboard.
 *
 * Big number = points earned this UTC month.
 * Three stat columns: steps, wifi networks, rank.
 * Tier badge bottom-right.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';
import { Tier } from '../api/users';

interface Props {
  pointsThisMonth: number | null;
  steps:           number | null;
  wifiNetworks:    number | null;
  rank:            number | null;
  tier:            Tier | null;
}

const TIER_LABEL: Record<Tier, string> = {
  bronze:   'Bronze',
  silver:   'Silver',
  gold:     'Gold',
  platinum: 'Platinum',
};

function fmt(n: number | null) {
  if (n == null) return '—';
  return n.toLocaleString();
}

export function PointsCard({ pointsThisMonth, steps, wifiNetworks, rank, tier }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>This month</Text>
      </View>

      <Text style={styles.bigNumber}>{fmt(pointsThisMonth)}</Text>
      <Text style={styles.bigLabel}>points</Text>

      <View style={styles.statsRow}>
        <Stat icon="👟" value={fmt(steps)}        label="steps" />
        <Stat icon="📶" value={fmt(wifiNetworks)} label="WiFi" />
        <Stat icon="🏆" value={rank == null ? '—' : `#${rank}`} label="rank" />
      </View>

      {tier ? (
        <View style={styles.tierBadge}>
          <Text style={styles.tierText}>{TIER_LABEL[tier]}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Stat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius:    20,
    padding:         20,
    marginTop:       12,
    overflow:        'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  headerLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bigNumber: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: -1,
  },
  bigLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: -2,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 18,
  },
  stat: {
    flex: 1,
    alignItems: 'flex-start',
  },
  statIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  statValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tierBadge: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  tierText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
