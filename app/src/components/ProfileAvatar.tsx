/**
 * ProfileAvatar — circular avatar. Shows the user's image if `avatarUrl`
 * is set, otherwise their initials on a brand-coloured circle.
 */

import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';

interface Props {
  firstName?:  string | null;
  lastName?:   string | null;
  email?:      string | null;
  avatarUrl?:  string | null;
  size?:       number;
  onPress?:    () => void;
}

function initialsFrom(firstName?: string | null, lastName?: string | null, email?: string | null) {
  const f = firstName?.trim()[0];
  const l = lastName?.trim()[0];
  if (f && l) return (f + l).toUpperCase();
  if (f)      return f.toUpperCase();
  if (email)  return email.trim()[0]?.toUpperCase() ?? '?';
  return '?';
}

export function ProfileAvatar({
  firstName, lastName, email, avatarUrl,
  size = 40, onPress,
}: Props) {
  const content = avatarUrl ? (
    <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={[
      styles.fallback,
      { width: size, height: size, borderRadius: size / 2 },
    ]}>
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>
        {initialsFrom(firstName, lastName, email)}
      </Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open profile">
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.primary,
    alignItems:     'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontWeight: '700',
  },
});
