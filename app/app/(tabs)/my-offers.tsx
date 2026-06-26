/**
 * (tabs)/my-offers.tsx — the customer's activated offers (Lidl-style), to apply
 * at the till. Native parity with the PWA My Offers. Refetches on focus so an
 * offer just activated elsewhere appears here. Activated offers auto-hide at
 * offer expiry (server filters).
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { colors } from '../../src/constants/colors';
import { getMyOffers, MyOffer } from '../../src/api/offers';

export default function MyOffersScreen() {
  const [offers, setOffers] = useState<MyOffer[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    getMyOffers()
      .then((list) => setOffers(Array.isArray(list) ? list : []))
      .catch(() => setError(true));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.screen}>
      <Text style={styles.h1}>My Offers</Text>
      <Text style={styles.sub}>Activated offers — show staff at the till to apply them.</Text>

      {error ? (
        <Text style={styles.error}>Couldn't load your offers.</Text>
      ) : offers === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
      ) : offers.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏷️</Text>
          <Text style={styles.emptyTitle}>No activated offers yet</Text>
          <Text style={styles.emptyBody}>Activate offers from Home or Offers and they'll appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push({ pathname: '/offer/[id]', params: { id: String(item.id) } })}
            >
              <Text style={styles.cardBiz} numberOfLines={1}>{item.business_name ?? 'Local business'}</Text>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.badge}>Activated ✓</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 64 : 36,
  },
  h1: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 16 },
  error: { color: colors.danger, fontSize: 14, marginTop: 24 },
  empty: { marginTop: 48, alignItems: 'center' },
  emptyIcon: { fontSize: 36 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 8 },
  emptyBody: { fontSize: 13, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardBiz: { fontSize: 12.5, color: colors.textMuted, fontWeight: '600' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 4 },
  badge: { fontSize: 13, fontWeight: '700', color: '#1f9d55', marginTop: 8 },
});
