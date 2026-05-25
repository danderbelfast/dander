/**
 * device.ts — wraps POST /api/device/fingerprint.
 *
 * Backend returns { ok, flagged, flag_reason }. AuthContext / the
 * fingerprint hook decides what to do with the flagged status. Per the
 * product spec the user is never told they're flagged — downstream
 * services silently suppress rewards.
 */

import { client } from './client';

export interface DeviceFingerprintPayload {
  fingerprint:    string;
  install_id:     string;
  platform:       'ios' | 'android';
  os_version?:    string;
  app_version?:   string;
  timezone?:      string;
  screen_width?:  number;
  screen_height?: number;
}

export interface DeviceFingerprintResponse {
  ok:           boolean;
  flagged:      boolean;
  flag_reason:  string | null;
}

export const postFingerprint = (payload: DeviceFingerprintPayload) =>
  client.post<DeviceFingerprintResponse>('/api/device/fingerprint', payload)
    .then((r) => r.data);
