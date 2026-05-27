/**
 * ProgressBar — thin horizontal bar coloured by progress/target.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '../constants/colors';

interface Props {
  progress: number;
  target:   number;
  height?:  number;
  tint?:    string;
}

export function ProgressBar({ progress, target, height = 6, tint = colors.primary }: Props) {
  const ratio = target > 0
    ? Math.max(0, Math.min(1, progress / target))
    : 0;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.fill,
          {
            width: `${ratio * 100}%`,
            backgroundColor: tint,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.border, overflow: 'hidden' },
  fill:  { height: '100%' },
});
