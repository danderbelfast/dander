/**
 * register.tsx — create an account. Step 1 of the verified-signup flow: the
 * backend stores the new user as unverified, emails a 6-digit OTP, and
 * returns a userId we hand off to /verify.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { Country, listCountries } from '../src/api/auth';

function flagFor(code: string): string {
  if (!code || code.length !== 2) return '🏳️';
  const A = 'A'.charCodeAt(0);
  const points = code.toUpperCase().split('').map((c) => 0x1F1E6 + c.charCodeAt(0) - A);
  return String.fromCodePoint(...points);
}

function detectRegion(): string {
  try {
    const locale = (Intl as any)?.DateTimeFormat?.().resolvedOptions?.()?.locale || 'en-GB';
    const region = String(locale).split('-')[1]?.toUpperCase();
    if (region && /^[A-Z]{2}$/.test(region)) return region;
  } catch { /* fall through */ }
  return 'GB';
}

function validatePassword(p: string): string | null {
  if (p.length < 8)        return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(p))    return 'Password must contain an uppercase letter.';
  if (!/[0-9]/.test(p))    return 'Password must contain a number.';
  return null;
}

export default function RegisterScreen() {
  const { register } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [error, setError]         = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [countries, setCountries]     = useState<Country[]>([]);
  const [countryCode, setCountryCode] = useState<string>('GB');
  useEffect(() => {
    listCountries()
      .then((r) => {
        setCountries(r.countries || []);
        const region = detectRegion();
        if ((r.countries || []).some((c) => c.code === region)) setCountryCode(region);
      })
      .catch(() => { /* keep GB default; backend column default covers it */ });
  }, []);

  const canSubmit = useMemo(() => (
    !submitting
    && firstName.trim().length > 0
    && lastName.trim().length  > 0
    && email.trim().length     > 0
    && password.length         > 0
    && confirm.length          > 0
  ), [submitting, firstName, lastName, email, password, confirm]);

  async function handleSubmit() {
    if (!canSubmit) return;

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const { userId } = await register({
        email:       email.trim(),
        password,
        firstName:   firstName.trim(),
        lastName:    lastName.trim(),
        countryCode,
      });
      router.push({
        pathname: '/verify',
        params:   { purpose: 'register', userId: String(userId), email: email.trim() },
      });
    } catch (e) {
      setError(extractApiError(e, 'Sign up failed. Please try again.'));
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
        <Brand tagline="Create your account" />

        <Text style={authStyles.title}>Sign up</Text>
        <Text style={authStyles.subtitle}>It only takes a minute.</Text>

        {error ? (
          <View style={authStyles.errorBox}>
            <Text style={authStyles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={authStyles.inputWrap}>
          <Text style={authStyles.fieldLabel}>Country</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 4 }}
            contentContainerStyle={{ paddingVertical: 4, paddingRight: 4 }}
          >
            {countries.map((c) => {
              const selected = c.code === countryCode;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => setCountryCode(c.code)}
                  style={{
                    flexDirection: 'row',
                    alignItems:    'center',
                    paddingVertical:   8,
                    paddingHorizontal: 12,
                    marginRight: 8,
                    borderRadius: 999,
                    backgroundColor: selected ? colors.primary : 'rgba(255,255,255,0.06)',
                    borderWidth:     1,
                    borderColor:     selected ? colors.primary : 'rgba(255,255,255,0.12)',
                  }}
                >
                  <Text style={{ fontSize: 18, marginRight: 8 }}>{flagFor(c.code)}</Text>
                  <Text style={{
                    color:    selected ? '#fff' : colors.text,
                    fontWeight: selected ? '700' : '500',
                  }}>
                    {c.code} {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={authStyles.inputWrap}>
          <Text style={authStyles.fieldLabel}>First name</Text>
          <TextInput
            style={authStyles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Jane"
            placeholderTextColor={colors.textDim}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
            returnKeyType="next"
            editable={!submitting}
          />
        </View>

        <View style={authStyles.inputWrap}>
          <Text style={authStyles.fieldLabel}>Last name</Text>
          <TextInput
            style={authStyles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Doe"
            placeholderTextColor={colors.textDim}
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
            returnKeyType="next"
            editable={!submitting}
          />
        </View>

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
            placeholder="At least 8 chars, 1 uppercase, 1 number"
            placeholderTextColor={colors.textDim}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            editable={!submitting}
          />
        </View>

        <View style={authStyles.inputWrap}>
          <Text style={authStyles.fieldLabel}>Confirm password</Text>
          <PasswordInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter password"
            placeholderTextColor={colors.textDim}
            autoComplete="new-password"
            textContentType="newPassword"
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
            <Text style={authStyles.primaryBtnText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <View style={authStyles.linkRow}>
          <Pressable onPress={() => router.replace('/login')}>
            <Text style={authStyles.linkMuted}>
              Already have an account?{' '}
              <Text style={authStyles.linkAccent}>Sign in</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
