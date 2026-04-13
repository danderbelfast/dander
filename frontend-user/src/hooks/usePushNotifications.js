import { useState, useEffect, useCallback } from 'react';
import { getVapidPublicKey, subscribePush, unsubscribePush, saveFcmToken } from '../api/push';
import { getFcmToken } from '../firebase';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const [registration, setRegistration] = useState(null);
  const [permission, setPermission]     = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [initialized, setInitialized]   = useState(false);

  // Register the service worker on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator)) { setInitialized(true); return; }
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        setRegistration(reg);
        return reg.pushManager.getSubscription();
      })
      .then((sub) => { if (sub) setIsSubscribed(true); })
      .catch(() => {})
      .finally(() => setInitialized(true));
  }, []);

  const subscribeToPush = useCallback(async () => {
    if (!registration) return false;
    try {
      // Request permission if not already granted
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      const vapidKey = await getVapidPublicKey();

      // Tear down any stale subscription before creating a new one
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        try { await existing.unsubscribe(); } catch { /* ignore */ }
      }

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      await subscribePush({
        endpoint: sub.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))),
          auth:   btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))),
        },
      });

      // Also register FCM token for background delivery when browser is closed
      try {
        const fcmToken = await getFcmToken();
        if (fcmToken) {
          await saveFcmToken(fcmToken);
        }
      } catch (err) {
        console.warn('[push] FCM token registration failed (non-critical):', err.message);
      }

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('[push] subscribe failed:', err);
      return false;
    }
  }, [registration]);

  const unsubscribeFromPush = useCallback(async () => {
    if (!registration) return;
    try {
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch {
      /* ignore */
    }
  }, [registration]);

  return { permission, isSubscribed, initialized, subscribeToPush, unsubscribeFromPush };
}
