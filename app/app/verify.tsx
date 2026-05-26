/**
 * verify.tsx — second step of both the login and register flows.
 *
 * Driven by URL params:
 *   purpose=login    + tempToken=<jwt>     → POST /api/auth/login/verify
 *   purpose=register + userId=<id>         → POST /api/auth/verify-2fa
 *
 * On login-verify success we set the session and replace the stack with /.
 * On register-verify success the account is verified but the backend doesn't
 * mint a token — we send the user back to /login with a success notice.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuth } from '../src/context/AuthContext';
import { resendOtp } from '../src/api/auth';
import { extractApiError } from '../src/api/errors';
import { authStyles } from '../src/components/authStyles';
import { Brand } from '../src/components/Brand';
import { colors } from '../src/constants/colors';

type Purpose = 'login' | 'register';

export default function VerifyScreen() {
  const { completeLogin, verifyRegisterOtp } = useAuth();
  const params = useLocalSearchParams<{
    purpose:   string;
    tempToken?: string;
    userId?:    string;
    email?:     string;
  }>();

  const purpose = (params.purpose === 'register' ? 'register' : 'login') as Purpose;
  const tempToken = typeof params.tempToken === 'string' ? params.tempToken : null;
  const userId    = params.userId ? Number(params.userId) : null;
  const email     = typeof params.email === 'string' ? params.email : null;

  const [code, setCode]             = useState('');
  const [error, setError]           = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending]   = useState(false);

  const canSubmit = code.length === 6 && /^\d{6}$/.test(code) && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      if (purpose === 'login') {
        if (!tempToken) throw new Error('Missing session — please sign in again.');
        await completeLogin(tempToken, code);
      } else {
        if (!userId) throw new Error('Missing user — please sign up again.');
        await verifyRegisterOtp(userId, code);
      }
      router.replace('/');
    } catch (e) {
      setError(extractApiError(e, 'Verification failed. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resending) return;
    if (!userId && purpose === 'register') {
      setError('Missing user — please sign up again.');
      return;
    }
    if (purpose === 'login') {
      // Backend resend is keyed by userId, which we don't have during the
      // login OTP step. Easiest path: send the user back to /login.
      Alert.alert(
        'Resend code',
        'Please sign in again to get a fresh code.',
        [{ text: 'OK', onPress: () => router.replace('/login') }],
      );
      return;
    }
    setResending(true);
    try {
      await resendOtp(userId!, 'register');
      Alert.alert('Code sent', 'A new code has been sent to your email.');
    } catch (e) {
      setError(extractApiError(e, 'Could not resend code.'));
    } finally {
      setResending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={authStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={authStyles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Brand tagline="Verify your email" />

        <Text style={authStyles.title}>Enter your code</Text>
        <Text style={authStyles.subtitle}>
          {email
            ? `We sent a 6-digit code to ${email}.`
            : 'We sent a 6-digit code to your email.'}
        </Text>

        {error ? (
          <View style={authStyles.errorBox}>
            <Text style={authStyles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={authStyles.inputWrap}>
          <Text style={authStyles.fieldLabel}>Verification code</Text>
          <TextInput
            style={[authStyles.input, { letterSpacing: 8, textAlign: 'center', fontSize: 22 }]}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={colors.textDim}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
            editable={!submitting}
          />
        </View>

        <TouchableOpacity
          style={[authStyles.primaryBtn, !canSubmit && authStyles.primaryBtnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={authStyles.primaryBtnText}>
              {purpose === 'login' ? 'Verify & Sign In' : 'Verify Account'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={authStyles.linkRow}>
          <Pressable onPress={handleResend} disabled={resending}>
            <Text style={authStyles.linkMuted}>
              Didn&apos;t get a code?{' '}
              <Text style={authStyles.linkAccent}>
                {resending ? 'Sending…' : 'Resend'}
              </Text>
            </Text>
          </Pressable>
        </View>

        <View style={[authStyles.linkRow, { marginTop: 12 }]}>
          <Pressable onPress={() => router.replace(purpose === 'login' ? '/login' : '/register')}>
            <Text style={authStyles.linkMuted}>
              <Text style={authStyles.linkAccent}>Back</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
