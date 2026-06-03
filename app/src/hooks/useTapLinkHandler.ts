/**
 * useTapLinkHandler — subscribes to incoming dander.io/tap URLs from
 * App Links and routes them to the NFC check-in flow. Mounted in
 * <SideEffects /> at app root.
 *
 * Both cold-start (Linking.getInitialURL) and warm-resume
 * (Linking.addEventListener) paths are handled, so a tap that launches
 * the app *and* a tap while the app is foregrounded both work.
 */

import { useEffect } from 'react';
import * as Linking from 'expo-linking';

import { useAuth } from '../context/AuthContext';
import { handleTapUrl } from '../services/nfcHandler';

export function useTapLinkHandler() {
  const { isAuth } = useAuth();

  useEffect(() => {
    if (!isAuth) return;
    let cancelled = false;

    // Cold start — the URL that launched the app, if any.
    Linking.getInitialURL()
      .then((url) => { if (!cancelled && url) void handleTapUrl(url); })
      .catch(() => {});

    // Warm resume — the user tapped while the app was already running.
    const sub = Linking.addEventListener('url', (ev) => {
      if (cancelled) return;
      if (ev?.url) void handleTapUrl(ev.url);
    });
    return () => {
      cancelled = true;
      try { sub.remove(); } catch { /* ignore */ }
    };
  }, [isAuth]);
}
