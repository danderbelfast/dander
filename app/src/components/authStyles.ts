/**
 * authStyles.ts — shared visual language for the auth screens (login,
 * register, verify). Keeping these centralised so the three screens stay
 * in lockstep when the design evolves.
 */

import { StyleSheet, Platform } from 'react-native';
import { colors } from '../constants/colors';

export const authStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop:    Platform.OS === 'ios' ? 64 : 48,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  title: {
    fontSize:   24,
    fontWeight: '700',
    color:      colors.text,
    marginBottom: 4,
    textAlign:  'center',
  },
  subtitle: {
    fontSize: 15,
    color:    colors.textMuted,
    textAlign: 'center',
    marginBottom: 28,
  },
  fieldLabel: {
    fontSize:   13,
    fontWeight: '600',
    color:      colors.text,
    marginBottom: 6,
    marginLeft:   2,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical:   Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    color:    colors.text,
  },
  inputWrap: {
    marginBottom: 14,
  },
  errorBox: {
    backgroundColor: colors.primaryDim,
    borderRadius:    10,
    paddingVertical:   10,
    paddingHorizontal: 14,
    marginBottom:    14,
  },
  errorText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius:    12,
    paddingVertical: 16,
    alignItems:      'center',
    marginTop:       8,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  linkRow: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkMuted: {
    fontSize: 14,
    color:    colors.textMuted,
  },
  linkAccent: {
    color: colors.primary,
    fontWeight: '600',
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop:  -6,
    marginBottom: 14,
  },
  forgotText: {
    fontSize: 13,
    color:    colors.textMuted,
  },
});
