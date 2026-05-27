/**
 * my-coupons.tsx — the user's coupons in three tabs: Active, Redeemed,
 * Expired. The backend already groups them by status; we just render.
 *
 * Lives outside the (tabs) group so it doesn't show the bottom bar — it's
 * reached from the Profile screen.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { colors } from '../src/constants/colors';
import { Coupon, CouponStatus, listMyCoupons } from '../src/api/coupons';

const TABS: Array<{ key: CouponStatus; label: string }> = [
  { key: 'active',   label: 'Active' },
  { key: 'redeemed', label: 'Redeemed' },
  { key: 'expired',  label: 'Expired' },
];

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

export default function MyCouponsScreen() {
  const [active,   setActive]   = useState<Coupon[]>([]);
  const [redeemed, setRedeemed] = useState<Coupon[]>([]);
  const [expired,  setExpired]  = useState<Coupon[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<CouponStatus>('active');

  const load = useCallback(async () => {
    try {
      const data = await listMyCoupons();
      setActive(data.active ?? []);
      setRedeemed(data.redeemed ?? []);
      setExpired(data.expired ?? []);
    } catch {
      setActive([]); setRedeemed([]); setExpired([]);
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

  const visible = useMemo(() => {
    if (tab === 'active')   return active;
    if (tab === 'redeemed') return redeemed;
    return expired;
  }, [tab, active, redeemed, expired]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>My coupons</Text>

      <View style={styles.tabs}>
        {TABS.map((t) => {
          const count = t.key === 'active' ? active.length : t.key === 'redeemed' ? redeemed.length : expired.length;
          const isActive = tab === t.key;
          return (
            <Pressable
              key={t.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {t.label}{count > 0 ? ` (${count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
      ) : visible.length === 0 ? (
        <Text style={styles.empty}>
          {tab === 'active'
            ? 'No active coupons — claim one from the Offers tab.'
            : tab === 'redeemed'
            ? 'No redeemed coupons yet.'
            : 'No expired coupons.'}
        </Text>
      ) : (
        visible.map((c) => (
          <Pressable
            key={c.id}
            style={styles.row}
            onPress={() => router.push({ pathname: '/coupon/[id]', params: { id: String(c.id) } })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.business} numberOfLines={1}>{c.business_name ?? 'Business'}</Text>
              <Text style={styles.offer} numberOfLines={1}>{c.offer_title ?? ''}</Text>
              <Text style={styles.meta}>
                {c.status === 'redeemed' && c.redeemed_at
                  ? `Redeemed ${fmtDate(c.redeemed_at)}`
                  : c.status === 'expired'
                  ? 'Expired'
                  : `Code ${c.code}`}
              </Text>
            </View>
            <View style={[styles.badge, badgeStyle(c.status)]}>
              <Text style={[styles.badgeText, badgeTextStyle(c.status)]}>{c.status}</Text>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function badgeStyle(status: string) {
  if (status === 'redeemed') return { backgroundColor: colors.primaryDim };
  if (status === 'expired')  return { backgroundColor: '#FBE9E7' };
  return { backgroundColor: '#E6F4EA' };
}

function badgeTextStyle(status: string) {
  if (status === 'redeemed') return { color: colors.primary };
  if (status === 'expired')  return { color: colors.danger };
  return { color: '#008A05' };
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
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  tabs: { flexDirection: 'row', marginTop: 16, marginBottom: 4 },
  tab: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, marginRight: 8,
  },
  tabActive: { backgroundColor: colors.primaryDim, borderColor: colors.primary },
  tabText:   { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  business: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  offer:    { fontSize: 15, color: colors.text, fontWeight: '700', marginTop: 2 },
  meta:     { fontSize: 12, color: colors.textDim, marginTop: 4 },
  badge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
