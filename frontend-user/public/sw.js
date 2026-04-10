/* Dander Service Worker — push notifications + background proximity polling */

const CACHE_NAME = 'dander-seen-v1';

self.addEventListener('install', () => {
  // Don't skipWaiting automatically — wait for the user to confirm refresh
  // so the UpdateBanner can be shown first.
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ---------------------------------------------------------------------------
// Push event — server-sent Web Push (app fully closed)
// ---------------------------------------------------------------------------

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { /* ignore */ }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Dander', {
      body:     data.body  || 'A deal is nearby.',
      icon:     data.icon  || '/icons/icon-192.png',
      badge:    data.badge || '/icons/icon-192.png',
      data:     data.data  || {},
      tag:      'proximity-' + (data.data?.offerId || Date.now()),
      renotify: true,
    })
  );
});

// ---------------------------------------------------------------------------
// Notification click — deep-link into the app
// ---------------------------------------------------------------------------

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/home';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          return client.navigate(url);
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// ---------------------------------------------------------------------------
// Background proximity polling (tab open but hidden)
// Messages from LocationContext: START_BACKGROUND_POLL / STOP_BACKGROUND_POLL
// ---------------------------------------------------------------------------

let _bgPollTimer = null;
let _bgPollState = null; // { lat, lng, token }

async function getSeenOfferIds() {
  const cache = await caches.open(CACHE_NAME);
  const res   = await cache.match('seen-offers');
  if (!res) return new Set();
  return new Set(await res.json());
}

async function saveSeenOfferIds(set) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put('seen-offers', new Response(JSON.stringify([...set])));
}

async function pollNearby({ lat, lng, token }) {
  try {
    const res = await fetch(`/api/offers/nearby?lat=${lat}&lng=${lng}&radius=2000`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      // Token expired — stop polling
      stopBackgroundPoll();
      return;
    }

    const data = await res.json();
    const offers = data.offers || [];
    const seen   = await getSeenOfferIds();

    const newOffers = offers.filter((o) => !seen.has(o.id));

    for (const offer of newOffers) {
      seen.add(offer.id);
      await self.registration.showNotification(offer.business_name || 'Deal nearby', {
        body:     offer.title,
        icon:     '/icons/icon-192.png',
        badge:    '/icons/icon-192.png',
        tag:      'proximity-' + offer.id,
        renotify: true,
        data:     { offerId: offer.id, url: `/offer/${offer.id}` },
      });
    }

    if (newOffers.length > 0) await saveSeenOfferIds(seen);
  } catch {
    // Network error — fail silently
  }
}

function stopBackgroundPoll() {
  if (_bgPollTimer) { clearInterval(_bgPollTimer); _bgPollTimer = null; }
  _bgPollState = null;
}

self.addEventListener('message', (event) => {
  const { type, lat, lng, token } = event.data || {};

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }


  if (type === 'START_BACKGROUND_POLL') {
    _bgPollState = { lat, lng, token };
    if (_bgPollTimer) clearInterval(_bgPollTimer);
    // Poll immediately then every 60s
    pollNearby(_bgPollState);
    _bgPollTimer = setInterval(() => {
      if (_bgPollState) pollNearby(_bgPollState);
    }, 60_000);
  }

  if (type === 'STOP_BACKGROUND_POLL') {
    stopBackgroundPoll();
  }
});
