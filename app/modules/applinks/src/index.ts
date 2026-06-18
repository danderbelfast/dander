import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type LinkHandlingState = {
  /** false on iOS and on Android < 12 (API 31). When false, the prompt flow is a no-op. */
  supported: boolean;
  /** The Samsung "Open supported links" master toggle. True ⇒ app handles its verified links. */
  linkHandlingAllowed: boolean;
  /** Hosts the system has auto-verified for this package (STATE_VERIFIED). Diagnostic only. */
  verifiedHosts: string[];
  /** Hosts the user has explicitly toggled "open in app" for (STATE_SELECTED). Diagnostic only. */
  selectedHosts: string[];
};

type NativeModule = {
  getDomainState(): Promise<{
    supported: boolean;
    linkHandlingAllowed: boolean;
    hosts: Record<string, number>;
  }>;
};

const native = requireOptionalNativeModule<NativeModule>('AppLinks');

const UNSUPPORTED: LinkHandlingState = {
  supported: false,
  linkHandlingAllowed: true,
  verifiedHosts: [],
  selectedHosts: [],
};

// AOSP DomainVerificationUserState state codes — mirrors the values
// returned by getHostToStateMap(). Anything we don't recognise gets
// ignored on the JS side (returned in neither verified nor selected
// arrays) so the caller doesn't need to keep up with new state values.
const STATE_VERIFIED = 1;
const STATE_SELECTED = 2;

export async function getLinkHandlingState(): Promise<LinkHandlingState> {
  if (Platform.OS !== 'android' || !native) return UNSUPPORTED;
  try {
    const raw = await native.getDomainState();
    if (!raw.supported) return UNSUPPORTED;
    const verifiedHosts: string[] = [];
    const selectedHosts: string[] = [];
    for (const [host, state] of Object.entries(raw.hosts)) {
      if (state === STATE_VERIFIED) verifiedHosts.push(host);
      else if (state === STATE_SELECTED) selectedHosts.push(host);
    }
    return {
      supported: true,
      linkHandlingAllowed: raw.linkHandlingAllowed,
      verifiedHosts,
      selectedHosts,
    };
  } catch {
    return UNSUPPORTED;
  }
}
