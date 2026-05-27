/**
 * PointsCard — orange hero card for the home dashboard.
 *
 * Big number = points earned this UTC month.
 * Three stat columns: steps (live from device), wifi networks, rank.
 * Tier badge bottom-right.
 *
 * Steps display reads from useLiveSteps when the pedometer is available so
 * the count ticks up in real time. The `steps` prop (from the server) is
 * used as a fallback on devices without a pedometer.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';
import { Tier } from '../api/users';
import useLiveSteps from '../hooks/useLiveSteps';
import { hapticLight, hapticMedium } from '../services/haptics';
import { soundPoints, soundMilestone } from '../services/sounds';

const STEP_MILESTONES = [1000, 5000, 10000, 20000];

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
  const liveSteps = useLiveSteps();
  const stepsDisplay = liveSteps != null ? liveSteps : steps;

  // Subtle ping when the server's monthly points value ticks up. Skip the
  // first observation to avoid firing on initial mount.
  const prevPoints = useRef<number | null>(null);
  useEffect(() => {
    if (pointsThisMonth != null && prevPoints.current != null && pointsThisMonth > prevPoints.current) {
      hapticLight();
      soundPoints();
    }
    prevPoints.current = pointsThisMonth;
  }, [pointsThisMonth]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>This month</Text>
      </View>

      <Text style={styles.bigNumber}>{fmt(pointsThisMonth)}</Text>
      <Text style={styles.bigLabel}>points</Text>

      <View style={styles.statsRow}>
        <StepsStat value={stepsDisplay} />
        <Stat icon="📶" value={fmt(wifiNetworks)} label="wifi today" />
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

/**
 * StepsStat — same layout as Stat, but pops the icon briefly on each
 * increment so the live tick is visible without watching the digits move.
 */
function StepsStat({ value }: { value: number | null }) {
  const scale = useRef(new Animated.Value(1)).current;
  const prev  = useRef<number | null>(null);
  const lastMilestone = useRef<number>(0);

  useEffect(() => {
    if (value == null) return;
    if (prev.current != null && value !== prev.current) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.2, duration: 110, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.0, duration: 140, useNativeDriver: true }),
      ]).start();
    }
    // Milestone — fire once per session per threshold crossed upward.
    for (const m of STEP_MILESTONES) {
      if (value >= m && lastMilestone.current < m) {
        lastMilestone.current = m;
        hapticMedium();
        soundMilestone();
        break;
      }
    }
    prev.current = value;
  }, [value, scale]);

  return (
    <View style={styles.stat}>
      <Animated.Text style={[styles.statIcon, { transform: [{ scale }] }]}>👟</Animated.Text>
      <Text style={styles.statValue}>{fmt(value)}</Text>
      <Text style={styles.statLabel}>steps today</Text>
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
