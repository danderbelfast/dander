/**
 * LeaderboardRow — one row in the leaderboard list / preview.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';
import { LeaderboardRow as Row } from '../api/leaderboard';
import { ProfileAvatar } from './ProfileAvatar';

interface Props {
  row:    Row;
  isMe?:  boolean;
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export function LeaderboardRow({ row, isMe }: Props) {
  const rank = row.rank ?? null;
  const medal = rank != null ? MEDALS[rank] : undefined;
  return (
    <View style={[styles.row, isMe && styles.meRow]}>
      <View style={styles.rank}>
        {medal ? (
          <Text style={styles.medal}>{medal}</Text>
        ) : (
          <Text style={styles.rankNum}>{rank == null ? '—' : `#${rank}`}</Text>
        )}
      </View>
      <ProfileAvatar
        firstName={null}
        lastName={null}
        email={row.display_name}
        avatarUrl={row.avatar_url}
        size={36}
      />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {row.display_name}{isMe ? '  (You)' : ''}
        </Text>
        <Text style={styles.sub}>
          👟 {row.steps_this_month.toLocaleString()}  ·  📶 {row.wifi_networks_this_month}
        </Text>
      </View>
      <Text style={styles.points}>{row.points_this_month.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  meRow: {
    backgroundColor: colors.primaryDim,
    borderRadius: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 0,
    marginVertical: 4,
  },
  rank: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medal:   { fontSize: 22 },
  rankNum: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  info: { flex: 1, marginLeft: 10 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  sub:  { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  points: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginLeft: 8,
  },
});
