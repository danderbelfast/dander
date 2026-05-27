/**
 * leaderboard.ts — top 50 + my rank for the current UTC month.
 */

import { client } from './client';

export interface LeaderboardRow {
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
  client
    .get<{ success: true; leaderboard: LeaderboardRow[] }>('/api/leaderboard/monthly')
    .then((r) => r.data.leaderboard);

export const getMyRank = () =>
  client
    .get<{ success: true; me: LeaderboardRow }>('/api/leaderboard/me')
    .then((r) => r.data.me);
