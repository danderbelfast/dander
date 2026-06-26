/**
 * profile.tsx — account hub.
 *
 * Reached from the avatar in the home header. Lives outside the (tabs)
 * group so the bottom bar isn't shown here.
 *
 * Contents:
 *   • avatar + display name + email
 *   • lifetime stats card (points, steps, coupons redeemed)
 *   • tier progress bar
 *   • settings stubs (notifications, privacy, help, terms)
 *   • account actions: My Coupons, Sign out, Copy JWT (dev only)
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';

import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/constants/colors';
import { ProfileAvatar } from '../src/components/ProfileAvatar';
import { ProgressBar } from '../src/components/ProgressBar';
import { usePoints } from '../src/hooks/usePoints';
import { listMyCoupons } from '../src/api/coupons';
import { hapticLight } from '../src/services/haptics';

const TOKEN_KEY = 'dander_access_token';

const TIER_THRESHOLDS: Record<string, number> = {
  bronze: 0,
  silver: 50,
  gold: 150,
  platinum: 500,
};

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return Number(n).toLocaleString();
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { loyalty } = usePoints();
  const [redeemedCount, setRedeemedCount] = useState<number | null>(null);

  const loadCounts = useCallback(async () => {
    try {
      const data = await listMyCoupons();
      setRedeemedCount(data.redeemed?.length ?? 0);
    } catch {
      setRedeemedCount(null);
    }
  }, []);

  useEffect(() => { void loadCounts(); }, [loadCounts]);

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        await logout();
        router.replace('/login');
      } },
    ]);
  }

  async function copyToken() {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) {
        Alert.alert('No token', 'No JWT in storage — try signing in again.');
        return;
      }
      await Clipboard.setStringAsync(token);
      Alert.alert('Copied', 'JWT copied to clipboard.');
    } catch {
      Alert.alert('Copy failed', 'Could not read or copy the token.');
    }
  }

  function stub(label: string) {
    return () => {
      hapticLight();
      Alert.alert(label, 'Coming soon.');
    };
  }

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Your account';

  const tier = (loyalty?.tier ?? 'bronze') as keyof typeof TIER_THRESHOLDS;
  const nextTier   = loyalty?.next_tier ?? null;
  const remaining  = loyalty?.next_tier_points_needed ?? 0;
  const lifetime   = loyalty?.lifetime_points ?? 0;
  const currentThreshold = TIER_THRESHOLDS[tier] ?? 0;
  const nextThreshold    = nextTier ? TIER_THRESHOLDS[nextTier] ?? currentThreshold : currentThreshold;
  const tierProgress = nextTier
    ? Math.max(0, lifetime - currentThreshold)
    : 1;
  const tierTarget = nextTier
    ? Math.max(1, nextThreshold - currentThreshold)
    : 1;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
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
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      {/* Stats card */}
      <View style={styles.statsCard}>
        <Stat label="Points" value={fmt(loyalty?.lifetime_points ?? 0)} />
        <Stat label="Steps"  value={fmt(loyalty?.steps_all_time ?? 0)} />
        <Stat label="Coupons" value={redeemedCount == null ? '—' : String(redeemedCount)} />
      </View>

      {/* Tier progress */}
      <View style={styles.tierCard}>
        <View style={styles.tierHead}>
          <Text style={styles.tierTitle}>{titleCase(tier)} tier</Text>
          {nextTier ? (
            <Text style={styles.tierSub}>{remaining} pts to {titleCase(nextTier)}</Text>
          ) : (
            <Text style={styles.tierSub}>You&apos;ve hit the top tier 🏆</Text>
          )}
        </View>
        <ProgressBar progress={tierProgress} target={tierTarget} />
      </View>

      {/* Settings */}
      <Text style={styles.sectionTitle}>Settings</Text>
      <Row label="Notification preferences" onPress={stub('Notifications')} />
      <Row label="Privacy"                  onPress={() => router.push('/settings/privacy')} />
      <Row label="Help & support"           onPress={stub('Help')} />
      <Row label="Terms & privacy policy"   onPress={stub('Legal')} />

      <Pressable style={styles.signOutBtn} onPress={confirmSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      {/* Temporary dev tool — remove before production launch. */}
      <Pressable style={styles.devBtn} onPress={copyToken} hitSlop={6}>
        <Text style={styles.devBtnText}>Copy JWT (dev only)</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
}

function titleCase(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: 20,
    paddingTop:    Platform.OS === 'ios' ? 64 : 36,
    paddingBottom: 32,
  },
  back: { paddingVertical: 4, marginBottom: 4 },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  heroBlock: { alignItems: 'center', marginTop: 8 },
  name:  { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 14 },
  email: { fontSize: 14, color: colors.textMuted, marginTop: 4 },

  statsCard: {
    marginTop: 24,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },

  tierCard: {
    marginTop: 16,
    padding: 16,
    borderWidth: 1, borderColor: colors.border, borderRadius: 14,
  },
  tierHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  tierTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  tierSub:   { fontSize: 12, color: colors.textMuted },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 28, marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowLabel:   { fontSize: 15, color: colors.text, fontWeight: '500' },
  rowChevron: { fontSize: 22, color: colors.textDim, fontWeight: '500' },

  signOutBtn: {
    marginTop: 24,
    borderWidth: 1, borderColor: colors.danger, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  signOutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },

  devBtn: { marginTop: 16, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  devBtnText: {
    color: colors.textMuted, fontSize: 12, fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
