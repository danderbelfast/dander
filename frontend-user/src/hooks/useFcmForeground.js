import { useEffect } from 'react';
import { onForegroundMessage } from '../firebase';
import { useToast } from '../context/ToastContext';

/**
 * Listens for FCM messages while the app is in the foreground.
 * Shows them as in-app toasts (the browser won't auto-show a notification
 * when the page is visible, so we handle it ourselves).
 */
export function useFcmForeground() {
  const { toast } = useToast();

  useEffect(() => {
    const unsub = onForegroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      const data = payload.data || {};

      toast({
        type:    data.offerId ? 'proximity' : 'info',
        title:   title || 'Dander',
        message: body || '',
        offerId: data.offerId ? parseInt(data.offerId, 10) : undefined,
        duration: 6000,
      });
    });

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
