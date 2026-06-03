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
 *
 * NOTE: this file is currently in DEBUG mode for factory testing —
 * params are logged and shown via Alert so a hardware tap test can
 * confirm what the OS delivered. Remove the Alert + log lines once
 * the tap flow is verified end-to-end on real devices.
 */

import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
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

    // DEBUG — log every param the OS delivered. Useful to confirm e.g.
    // that "node" arrived as "node-399454b3-5708-431d-841d-1dc5c4d31319"
    // rather than getting truncated by the URL parser.
    console.log('[tap] params:', JSON.stringify(params));

    // useLocalSearchParams returns string | string[]; normalise to string.
    const node = Array.isArray(params.node) ? params.node[0] : params.node;
    const business = Array.isArray(params.business) ? params.business[0] : params.business;

    // DEBUG alert — surfaces the received params on real hardware
    // without logcat attached. Remove once verified.
    Alert.alert(
      'NFC Tap',
      `node: ${node ?? '(missing)'}\nbusiness: ${business ?? '(missing)'}`,
      [
        {
          text: 'OK',
          onPress: () => {
            if (node && business) {
              const url =
                `https://dander.io/tap?node=${encodeURIComponent(String(node))}` +
                `&business=${encodeURIComponent(String(business))}`;
              console.log('[tap] reconstructed URL:', url);
              handleTapUrl(url).finally(() => router.replace('/'));
            } else {
              console.warn('[tap] node and/or business missing — skipping check-in');
              router.replace('/');
            }
          },
        },
      ],
      { cancelable: false },
    );
  }, []);

  return null;
}
