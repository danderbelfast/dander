/**
 * OfferCard — horizontal-scroll card used on the home dashboard.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../constants/colors';
import { Offer } from '../api/offers';
import { ActivateButton } from './ActivateButton';
import { ShareSheet } from './ShareSheet';

interface Props {
  offer:    Offer;
  onPress?: () => void;
}

function offerTypeBadge(type: string | null): { label: string; tint: string } | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes('free'))    return { label: 'Freebie',  tint: '#008A05' };
  if (t.includes('urgency')) return { label: 'Hurry',    tint: '#C13515' };
  if (t.includes('clear'))   return { label: 'Clearance', tint: '#7A3CB8' };
  if (t.includes('promo'))   return { label: 'Promo',    tint: colors.primary };
  return { label: 'Deal', tint: colors.primary };
}

export function OfferCard({ offer, onPress }: Props) {
  const badge = offerTypeBadge(offer.offer_type);
  const [shareOpen, setShareOpen] = useState(false);
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.business} numberOfLines={1}>
          {offer.business_name ?? 'Local business'}
        </Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: badge.tint }]}>
            <Text style={styles.badgeText}>{badge.label}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>{offer.title}</Text>
      <Text style={styles.nearby}>Nearby</Text>
      <View style={styles.actions}>
        <ActivateButton offerId={offer.id} style={styles.activate} />
        <Pressable onPress={() => setShareOpen(true)} hitSlop={8} style={styles.share} accessibilityRole="button" accessibilityLabel="Share">
          <Text style={styles.shareTxt}>Share</Text>
        </Pressable>
      </View>
      <ShareSheet
        offerId={offer.id}
        title={offer.title}
        text={`Check out this deal: ${offer.title} at ${offer.business_name ?? 'a local business'}`}
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginRight: 10,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  business: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    minHeight: 40,
  },
  nearby: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textDim,
    fontWeight: '500',
  },
  actions: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activate: { flex: 1, paddingVertical: 8, minHeight: 36 },
  share: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareTxt: { fontSize: 13, fontWeight: '700', color: colors.text },
});
