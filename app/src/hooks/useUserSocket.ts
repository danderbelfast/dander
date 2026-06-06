/**
 * useUserSocket — root-mounted hook that maintains the user's
 * Socket.IO connection and bridges `points_awarded` pushes into the
 * existing NfcCheckInScreen coins-overlay pipeline.
 *
 * Gates on isAuth so an unauthenticated app never opens a socket. On
 * logout the connection is torn down via disconnectUserSocket().
 */

import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { connectUserSocket, disconnectUserSocket, onUserEvent } from '../services/userSocket';
import { triggerCheckInOverlay } from '../services/nfcHandler';
import { NfcCheckinResponse } from '../api/proximity';

type PointsAwardedPayload = {
  business_id?: number;
  business_name?: string;
  points_awarded?: number;
  total_points?: number;
  tier?: string;
  tier_upgraded?: boolean;
  message?: string;
};

export function useUserSocket() {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      disconnectUserSocket();
      return;
    }

    connectUserSocket(userId);

    const off = onUserEvent<PointsAwardedPayload>('points_awarded', (p) => {
      // Synthesise an NfcCheckinResponse so the coins overlay can play
      // without a separate render path. Visit / streak / unlock fields
      // aren't carried on the till push (the till flow doesn't increment
      // a visit; that's already happened via the tap NFC sticker if
      // there was one) so we zero them out.
      const synthesised: NfcCheckinResponse = {
        success: true,
        points_awarded: Number(p?.points_awarded) || 0,
        total_points:   Number(p?.total_points)   || 0,
        visit_number:   0,
        tier:           typeof p?.tier === 'string' ? p.tier : 'bronze',
        tier_upgraded:  !!p?.tier_upgraded,
        streak:         0,
        rewards_unlocked: [],
        next_reward:    null,
        collectable_unlocked: null,
        collectable_evolved:  null,
        business_name:  typeof p?.business_name === 'string' ? p.business_name : '',
        delivery:       'websocket',
      };
      triggerCheckInOverlay(synthesised);
    });

    return () => {
      off();
    };
  }, [userId]);
}
