/**
 * useWifiScanner — start the scanner once the user is authenticated and
 * stop it on unmount / logout. Silent no-op on platforms where scanning
 * isn't possible.
 */

import { useEffect } from 'react';
import { startWifiScanner, stopWifiScanner } from '../services/wifiScanner';
import { useAuth } from '../context/AuthContext';

export function useWifiScanner() {
  const { isAuth } = useAuth();

  useEffect(() => {
    if (!isAuth) return;
    void startWifiScanner();
    return () => stopWifiScanner();
  }, [isAuth]);
}
