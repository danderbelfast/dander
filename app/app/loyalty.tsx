/**
 * Loyalty screen — shows every business the user has loyalty data with,
 * rendered via the LoyaltyMeter component.
 *
 * Lives at /loyalty so the existing tabs / profile can route to it; for
 * now you can also reach it directly via deep-link dander://loyalty.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchUserBusinesses, UserBusinessLoyalty } from '../src/api/loyalty';
import { LoyaltyMeter } from '../src/components/LoyaltyMeter';

export default function LoyaltyScreen() {
  const [rows, setRows] = useState<UserBusinessLoyalty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserBusinesses()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Loyalty</Text>
        <Text style={styles.sub}>Every business you've checked into.</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#FF6B35" /></View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🪙</Text>
          <Text style={styles.emptyText}>Tap your phone at a Dander Node to start collecting.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.business_id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <LoyaltyMeter
              currentPoints={item.points}
              rewards={[]}                 /* fetched on demand from /rewards in a future iteration */
              businessName={item.name}
              tier={item.tier}
              streak={item.current_streak}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#0F1115' },
  header:   { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12 },
  title:    { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  sub:      { color: '#9AA4B1', marginTop: 4, fontSize: 14 },
  list:     { padding: 14 },
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 48 },
  emptyText:  { color: '#9AA4B1', marginTop: 12, textAlign: 'center', maxWidth: 320 },
});
