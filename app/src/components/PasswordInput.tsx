/**
 * PasswordInput.tsx — TextInput with a show/hide eye toggle.
 *
 * Renders authStyles.input visually and overlays an Ionicons button on the
 * right that flips `secureTextEntry`.
 */

import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { authStyles } from './authStyles';
import { colors } from '../constants/colors';

interface Props extends Omit<TextInputProps, 'secureTextEntry'> {
  containerStyle?: ViewStyle;
}

export function PasswordInput({ containerStyle, style, ...rest }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <TextInput
        {...rest}
        style={[authStyles.input, styles.input, style]}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        style={styles.toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      >
        <Ionicons
          name={visible ? 'eye-off' : 'eye'}
          size={20}
          color={colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { position: 'relative' },
  input: { paddingRight: 48 },
  toggle: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
});
