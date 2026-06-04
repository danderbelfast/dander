/**
 * users.ts — loyalty status, points history, and the daily-login claim.
 */

import { client } from './client';

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface LoyaltyStatus {
  total_points:     number;
  lifetime_points:  number;
  total_saved_gbp:  number;
  tier:             Tier;
  next_tier:        Tier | null;
  next_tier_points_needed: number;
  steps_today:      number;
  steps_this_month: number;
  steps_all_time:   number;
  wifi_today:       number;
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

// ── Display preference (personalised vs anonymous) ─────────
export type DisplayPreference = 'personalised' | 'anonymous';

export interface DisplayPreferenceState {
  display_preference: DisplayPreference;
  display_preference_set_at: string | null;
  birthday_sharing: boolean;
}

export async function getDisplayPreference(): Promise<DisplayPreferenceState | null> {
  try {
    const { data } = await client.get('/api/users/display-preference');
    if (!data?.success) return null;
    return {
      display_preference: data.display_preference,
      display_preference_set_at: data.display_preference_set_at,
      birthday_sharing: data.birthday_sharing,
    };
  } catch { return null; }
}

export async function setDisplayPreference(
  pref: DisplayPreference,
  birthday_sharing?: boolean,
): Promise<boolean> {
  try {
    const body: Record<string, unknown> = { display_preference: pref };
    if (typeof birthday_sharing === 'boolean') body.birthday_sharing = birthday_sharing;
    const { data } = await client.post('/api/users/display-preference', body);
    return !!data?.success;
  } catch { return false; }
}
