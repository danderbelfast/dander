import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: 'AIzaSyDSZsoWePxyx-k6UC43TCJ2iqKBSE4rdj8',
  authDomain: 'dander-cc9a7.firebaseapp.com',
  projectId: 'dander-cc9a7',
  storageBucket: 'dander-cc9a7.firebasestorage.app',
  messagingSenderId: '265341821648',
  appId: '1:265341821648:web:69fb1763248b8d282ef4d5',
};

const VAPID_KEY = 'BMu4PKCouDQYRO7zweej7rLvHPddxqIxvBuRixZs7cQgKdcGaCXK9VRt-kUJS5acS-QV9MjI62D7LmxuwuEmwHQ';

const app = initializeApp(firebaseConfig);

let _messaging = null;

function getMsg() {
  if (_messaging) return _messaging;
  try {
    _messaging = getMessaging(app);
    return _messaging;
  } catch {
    return null;
  }
}

/**
 * Request permission and get the FCM token.
 * Returns the token string or null on failure.
 */
export async function getFcmToken() {
  const messaging = getMsg();
  if (!messaging) return null;
  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    return token || null;
  } catch (err) {
    console.error('[firebase] getToken failed:', err);
    return null;
  }
}

/**
 * Listen for foreground FCM messages.
 * Returns an unsubscribe function.
 */
export function onForegroundMessage(callback) {
  const messaging = getMsg();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback(payload);
  });
}
