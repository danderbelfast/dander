/**
 * ChallengeCard — full-width card used on the /challenges screen.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';
import { Challenge } from '../api/challenges';
import { ProgressBar } from './ProgressBar';

interface Props {
  challenge: Challenge;
  done?:     boolean;
}

function resetLabel(resets: string) {
  if (resets === 'daily')   return 'Resets daily';
  if (resets === 'weekly')  return 'Resets weekly';
  if (resets === 'monthly') return 'Resets monthly';
  return '';
}

export function ChallengeCard({ challenge, done }: Props) {
  const ratio = challenge.target > 0
    ? Math.min(1, challenge.progress / challenge.target)
    : 0;

  return (
    <View style={[styles.card, done && styles.cardDone]}>
      <View style={styles.head}>
        <Text style={styles.icon}>{challenge.icon}</Text>
        <View style={styles.titleBlock}>
          <Text style={styles.name}>{challenge.name}</Text>
          <Text style={styles.desc}>{challenge.description}</Text>
        </View>
        <View style={styles.points}>
          <Text style={styles.pointsText}>+{challenge.points_reward}</Text>
        </View>
      </View>

      <View style={styles.progressRow}>
        <ProgressBar progress={challenge.progress} target={challenge.target} />
        <Text style={styles.progressText}>
          {challenge.progress} / {challenge.target}
          {ratio >= 1 ? '  ✓' : ''}
        </Text>
      </View>

      <Text style={styles.reset}>{resetLabel(challenge.resets)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  cardDone: {
    opacity: 0.65,
    backgroundColor: colors.surface,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  icon: { fontSize: 28, marginRight: 12, marginTop: 2 },
  titleBlock: { flex: 1, paddingRight: 8 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  desc: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  points: {
    backgroundColor: colors.primaryDim,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pointsText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  progressRow: { marginTop: 14 },
  progressText: {
    marginTop: 6,
    fontSize:  12,
    color:     colors.textMuted,
    fontWeight: '600',
  },
  reset: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textDim,
  },
});
