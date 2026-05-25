/**
 * leaderboard.ts — user-facing leaderboard endpoints.
 *
 * Source of truth: backend's points_transactions ledger.
 * Monthly window = current UTC calendar month.
 */

import { client } from './client';

export interface LeaderboardRow {
  rank:                     number;
  user_id:                  number;
  display_name:             string;
  avatar_url:               string | null;
  points_this_month:        number;
  steps_this_month:         number;
  wifi_networks_this_month: number;
  rank_change:              number;
}

export interface MyLeaderboard {
  rank:                     number | null;
  user_id:                  number;
  display_name:             string;
  avatar_url:               string | null;
  points_this_month:        number;
  steps_this_month:         number;
  wifi_networks_this_month: number;
  rank_change:              number;
}

export const getMonthlyLeaderboard = () =>
  client.get<{ success: boolean; leaderboard: LeaderboardRow[] }>('/api/leaderboard/monthly')
    .then((r) => r.data.leaderboard);

export const getMyLeaderboard = () =>
  client.get<{ success: boolean; me: MyLeaderboard }>('/api/leaderboard/me')
    .then((r) => r.data.me);
