/**
 * wifi.ts — wraps POST /api/wifi/observations.
 */

import { client } from './client';

export interface WifiObservation {
  bssid:            string;   // AA:BB:CC:DD:EE:FF
  ssid?:            string | null;
  signal_strength?: number;   // dBm
  latitude:         number;
  longitude:        number;
  accuracy_metres?: number;
  captured_at:      string;   // ISO 8601
}

export interface WifiObservationsResponse {
  success:       boolean;
  accepted:      number;
  points_earned: number;
}

export const postObservations = (observations: WifiObservation[]) =>
  client.post<WifiObservationsResponse>('/api/wifi/observations', { observations })
    .then((r) => r.data);
