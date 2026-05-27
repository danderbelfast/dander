/**
 * users.ts — loyalty status, points history, and the daily-login claim.
 */

import { client } from './client';

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface LoyaltyStatus {
  total_points:    number;
  lifetime_points: number;
  total_saved_gbp: number;
  tier:            Tier;
  next_tier:       Tier | null;
  next_tier_points_needed: number;
  steps_today:     number;
  wifi_today:      number;
}

export interface LoyaltyTransaction {
  id:             number;
  type:           'earn' | 'redeem';
  points:         number;
  description:    string | null;
  reference_type: string | null;
  reference_id:   string | null;
  created_at:     string;
}

export const getLoyalty = () =>
  client
    .get<{ success: true; loyalty: LoyaltyStatus }>('/api/users/loyalty')
    .then((r) => r.data.loyalty);

export const getLoyaltyHistory = () =>
  client
    .get<{ success: true; history: LoyaltyTransaction[] }>('/api/users/loyalty/history')
    .then((r) => r.data.history);

export interface DailyLoginResponse {
  success:         true;
  ok:              true;
  points_awarded:  number;
  already_claimed: boolean;
}

export const claimDailyLogin = () =>
  client
    .post<DailyLoginResponse>('/api/users/daily-login')
    .then((r) => r.data);
