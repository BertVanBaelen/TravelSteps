/* Web Push handlers, imported into the generated (Workbox) service worker. */
/* global self, URL */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'TravelSteps';
  const options = {
    body: data.body || '',
    tag: data.tag,
    icon: '/pwa-192.png',
    badge: '/badge-96.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((list) => list.forEach((c) => c.postMessage({ type: 'push' }))),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === url.origin && 'focus' in client) {
          return client.focus().then((c) => (c && 'navigate' in c ? c.navigate(url.href) : undefined));
        }
      }
      return self.clients.openWindow(url.href);
    }),
  );
});
