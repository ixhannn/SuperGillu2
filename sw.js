
const CACHE_NAME = 'tulika-v3';

// Lifecycle: Install
self.addEventListener('install', (event) => {
  // Activate immediately
  self.skipWaiting();
});

// Lifecycle: Activate
self.addEventListener('activate', (event) => {
  // Clean up old caches and claim clients
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Lifecycle: Fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. IGNORE API CALLS (Supabase, etc.)
  if (url.hostname.includes('supabase.co')) return;

  // 2. HTML / Navigation -> Network First, Fallback to Cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Assets (JS, CSS, Images) -> Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => { });
      return cachedResponse || fetchPromise;
    })
  );
});

// Notifications: Handle user clicking on a notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Focus the window if it's open, otherwise open a new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// Notifications: Handle incoming background push messages
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'Tulika', {
        body: data.body || 'New update!',
        icon: '/icon.svg',
        badge: '/icon.svg',
        data: data.url || '/'
      })
    );
  } catch (e) {
    event.waitUntil(
      self.registration.showNotification('Tulika', {
        body: event.data.text(),
        icon: '/icon.svg'
      })
    );
  }
});
