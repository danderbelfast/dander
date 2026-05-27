/**
 * login.tsx — email + password. Step 1 of the 2FA login flow: on success the
 * backend emails a 6-digit OTP and returns a tempToken which we hand off to
 * /verify.
 */

import React, { useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '../src/context/AuthContext';
import { extractApiError } from '../src/api/errors';
import { authStyles } from '../src/components/authStyles';
import { Brand } from '../src/components/Brand';
import { PasswordInput } from '../src/components/PasswordInput';
import { colors } from '../src/constants/colors';

export default function LoginScreen() {
  const { requestLoginOtp } = useAuth();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const { tempToken } = await requestLoginOtp({ email: email.trim(), password });
      router.push({
        pathname: '/verify',
        params: { purpose: 'login', tempToken, email: email.trim() },
      });
    } catch (e) {
      setError(extractApiError(e, 'Sign in failed. Please try again.'));
    } finally {
      setSubmitting(false);
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
        <Brand tagline="Welcome back" />

        <Text style={authStyles.title}>Sign in</Text>
        <Text style={authStyles.subtitle}>Use your Dander account email.</Text>

        {error ? (
          <View style={authStyles.errorBox}>
            <Text style={authStyles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={authStyles.inputWrap}>
          <Text style={authStyles.fieldLabel}>Email</Text>
          <TextInput
            style={authStyles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            editable={!submitting}
          />
        </View>

        <View style={authStyles.inputWrap}>
          <Text style={authStyles.fieldLabel}>Password</Text>
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={colors.textDim}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
            editable={!submitting}
          />
        </View>

        <View style={authStyles.forgotRow}>
          <Pressable
            onPress={() =>
              Alert.alert('Reset password', 'Password reset is coming soon. Contact support if you\'re locked out.')
            }
          >
            <Text style={authStyles.forgotText}>Forgot password?</Text>
          </Pressable>
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
            <Text style={authStyles.primaryBtnText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <View style={authStyles.linkRow}>
          <Pressable onPress={() => router.push('/register')}>
            <Text style={authStyles.linkMuted}>
              Don&apos;t have an account?{' '}
              <Text style={authStyles.linkAccent}>Sign up</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
