/**
 * Brand.tsx — wordmark used at the top of auth screens. Pure text for now;
 * swap for an SVG / image when design provides one.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors } from '../constants/colors';

export function Brand({ tagline }: { tagline?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.wordmark}>TapProve</Text>
      <View style={styles.dot} />
      {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:     { alignItems: 'center', marginBottom: 32 },
  wordmark: {
    fontSize:      44,
    fontWeight:    '800',
    letterSpacing: -1.5,
    color:         colors.text,
  },
  dot: {
    width:        8,
    height:       8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop:    -6,
    marginRight:  -36,
    alignSelf:    'flex-end',
  },
  tagline: {
    marginTop: 8,
    fontSize:  15,
    color:     colors.textMuted,
  },
});
