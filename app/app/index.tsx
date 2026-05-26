/**
 * index.tsx — root route. Acts as the auth gate: redirects unauthenticated
 * users to /login and shows a minimal logged-in landing screen otherwise.
 * The real home dashboard will replace the body here.
 */

import React from 'react';
import {
  ActivityIndicator, Alert, Text, TouchableOpacity, View, StyleSheet, Platform,
} from 'react-native';
import { Redirect } from 'expo-router';

import { useAuth } from '../src/context/AuthContext';
import { Brand } from '../src/components/Brand';
import { colors } from '../src/constants/colors';

export default function Index() {
  const { user, isAuth, loading, logout } = useAuth();

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!isAuth) {
    return <Redirect href="/login" />;
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { logout(); } },
    ]);
  }

  const displayName = user?.firstName || user?.email || 'there';

  return (
    <View style={styles.home}>
      <Brand />
      <Text style={styles.welcome}>Welcome, {displayName}!</Text>
      <Text style={styles.placeholder}>The home dashboard will live here.</Text>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.85}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  home: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
    paddingTop:    Platform.OS === 'ios' ? 80 : 56,
    paddingBottom: 32,
    alignItems: 'center',
  },
  welcome: {
    fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 8,
  },
  placeholder: {
    fontSize: 14, color: colors.textMuted, marginTop: 6, textAlign: 'center',
  },
  signOutBtn: {
    marginTop: 'auto',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  signOutText: {
    color: colors.text, fontSize: 15, fontWeight: '600',
  },
});
