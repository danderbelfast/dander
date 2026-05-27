/**
 * (tabs)/_layout.tsx — bottom tab bar for the authenticated app.
 *
 * Six tabs: Home, Offers, Scan, Leaderboard, Rewards, Challenges. The Scan
 * tab intercepts its press to show a "Coming soon" alert rather than
 * actually navigating to that screen.
 *
 * Auth guard lives here: if the user isn't signed in, redirect to /login.
 * If still bootstrapping the session, show a splash.
 */

import React from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';
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
        name="scan"
        options={{ title: 'Scan', tabBarIcon: tabIcon('qr-code', 'qr-code-outline') }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            Alert.alert('Coming soon', 'QR scanning is on the way.');
          },
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{ title: 'Leaderboard', tabBarIcon: tabIcon('trophy', 'trophy-outline') }}
      />
      <Tabs.Screen
        name="rewards"
        options={{ title: 'Rewards', tabBarIcon: tabIcon('gift', 'gift-outline') }}
      />
      <Tabs.Screen
        name="challenges"
        options={{ title: 'Challenges', tabBarIcon: tabIcon('flag', 'flag-outline') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
