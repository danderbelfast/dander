/**
 * ChallengeChip — compact card for the horizontal strip on the home screen.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';
import { Challenge } from '../api/challenges';
import { ProgressBar } from './ProgressBar';

interface Props {
  challenge: Challenge;
  onPress?:  () => void;
}

function resetLabel(resets: string) {
  if (resets === 'daily')   return 'Resets daily';
  if (resets === 'weekly')  return 'Resets weekly';
  if (resets === 'monthly') return 'Resets monthly';
  return '';
}

export function ChallengeChip({ challenge, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.chip}>
      <View style={styles.head}>
        <Text style={styles.icon}>{challenge.icon}</Text>
        <View style={styles.points}>
          <Text style={styles.pointsText}>+{challenge.points_reward}</Text>
        </View>
      </View>
      <Text style={styles.name} numberOfLines={1}>{challenge.name}</Text>
      <Text style={styles.progressText}>
        {challenge.progress} / {challenge.target}
      </Text>
      <ProgressBar progress={challenge.progress} target={challenge.target} height={5} />
      <Text style={styles.reset}>{resetLabel(challenge.resets)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 200,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginRight: 10,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: { fontSize: 22 },
  points: {
    backgroundColor: colors.primaryDim,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pointsText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  progressText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    marginBottom: 6,
  },
  reset: { fontSize: 11, color: colors.textDim, marginTop: 8 },
});
