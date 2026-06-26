/**
 * ActivateButton — the offer-attribution intent control for the native app.
 *
 * App users are always authenticated, so this is a straight toggle (no anon →
 * register journey, which is web-only): Activate → "Activated ✓". Displayed
 * state comes from the shared ActivatedOffersContext so every instance (offer
 * detail, cards, My Offers) stays in sync. App activations stamp channel/source
 * 'app'.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors } from '../constants/colors';
import { activateOffer, deactivateOffer } from '../api/offers';
import { useActivatedOffers } from '../context/ActivatedOffersContext';

export function ActivateButton({ offerId, style }: { offerId: number; style?: ViewStyle }) {
  const { isActivated, markActivated, markDeactivated } = useActivatedOffers();
  const activated = isActivated(offerId);
  const [busy, setBusy] = useState(false);

  async function onPress() {
    if (busy) return;
    setBusy(true);
    try {
      if (activated) {
        await deactivateOffer(offerId);
        markDeactivated(offerId);
      } else {
        await activateOffer(offerId, { channel: 'app', source: 'app' });
        markActivated(offerId);
      }
    } catch {
      /* leave state unchanged on failure */
    }
    setBusy(false);
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.btn, activated ? styles.on : styles.off, style]}
      accessibilityRole="button"
      accessibilityState={{ selected: activated, busy }}
    >
      {busy ? (
        <ActivityIndicator color={activated ? colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.txt, activated ? styles.txtOn : styles.txtOff]}>
          {activated ? 'Activated ✓' : 'Activate'}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  off: { backgroundColor: colors.primary },
  on:  { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  txt: { fontSize: 15, fontWeight: '700' },
  txtOff: { color: '#fff' },
  txtOn:  { color: colors.primary },
});
