/**
 * users.ts — user-account endpoints.
 *
 * Currently just the daily-login bonus claim. The backend dedups on its
 * side (one award per UTC day), so calling this is always safe; the
 * `already_claimed` flag tells the app whether new points were granted.
 */

import { client } from './client';

export interface DailyLoginResponse {
  ok:               boolean;
  points_awarded:   number;
  already_claimed:  boolean;
}

export const claimDailyLogin = () =>
  client.post<DailyLoginResponse>('/api/users/daily-login').then((r) => r.data);

// ── Loyalty status ─────────────────────────────────────────
export interface LoyaltyStatus {
  total_points:        number;
  lifetime_points:     number;
  total_saved_gbp:     number;
  tier:                'bronze' | 'silver' | 'gold' | 'platinum';
  next_tier?:          string | null;
  next_tier_points_needed?: number;
  // Cross-device authoritative step totals from user_loyalty (cached
  // counters maintained by POST /api/steps; up to ~5 min stale between
  // client POSTs).
  steps_today?:        number;
  steps_this_month?:   number;
  steps_all_time?:     number;
  milestones?:         unknown[];
  next_milestone?:     unknown;
}

export const getLoyaltyStatus = () =>
  client.get<{ success: boolean; loyalty: LoyaltyStatus }>('/api/users/loyalty')
    .then((r) => r.data.loyalty);
