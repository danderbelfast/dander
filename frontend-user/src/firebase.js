import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain:        'dander-cc9a7.firebaseapp.com',
  projectId:         'dander-cc9a7',
  storageBucket:     'dander-cc9a7.firebasestorage.app',
  messagingSenderId: '265341821648',
  appId:             '1:265341821648:web:69fb1763248b8d282ef4d5',
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

let _app = null;
let _messaging = null;
let _swConfigSent = false;

function getApp() {
  if (_app) return _app;
  if (!firebaseConfig.apiKey) return null;
  _app = initializeApp(firebaseConfig);
  return _app;
}

function getMsg() {
  if (_messaging) return _messaging;
  const app = getApp();
  if (!app) return null;
  try {
    _messaging = getMessaging(app);
    return _messaging;
  } catch {
    return null;
  }
}

// Send the Firebase config to the FCM service worker so it can initialize
async function configureSwIfNeeded() {
  if (_swConfigSent || !firebaseConfig.apiKey) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js') ||
                await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    if (reg.active) {
      reg.active.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig });
      _swConfigSent = true;
    } else if (reg.installing || reg.waiting) {
      const worker = reg.installing || reg.waiting;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') {
          worker.postMessage({ type: 'FIREBASE_CONFIG', config: firebaseConfig });
          _swConfigSent = true;
        }
      });
    }
  } catch (err) {
    console.warn('[firebase] SW config failed:', err.message);
  }
}

/**
 * Request permission and get the FCM token.
 * Returns the token string or null on failure.
 */
export async function getFcmToken() {
  const messaging = getMsg();
  if (!messaging || !VAPID_KEY) return null;
  try {
    await configureSwIfNeeded();
    // Register the FCM SW for getToken to use
    const swReg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js') ||
                  await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
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
