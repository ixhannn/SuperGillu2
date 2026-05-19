const CACHE_NAME = 'lior-v6';

const cacheResponse = async (request, response) => {
  if (request.method !== 'GET') return;
  if (!response || response.status !== 200) return;
  if (response.type !== 'basic') return;

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
};

// Lifecycle: Install
self.addEventListener('install', () => {
  // Activate immediately
  self.skipWaiting();
});

// Lifecycle: Activate
self.addEventListener('activate', (event) => {
  // Clean up old caches and claim clients
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }),
    )).then(() => self.clients.claim()),
  );
});

// Lifecycle: Fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // Ignore API/media calls. App media has its own retry and migration path.
  if (url.hostname.includes('supabase.co')) return;
  if (url.hostname.includes('workers.dev')) return;

  // HTML / Navigation -> Network First, Fallback to Cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          await cacheResponse(event.request, response);
          return response;
        } catch {
          return (await caches.match(event.request)) || (await caches.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Assets (JS, CSS, Images) -> Stale-While-Revalidate
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(event.request);

      if (cachedResponse) {
        event.waitUntil(
          fetch(event.request)
            .then((networkResponse) => cacheResponse(event.request, networkResponse))
            .catch(() => {}),
        );
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(event.request);
        await cacheResponse(event.request, networkResponse);
        return networkResponse;
      } catch {
        return Response.error();
      }
    })(),
  );
});

// Notifications: Handle user clicking on a notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    }),
  );
});

// Notifications: Handle incoming background push messages
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'Lior', {
        body: data.body || 'New update!',
        icon: '/notification-icon.png',
        badge: '/notification-icon.png',
        data: data.url || '/',
      }),
    );
  } catch {
    event.waitUntil(
      self.registration.showNotification('Lior', {
        body: event.data.text(),
        icon: '/notification-icon.png',
      }),
    );
  }
});
