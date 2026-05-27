/**
 * ActivityRow — single line in the "Recent activity" list.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';
import { LoyaltyTransaction } from '../api/users';

interface Props {
  tx: LoyaltyTransaction;
}

const ICON_BY_REF: Record<string, string> = {
  wifi:         '📶',
  steps:        '👟',
  daily_login:  '☀️',
  login:        '☀️',
  redeem:       '🎁',
  referral:     '👥',
  challenge:    '🎯',
};

function iconFor(refType: string | null): string {
  if (!refType) return '⭐';
  return ICON_BY_REF[refType] ?? '⭐';
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60)    return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)    return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)      return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7)        return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5)       return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function ActivityRow({ tx }: Props) {
  const isRedeem = tx.type === 'redeem' || tx.points < 0;
  const signed   = isRedeem ? -Math.abs(tx.points) : tx.points;
  return (
    <View style={styles.row}>
      <Text style={styles.icon}>{iconFor(tx.reference_type)}</Text>
      <View style={styles.body}>
        <Text style={styles.desc} numberOfLines={1}>
          {tx.description ?? (isRedeem ? 'Redemption' : 'Points earned')}
        </Text>
        <Text style={styles.time}>{timeAgo(tx.created_at)}</Text>
      </View>
      <Text style={[styles.points, isRedeem && styles.pointsNeg]}>
        {signed > 0 ? `+${signed}` : `${signed}`} pts
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  icon: { fontSize: 22, marginRight: 12 },
  body: { flex: 1 },
  desc: { fontSize: 14, color: colors.text, fontWeight: '500' },
  time: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  points: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  pointsNeg: { color: colors.textMuted },
});
