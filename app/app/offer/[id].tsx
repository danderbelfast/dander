/**
 * offer/[id].tsx — offer detail (view-only).
 *
 * Fetches the offer from GET /api/offers/:id. Offers are redeemed in
 * person at the till (staff apply the discount); there is no in-app
 * claim/coupon flow.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { colors } from '../../src/constants/colors';
import { getOfferById, Offer } from '../../src/api/offers';
import { extractApiError } from '../../src/api/errors';

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

function expiryMs(offer: Offer | null) {
  if (!offer?.expires_at) return null;
  return new Date(offer.expires_at).getTime() - Date.now();
}

function expiryLabel(offer: Offer | null) {
  const ms = expiryMs(offer);
  if (ms == null) return 'No expiry';
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return hours <= 1 ? 'Expires within the hour' : `Expires in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}

export default function OfferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const offerId = Number(id);

  const [offer, setOffer]     = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(offerId)) {
      setError('Invalid offer.');
      setLoading(false);
      return;
    }
    try {
      const o = await getOfferById(offerId);
      setOffer(o);
    } catch (e) {
      setError(extractApiError(e, 'Could not load offer.'));
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  useEffect(() => { void load(); }, [load]);

  const tint = TYPE_COLOURS[(offer?.offer_type ?? '').toLowerCase()] ?? colors.primary;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : !offer ? (
        <Text style={styles.error}>Offer not found.</Text>
      ) : (
        <>
          <Text style={styles.business}>
            {offer.business_name ?? 'Local business'}
            {offer.business_category ? `  ·  ${offer.business_category}` : ''}
          </Text>

          <Text style={styles.title}>{offer.title}</Text>

          {offer.description ? (
            <Text style={styles.desc}>{offer.description}</Text>
          ) : null}

          <View style={styles.metaCard}>
            {offer.discount_percent != null ? (
              <Text style={[styles.metaPrimary, { color: tint }]}>
                {Math.round(Number(offer.discount_percent))}% off
              </Text>
            ) : null}
            <Text style={styles.meta}>{expiryLabel(offer)}</Text>
          </View>

          {offer.terms ? (
            <>
              <Text style={styles.sectionTitle}>Terms</Text>
              <Text style={styles.terms}>{offer.terms}</Text>
            </>
          ) : null}

          <View style={styles.redeemCard}>
            <Text style={styles.redeemTitle}>🏪 Redeem in store</Text>
            <Text style={styles.redeemBody}>
              Visit {offer.business_name ?? 'this business'} and ask staff for this offer at the till — they'll apply the discount in person.
            </Text>
            <Text style={styles.redeemNote}>
              Tap in with TapProve to earn loyalty points on your spend.
            </Text>
          </View>
        </>
      )}
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
  back: { paddingVertical: 4, marginBottom: 8 },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  business: { fontSize: 13, color: colors.textMuted, fontWeight: '600', marginTop: 6 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 4, letterSpacing: -0.5 },
  desc:  { fontSize: 15, color: colors.text, marginTop: 12, lineHeight: 22 },
  metaCard: {
    marginTop: 18,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
  },
  metaPrimary: { fontSize: 22, fontWeight: '800' },
  meta:        { fontSize: 13, color: colors.textMuted, marginTop: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 24 },
  terms: { fontSize: 13, color: colors.textMuted, marginTop: 6, lineHeight: 19 },
  redeemCard: {
    marginTop: 32,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
  },
  redeemTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  redeemBody:  { fontSize: 14, color: colors.text, marginTop: 6, lineHeight: 20 },
  redeemNote:  { fontSize: 12.5, color: colors.textMuted, marginTop: 8 },
  error: { color: colors.danger, fontSize: 14, marginTop: 24, textAlign: 'center' },
});
