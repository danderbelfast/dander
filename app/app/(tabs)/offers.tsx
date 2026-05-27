/**
 * (tabs)/offers.tsx — full offers browse.
 *
 * Lists active offers from GET /api/offers, with a client-side search
 * (business name + offer title) and a type filter chip row. Each card
 * navigates to /offer/[id] for the claim flow.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { colors } from '../../src/constants/colors';
import { listOffers, Offer } from '../../src/api/offers';

type FilterKey = 'all' | 'percentage' | 'free_item' | 'promotion';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all',         label: 'All' },
  { key: 'percentage',  label: '% Off' },
  { key: 'free_item',   label: 'Freebie' },
  { key: 'promotion',   label: 'Promo' },
];

const TYPE_COLOURS: Record<string, string> = {
  percentage: '#008A05',
  free_item:  '#1F6FEB',
  promotion:  colors.primary,
  custom:     '#717171',
  clearance:  '#7A3CB8',
  bogo:       '#7A3CB8',
  fixed:      '#1F6FEB',
  deal:       colors.primary,
};

function typeColour(type: string | null): string {
  if (!type) return colors.textMuted;
  return TYPE_COLOURS[type.toLowerCase()] ?? colors.textMuted;
}

function expiryLabel(iso: string | null) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return { text: 'Expired', urgent: true };
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return { text: hours <= 1 ? 'Expires within the hour' : `Expires in ${hours}h`, urgent: true };
  const days = Math.floor(hours / 24);
  return { text: `Expires in ${days} day${days === 1 ? '' : 's'}`, urgent: false };
}

export default function OffersScreen() {
  const [offers,   setOffers]   = useState<Offer[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query,    setQuery]    = useState('');
  const [filter,   setFilter]   = useState<FilterKey>('all');

  const load = useCallback(async () => {
    try {
      const data = await listOffers({ limit: 50, status: 'active' });
      setOffers(data);
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return offers.filter((o) => {
      if (filter !== 'all' && (o.offer_type ?? '').toLowerCase() !== filter) return false;
      if (!q) return true;
      const hay = `${o.title} ${o.business_name ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [offers, query, filter]);

  function header() {
    return (
      <View>
        <Text style={styles.title}>Offers</Text>
        <View style={styles.search}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search businesses or offers"
            placeholderTextColor={colors.textDim}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>
        <View style={styles.chipsRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  if (loading && offers.length === 0) {
    return (
      <View style={styles.screen}>
        {header()}
        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      ListHeaderComponent={header()}
      data={filtered}
      keyExtractor={(o) => String(o.id)}
      renderItem={({ item }) => <OfferRow offer={item} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListEmptyComponent={
        <Text style={styles.empty}>
          {query || filter !== 'all'
            ? 'No offers match your search'
            : 'No offers right now — check back soon'}
        </Text>
      }
    />
  );
}

function OfferRow({ offer }: { offer: Offer }) {
  const expiry = expiryLabel(offer.expires_at);
  const remaining = offer.max_redemptions != null
    ? `${offer.current_redemptions ?? 0} of ${offer.max_redemptions} claimed`
    : null;
  const tint = typeColour(offer.offer_type);
  const typeLabel = offerTypeLabel(offer.offer_type);

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push({ pathname: '/offer/[id]', params: { id: String(offer.id) } })}
    >
      <View style={styles.cardHead}>
        <Text style={styles.business} numberOfLines={1}>
          {offer.business_name ?? 'Local business'}
          {offer.business_category ? `  ·  ${offer.business_category}` : ''}
        </Text>
        {typeLabel ? (
          <View style={[styles.typeBadge, { backgroundColor: tint }]}>
            <Text style={styles.typeBadgeText}>{typeLabel}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.offerTitle}>{offer.title}</Text>
      {offer.description ? (
        <Text style={styles.offerDesc} numberOfLines={2}>{offer.description}</Text>
      ) : null}

      <View style={styles.metaRow}>
        {offer.discount_percent != null ? (
          <Text style={[styles.meta, { color: tint, fontWeight: '700' }]}>
            {Math.round(Number(offer.discount_percent))}% off
          </Text>
        ) : null}
        {expiry ? (
          <Text style={[styles.meta, expiry.urgent && styles.metaUrgent]}>{expiry.text}</Text>
        ) : null}
        {remaining ? <Text style={styles.meta}>{remaining}</Text> : null}
      </View>

      <Pressable
        style={styles.claimBtn}
        onPress={() => router.push({ pathname: '/offer/[id]', params: { id: String(offer.id) } })}
      >
        <Text style={styles.claimBtnText}>Claim Offer</Text>
      </Pressable>
    </Pressable>
  );
}

function offerTypeLabel(type: string | null): string | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t === 'percentage') return '% Off';
  if (t === 'free_item')  return 'Freebie';
  if (t === 'promotion')  return 'Promo';
  if (t === 'clearance')  return 'Clearance';
  if (t === 'bogo')       return 'BOGO';
  if (t === 'fixed')      return 'Fixed';
  if (t === 'custom')     return 'Custom';
  return 'Deal';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: {
    paddingHorizontal: 20,
    paddingTop:    Platform.OS === 'ios' ? 64 : 36,
    paddingBottom: 32,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  search: { marginTop: 14 },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: colors.text,
  },
  chipsRow: { flexDirection: 'row', marginTop: 12, marginBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  chipActive:     { backgroundColor: colors.primaryDim, borderColor: colors.primary },
  chipText:       { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 32 },
  card: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  business: { flex: 1, fontSize: 13, color: colors.textMuted, fontWeight: '600', marginRight: 8 },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  typeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  offerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  offerDesc:  { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  meta: { fontSize: 12, color: colors.textMuted, marginRight: 12, marginTop: 2 },
  metaUrgent: { color: colors.danger, fontWeight: '700' },
  claimBtn: {
    marginTop: 14,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  claimBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
