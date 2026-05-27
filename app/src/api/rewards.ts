/**
 * rewards.ts — point redemption. The backend endpoint doesn't exist yet;
 * callers must expect a 404 and surface "coming soon".
 */

import { client } from './client';

export interface RedeemResponse {
  success:        true;
  message?:       string;
  new_balance?:   number;
  voucher_code?:  string;
}

export const redeemInStoreCredit = (points: number) =>
  client
    .post<RedeemResponse>('/api/rewards/redeem', { type: 'instore_credit', points })
    .then((r) => r.data);
