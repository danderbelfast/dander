/**
 * fingerprint.ts — gather device attributes, generate-or-recover the
 * persistent install UUID, and produce a stable SHA-256 device fingerprint.
 *
 * The install UUID is persisted to AsyncStorage and survives logout (it
 * intentionally does NOT rotate on logout — the backend uses it to detect
 * "multiple accounts on same install"). Every fingerprint includes the
 * install UUID in its input, so two different users on identical hardware
 * still produce different fingerprints.
 */

import { Dimensions, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

const INSTALL_ID_KEY = 'tapprove_install_id';

/**
 * Get the persistent install UUID, creating + storing it on first call.
 */
export async function getOrCreateInstallId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(INSTALL_ID_KEY);
    if (existing) return existing;
  } catch {
    // fall through and generate
  }
  const fresh = Crypto.randomUUID();
  try { await AsyncStorage.setItem(INSTALL_ID_KEY, fresh); } catch {}
  return fresh;
}

/**
 * Best-effort timezone resolution.
 */
function getTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export interface DeviceFingerprint {
  fingerprint:   string;
  install_id:    string;
  platform:      'ios' | 'android';
  os_version:    string;
  app_version:   string;
  timezone?:     string;
  screen_width:  number;
  screen_height: number;
}

/**
 * Collect device attributes, hash them with the install UUID, and return
 * the payload the backend expects on POST /api/device/fingerprint.
 */
export async function getDeviceFingerprint(): Promise<DeviceFingerprint> {
  const install_id = await getOrCreateInstallId();

  const { width, height } = Dimensions.get('screen');
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const os_version = String(Platform.Version);
  const app_version = String(
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '0.0.0'
  );
  const timezone = getTimezone();

  const ingredients = [
    install_id,
    platform,
    os_version,
    app_version,
    Device.modelId ?? Device.modelName ?? 'unknown-model',
    Device.manufacturer ?? 'unknown-manufacturer',
    Device.brand ?? 'unknown-brand',
    `${width}x${height}`,
    timezone ?? '',
  ].join('|');

  const fingerprint = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    ingredients
  );

  return {
    fingerprint,
    install_id,
    platform,
    os_version,
    app_version,
    timezone,
    screen_width:  Math.round(width),
    screen_height: Math.round(height),
  };
}
