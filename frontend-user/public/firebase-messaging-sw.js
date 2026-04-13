/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDSZsoWePxyx-k6UC43TCJ2iqKBSE4rdj8',
  authDomain: 'dander-cc9a7.firebaseapp.com',
  projectId: 'dander-cc9a7',
  storageBucket: 'dander-cc9a7.firebasestorage.app',
  messagingSenderId: '265341821648',
  appId: '1:265341821648:web:69fb1763248b8d282ef4d5',
});

const messaging = firebase.messaging();

// Handle background messages (app closed or in background)
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || 'Dander', {
    body: body || 'A deal is nearby.',
    icon: '/dander-app-logo.png',
    badge: '/dander-app-logo.png',
    data: data,
    tag: data.offerId ? `dander-${data.offerId}` : `dander-${Date.now()}`,
  });
});

// Handle notification click — open the relevant page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/home';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          return client.navigate(url);
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
