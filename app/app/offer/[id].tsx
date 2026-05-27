/**
 * offer/[id].tsx — offer detail + claim flow.
 *
 * Fetches the offer from GET /api/offers/:id and POSTs to
 * /api/coupons/generate to claim. On success we route the user straight
 * to the QR coupon screen so they can show it at the till.
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
import { router, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

import { colors } from '../../src/constants/colors';
import { getOfferById, Offer } from '../../src/api/offers';
import { claimCoupon, listMyCoupons } from '../../src/api/coupons';
import { extractApiError } from '../../src/api/errors';
import { hapticSuccess, hapticError } from '../../src/services/haptics';
import { soundOfferClaimed } from '../../src/services/sounds';

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

  const [offer, setOffer]           = useState<Offer | null>(null);
  const [loading, setLoading]       = useState(true);
  const [claiming, setClaiming]     = useState(false);
  const [existingCouponId, setExistingCouponId] = useState<number | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(offerId)) {
      setError('Invalid offer.');
      setLoading(false);
      return;
    }
    try {
      const [o, coupons] = await Promise.all([
        getOfferById(offerId),
        listMyCoupons().catch(() => null),
      ]);
      setOffer(o);
      if (coupons) {
        const own = [...coupons.active, ...coupons.redeemed, ...coupons.expired]
          .find((c) => c.offer_id === offerId);
        setExistingCouponId(own?.id ?? null);
      }
    } catch (e) {
      setError(extractApiError(e, 'Could not load offer.'));
    } finally {
      setLoading(false);
    }
  }, [offerId]);

  useEffect(() => { void load(); }, [load]);

  async function handleClaim() {
    if (claiming || !offer) return;
    setClaiming(true);
    try {
      const result = await claimCoupon(offer.id);
      const newId = result.couponId ?? result.coupon?.id;
      hapticSuccess();
      soundOfferClaimed();
      if (newId) {
        router.replace({ pathname: '/coupon/[id]', params: { id: String(newId) } });
      } else {
        // Backend didn't return an id — fall back to refreshing & switching
        // to the existing-coupon flow on the next render.
        void load();
      }
    } catch (e) {
      hapticError();
      if (axios.isAxiosError(e) && e.response?.data) {
        const data = e.response.data as { code?: string; message?: string };
        if (data.code === 'COUPON_EXISTS') {
          Alert.alert('Already claimed', 'You\'ve already claimed this offer.', [
            { text: 'View coupon', onPress: () => void load() },
          ]);
          return;
        }
        Alert.alert('Could not claim', data.message ?? 'Please try again in a moment.');
      } else {
        Alert.alert('Could not claim', extractApiError(e, 'Please try again in a moment.'));
      }
    } finally {
      setClaiming(false);
    }
  }

  const tint     = TYPE_COLOURS[(offer?.offer_type ?? '').toLowerCase()] ?? colors.primary;
  const ms       = expiryMs(offer);
  const expired  = ms != null && ms <= 0;
  const soldOut  = offer?.max_redemptions != null
    ? (offer.current_redemptions ?? 0) >= offer.max_redemptions
    : false;
  const unavailable = expired || soldOut || (offer && offer.is_active === false);

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
            {offer.max_redemptions != null ? (
              <Text style={styles.meta}>
                {Math.max(0, offer.max_redemptions - (offer.current_redemptions ?? 0))} remaining of {offer.max_redemptions}
              </Text>
            ) : null}
          </View>

          {offer.terms ? (
            <>
              <Text style={styles.sectionTitle}>Terms</Text>
              <Text style={styles.terms}>{offer.terms}</Text>
            </>
          ) : null}

          <View style={{ marginTop: 32 }}>
            {existingCouponId ? (
              <Pressable
                style={styles.primaryBtn}
                onPress={() => router.push({ pathname: '/coupon/[id]', params: { id: String(existingCouponId) } })}
              >
                <Text style={styles.primaryBtnText}>View My Coupon</Text>
              </Pressable>
            ) : unavailable ? (
              <View style={[styles.primaryBtn, styles.primaryBtnDisabled]}>
                <Text style={styles.primaryBtnText}>
                  {expired ? 'Offer no longer available' : 'Fully redeemed'}
                </Text>
              </View>
            ) : (
              <Pressable
                style={[styles.primaryBtn, claiming && styles.primaryBtnDisabled]}
                disabled={claiming}
                onPress={handleClaim}
              >
                {claiming ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.primaryBtnText}>Claim Offer</Text>
                )}
              </Pressable>
            )}
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
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6, backgroundColor: colors.border },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14, marginTop: 24, textAlign: 'center' },
});
