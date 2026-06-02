/**
 * proximity.ts — proximity detection API client.
 *
 * The BLE scanner calls notifyDetected() whenever it sees a Dander Node
 * advertisement nearby with sufficient signal strength. The backend
 * handles all the loyalty bookkeeping (point award, visit log, GIF
 * pick, display command enqueue) and returns a thin summary for the
 * app to surface as a toast / haptic.
 *
 * Also fetches the "known nodes" map at boot so the scanner can confirm
 * a sighted device_id prefix really belongs to a paired Node before it
 * fires off a proximity ping.
 */

import client from './client';

export type KnownNode = {
  device_id: string;
  business_id: number;
};

export type ProximityResponse = {
  success: boolean;
  greeted: boolean;
  already_visited: boolean;
  points_awarded: number;
  total_points: number;
  visit_number: number;
  business_name: string;
  rssi: number | null;
};

export async function notifyDetected(params: {
  node_device_id: string;
  business_id: number;
  rssi?: number | null;
}): Promise<ProximityResponse> {
  const { data } = await client.post('/api/proximity/detected', params);
  return data as ProximityResponse;
}

export async function fetchKnownNodes(): Promise<KnownNode[]> {
  const { data } = await client.get('/api/nodes/known');
  return Array.isArray(data?.nodes) ? (data.nodes as KnownNode[]) : [];
}
