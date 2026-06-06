/**
 * till.tsx — invisible link handler for https://dander.io/till.
 *
 * Mirror of tap.tsx: the customer taps the till NFC sticker, Android
 * opens this URL via App Links, expo-router routes to this file, we
 * POST /api/proximity/till-arrive to push the customer profile to the
 * staff dashboard, and immediately `router.replace('/')` so nothing
 * visible lands here. NO points are awarded by the till-arrive call —
 * those arrive later via the points_awarded WebSocket event once
 * staff has typed the amount and pressed Award. The coins overlay
 * fires from that event, not from this route.
 */

import { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { handleTillUrl } from '../src/services/nfcHandler';

export default function TillInterceptor() {
  const params = useLocalSearchParams<{ business?: string | string[] }>();
  // Strict-mode / fast-refresh can mount this screen twice — guard so
  // the POST never fires more than once per real tap.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    console.log('[till] params:', JSON.stringify(params));

    const business = Array.isArray(params.business) ? params.business[0] : params.business;

    if (business) {
      const url = `https://dander.io/till?business=${encodeURIComponent(String(business))}`;
      console.log('[till] reconstructed URL:', url);
      handleTillUrl(url).finally(() => router.replace('/'));
    } else {
      console.warn('[till] business param missing — skipping till-arrive');
      router.replace('/');
    }
  }, []);

  return null;
}
