/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Config is injected by the main app via postMessage after registration
let _initialized = false;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG' && !_initialized) {
    firebase.initializeApp(event.data.config);
    const messaging = firebase.messaging();

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

    _initialized = true;
  }
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
