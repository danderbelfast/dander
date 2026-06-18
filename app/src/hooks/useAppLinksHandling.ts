import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';

import { getLinkHandlingState } from '../../modules/applinks/src';

const DISMISSED_KEY = 'applinks_prompt_dismissed_for_version';

type Status = 'unknown' | 'ok' | 'needs-prompt' | 'dismissed';

/**
 * useAppLinksHandling — drives the AppLinksBanner.
 *
 * On Android 12+ (where DomainVerificationManager exists) we poll the
 * "Open supported links" master toggle for our package. When OFF, the
 * banner asks the user to flip it; on a "Not now" we remember the
 * dismissal keyed by the app version so the next release re-prompts.
 *
 * iOS, Android <12, and any device where reading the state throws all
 * resolve to status='ok' — the banner stays hidden, no nagging.
 *
 * The AppState 'active' listener re-polls when the app comes back to
 * foreground, so the banner auto-dismisses the moment the user toggles
 * the setting on and returns to the app.
 */
export function useAppLinksHandling() {
  const [status, setStatus] = useState<Status>('unknown');

  const appVersion = Constants.expoConfig?.version ?? '0.0.0';
  const androidPackage = Constants.expoConfig?.android?.package ?? 'io.tapprove.app';

  const check = useCallback(async () => {
    const state = await getLinkHandlingState();
    if (!state.supported || state.linkHandlingAllowed) {
      setStatus('ok');
      return;
    }
    try {
      const dismissedFor = await AsyncStorage.getItem(DISMISSED_KEY);
      if (dismissedFor === appVersion) {
        setStatus('dismissed');
        return;
      }
    } catch {
      // AsyncStorage failed — fall through to prompt rather than
      // silently swallow it.
    }
    setStatus('needs-prompt');
  }, [appVersion]);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const openSettings = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      await IntentLauncher.startActivityAsync(
        'android.settings.APP_OPEN_BY_DEFAULT_SETTINGS',
        { data: `package:${androidPackage}` }
      );
    } catch {
      // Fallback: some ruggedised distributions don't ship the
      // Android-12-introduced action. Generic app details page still
      // lets the user reach "Open by default" in two more taps.
      try {
        await IntentLauncher.startActivityAsync(
          'android.settings.APPLICATION_DETAILS_SETTINGS',
          { data: `package:${androidPackage}` }
        );
      } catch {
        // No way to deep-link. The user will see the banner stick
        // around; their best path is Settings → Apps manually.
      }
    }
  }, [androidPackage]);

  const dismiss = useCallback(async () => {
    try {
      await AsyncStorage.setItem(DISMISSED_KEY, appVersion);
    } catch {
      // If persist failed the user just gets re-prompted next launch.
    }
    setStatus('dismissed');
  }, [appVersion]);

  return { status, openSettings, dismiss };
}
