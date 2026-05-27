/**
 * useStepCounter — start the Pedometer subscription once the user is
 * authenticated and stop it on unmount / logout. Mirrors the gating used
 * by useWifiScanner so step counting never runs for an anonymous user.
 *
 * Devices without a pedometer (most simulators, very old phones) are
 * handled inside startStepCounting() itself — it returns false and the
 * service no-ops, so this hook is safe to mount unconditionally.
 */

import { useEffect } from 'react';

import { startStepCounting, stopStepCounting } from '../services/stepCounter';
import { useAuth } from '../context/AuthContext';

function useStepCounter() {
  const { isAuth } = useAuth();

  useEffect(() => {
    if (!isAuth) return;

    startStepCounting().catch((err) => {
      console.warn('[useStepCounter] start failed:', err);
    });

    return () => stopStepCounting();
  }, [isAuth]);
}

export default useStepCounter;
