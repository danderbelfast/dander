/**
 * profile.tsx — minimal profile page reached from the avatar in the home
 * header. Shows the current user and a sign-out action. Lives outside the
 * (tabs) group so the bottom bar isn't shown here.
 */

import React from 'react';
import {
  Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { router } from 'expo-router';

import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/constants/colors';
import { ProfileAvatar } from '../src/components/ProfileAvatar';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        await logout();
        router.replace('/login');
      } },
    ]);
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scroll}
    >
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <View style={styles.heroBlock}>
        <ProfileAvatar
          firstName={user?.firstName}
          lastName={user?.lastName}
          email={user?.email}
          avatarUrl={user?.avatarUrl}
          size={88}
        />
        <Text style={styles.name}>
          {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Your account'}
        </Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <Text style={styles.notice}>
        Profile settings are coming soon. For now you can sign out below.
      </Text>

      <Pressable style={styles.signOutBtn} onPress={confirmSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: 20,
    paddingTop:    Platform.OS === 'ios' ? 64 : 36,
    paddingBottom: 32,
  },
  back: { paddingVertical: 4, marginBottom: 12 },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  heroBlock: { alignItems: 'center', marginTop: 12 },
  name:  { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 14 },
  email: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  notice: {
    fontSize: 13, color: colors.textMuted, marginTop: 32, textAlign: 'center',
  },
  signOutBtn: {
    marginTop: 24,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  signOutText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
