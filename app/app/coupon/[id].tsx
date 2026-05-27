/**
 * coupon/[id].tsx — the QR screen the shopper shows at the till.
 *
 * Polls GET /api/coupons/:id/qr every 5 seconds while the coupon is
 * active. When the backend flips status to 'redeemed' we stop polling,
 * fire haptic + sound feedback, and show a success overlay.
 *
 * Tapping the QR opens a fullscreen view for easier scanning.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

import { colors } from '../../src/constants/colors';
import { getCouponQr, Coupon } from '../../src/api/coupons';
import { hapticSuccess } from '../../src/services/haptics';
import { soundRedemptionSuccess } from '../../src/services/sounds';
import { extractApiError } from '../../src/api/errors';

const POLL_MS = 5_000;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    active:   { bg: '#E6F4EA', fg: '#008A05', label: 'Active' },
    redeemed: { bg: colors.primaryDim, fg: colors.primary, label: 'Redeemed' },
    expired:  { bg: '#FBE9E7', fg: colors.danger, label: 'Expired' },
  };
  const m = map[status] ?? { bg: colors.border, fg: colors.textMuted, label: status };
  return (
    <View style={[styles.statusBadge, { backgroundColor: m.bg }]}>
      <Text style={[styles.statusBadgeText, { color: m.fg }]}>{m.label}</Text>
    </View>
  );
}

export default function CouponScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const couponId = Number(id);

  const [coupon, setCoupon]     = useState<Coupon | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const previousStatus = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(async (initial = false) => {
    try {
      const c = await getCouponQr(couponId);
      setCoupon(c);
      if (initial) setLoading(false);
      if (previousStatus.current && previousStatus.current !== 'redeemed' && c.status === 'redeemed') {
        hapticSuccess();
        soundRedemptionSuccess();
        setShowCelebration(true);
      }
      previousStatus.current = c.status;
    } catch (e) {
      if (initial) {
        setError(extractApiError(e, 'Could not load coupon.'));
        setLoading(false);
      }
    }
  }, [couponId]);

  useEffect(() => {
    if (!Number.isFinite(couponId)) {
      setError('Invalid coupon.');
      setLoading(false);
      return;
    }
    void tick(true);
  }, [couponId, tick]);

  // Poll while active.
  useEffect(() => {
    const stop = () => {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
    };
    if (coupon?.status === 'active') {
      timer.current = setInterval(() => { void tick(); }, POLL_MS);
    } else {
      stop();
    }
    return stop;
  }, [coupon?.status, tick]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.heading}>Your coupon</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : !coupon ? (
        <Text style={styles.error}>Coupon not found.</Text>
      ) : (
        <>
          <Text style={styles.business}>{coupon.business_name ?? ''}</Text>
          <Text style={styles.offer}>{coupon.offer_title ?? ''}</Text>

          <Pressable
            onPress={() => setFullscreen(true)}
            style={styles.qrBox}
            accessibilityRole="button"
            accessibilityLabel="Show QR fullscreen"
          >
            <QRCode value={coupon.qr_token || coupon.code} size={220} />
          </Pressable>

          <Text style={styles.code}>{coupon.code}</Text>
          <Text style={styles.codeHint}>Show this to staff if the scanner can&apos;t read your QR.</Text>

          <View style={{ alignItems: 'center', marginTop: 18 }}>
            <StatusBadge status={coupon.status} />
          </View>

          {showCelebration ? (
            <View style={styles.celebration}>
              <Text style={styles.celebrationEmoji}>🎉</Text>
              <Text style={styles.celebrationText}>Redeemed!</Text>
              <Text style={styles.celebrationSub}>Points coming your way</Text>
              <Pressable
                style={styles.celebrationBtn}
                onPress={() => setShowCelebration(false)}
              >
                <Text style={styles.celebrationBtnText}>Got it</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      <Modal
        visible={fullscreen}
        animationType="fade"
        onRequestClose={() => setFullscreen(false)}
        transparent={false}
      >
        <Pressable style={styles.fullscreen} onPress={() => setFullscreen(false)}>
          {coupon ? (
            <>
              <QRCode value={coupon.qr_token || coupon.code} size={320} />
              <Text style={styles.fullscreenCode}>{coupon.code}</Text>
              <Text style={styles.fullscreenHint}>Tap anywhere to close</Text>
            </>
          ) : null}
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    paddingHorizontal: 20,
    paddingTop:    Platform.OS === 'ios' ? 64 : 36,
    paddingBottom: 40,
    alignItems: 'center',
  },
  back: { paddingVertical: 4, marginBottom: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  heading: { fontSize: 14, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  business: { fontSize: 14, color: colors.textMuted, fontWeight: '600', marginTop: 16 },
  offer:    { fontSize: 20, color: colors.text, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  qrBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 16,
  },
  code: {
    marginTop: 18,
    fontSize: 28,
    letterSpacing: 4,
    fontWeight: '800',
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  codeHint: { fontSize: 11, color: colors.textDim, marginTop: 4, textAlign: 'center' },
  statusBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  statusBadgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  error: { color: colors.danger, fontSize: 14, marginTop: 24, textAlign: 'center' },
  celebration: {
    marginTop: 28,
    backgroundColor: colors.primaryDim,
    paddingVertical: 24,
    paddingHorizontal: 28,
    borderRadius: 18,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  celebrationEmoji: { fontSize: 48 },
  celebrationText:  { fontSize: 22, fontWeight: '800', color: colors.primary, marginTop: 8 },
  celebrationSub:   { fontSize: 13, color: colors.text, marginTop: 4 },
  celebrationBtn:   {
    marginTop: 16, paddingHorizontal: 18, paddingVertical: 10,
    backgroundColor: colors.primary, borderRadius: 999,
  },
  celebrationBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  fullscreen: {
    flex: 1, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  fullscreenCode: {
    marginTop: 24,
    fontSize: 32, letterSpacing: 5, fontWeight: '800',
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  fullscreenHint: { marginTop: 14, fontSize: 12, color: colors.textDim },
});
