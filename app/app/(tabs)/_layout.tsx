/**
 * (tabs)/_layout.tsx — bottom tab bar for the authenticated app.
 *
 * Four tabs: Home, Offers, Leaderboard, My Offers. Scan, Rewards, and
 * Challenges are kept as routes but hidden from the bar (href: null) — the
 * route files' deletion is the separate redundant-code-audit task.
 *
 * Auth guard lives here: if the user isn't signed in, redirect to /login.
 * If still bootstrapping the session, show a splash.
 */

import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/constants/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(filled: IconName, outline: IconName) {
  return ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
    <Ionicons name={focused ? filled : outline} size={size} color={color} />
  );
}

export default function TabsLayout() {
  const { isAuth, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!isAuth) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown:             false,
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor:  colors.border,
          paddingTop:      6,
          height:          Platform.OS === 'ios' ? 84 : 64,
        },
        tabBarLabelStyle: {
          fontSize:   11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="offers"
        options={{ title: 'Offers', tabBarIcon: tabIcon('pricetag', 'pricetag-outline') }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{ title: 'Leaderboard', tabBarIcon: tabIcon('trophy', 'trophy-outline') }}
      />
      <Tabs.Screen
        name="my-offers"
        options={{ title: 'My Offers', tabBarIcon: tabIcon('pricetags', 'pricetags-outline') }}
      />

      {/* Hidden from the bar (nav removal, Plan 4) — routes kept; file deletion
          is the separate redundant-code-audit task. */}
      <Tabs.Screen name="scan"       options={{ href: null }} />
      <Tabs.Screen name="rewards"    options={{ href: null }} />
      <Tabs.Screen name="challenges" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
