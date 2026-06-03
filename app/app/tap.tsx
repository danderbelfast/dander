/**
 * tap.tsx — invisible link handler for https://dander.io/tap.
 *
 * Expo-router automatically routes deep-link URLs to a matching screen.
 * If we left this file out, every NFC tap landed on "Unmatched Route".
 * With this route in place, the URL is captured here, the check-in is
 * fired, and we immediately `router.replace('/')` so the user never
 * sees a visible /tap screen — the NfcCheckInScreen overlay mounted at
 * root handles all the UI from a Modal above the stack.
 *
 * In effect this IS the App-Link-level intercept: nothing renders here,
 * navigation never settles on /tap, and the home screen reappears
 * underneath the coins animation.
 */

import { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { handleTapUrl } from '../src/services/nfcHandler';

export default function TapInterceptor() {
  const { node, business } = useLocalSearchParams<{ node?: string; business?: string }>();
  // Strict-mode / fast-refresh can mount this screen twice — guard so
  // the check-in POST never fires more than once per real tap.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (node && business) {
      const url =
        `https://dander.io/tap?node=${encodeURIComponent(String(node))}` +
        `&business=${encodeURIComponent(String(business))}`;
      handleTapUrl(url).finally(() => router.replace('/'));
    } else {
      router.replace('/');
    }
  }, [node, business]);

  return null;
}
