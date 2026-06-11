/**
 * tap.tsx — invisible link handler for https://<host>/tap (tapprove.io
 * and the legacy dander.io intent-filter host).
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
 *
 * Diagnostic console.log lines stay — they're cheap and useful for
 * remote debugging via `adb logcat -s ReactNativeJS` when chasing
 * App-Link wiring regressions.
 */

import { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { handleTapUrl } from '../src/services/nfcHandler';

export default function TapInterceptor() {
  const params = useLocalSearchParams<{ node?: string | string[]; business?: string | string[] }>();
  // Strict-mode / fast-refresh can mount this screen twice — guard so
  // the check-in POST never fires more than once per real tap.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // Log every param the OS delivered. Useful to confirm e.g.
    // that "node" arrived as "node-399454b3-5708-431d-841d-1dc5c4d31319"
    // rather than getting truncated by the URL parser.
    console.log('[tap] params:', JSON.stringify(params));

    // useLocalSearchParams returns string | string[]; normalise to string.
    const node = Array.isArray(params.node) ? params.node[0] : params.node;
    const business = Array.isArray(params.business) ? params.business[0] : params.business;

    if (node && business) {
      // Host here is irrelevant — parseTapUrl is host-agnostic. We use
      // the canonical tapprove.io for log clarity.
      const url =
        `https://tapprove.io/tap?node=${encodeURIComponent(String(node))}` +
        `&business=${encodeURIComponent(String(business))}`;
      console.log('[tap] reconstructed URL:', url);
      handleTapUrl(url).finally(() => router.replace('/'));
    } else {
      console.warn('[tap] node and/or business missing — skipping check-in');
      router.replace('/');
    }
  }, []);

  return null;
}
