/**
 * SectionTitle — header row with a title on the left and an optional
 * "See all →" action on the right.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';

interface Props {
  title:        string;
  actionLabel?: string;
  onAction?:    () => void;
}

export function SectionTitle({ title, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'baseline',
    justifyContent: 'space-between',
    marginTop:     24,
    marginBottom:  12,
  },
  title:  { fontSize: 17, fontWeight: '700', color: colors.text },
  action: { fontSize: 13, fontWeight: '600', color: colors.primary },
});
