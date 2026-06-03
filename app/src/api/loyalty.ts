/**
 * loyalty.ts — read-only client for the user's loyalty footprint
 * across every business they've checked into.
 */

import client from './client';

export type UserBusinessLoyalty = {
  business_id: number;
  name: string;
  logo_url: string | null;
  points: number;
  total_visits: number;
  current_streak: number;
  longest_streak: number;
  tier: string;
};

export async function fetchUserBusinesses(): Promise<UserBusinessLoyalty[]> {
  const { data } = await client.get('/api/loyalty/user-businesses');
  return Array.isArray(data?.businesses) ? data.businesses : [];
}
