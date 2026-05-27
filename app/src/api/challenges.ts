/**
 * challenges.ts — currently backed by a stub on the server. Shape will be
 * stable once the real engine lands.
 */

import { client } from './client';

export type ChallengeReset = 'daily' | 'weekly' | 'monthly';
export type ChallengeType  = 'steps' | 'wifi' | 'visit' | 'login' | 'explore' | 'referral';

export interface Challenge {
  id:             number;
  type:           ChallengeType | string;
  name:           string;
  description:    string;
  points_reward:  number;
  target:         number;
  progress:       number;
  resets:         ChallengeReset | string;
  icon:           string;
}

export const getActiveChallenges = () =>
  client
    .get<{ success: true; challenges: Challenge[] }>('/api/challenges/active')
    .then((r) => r.data.challenges);
