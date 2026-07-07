/* UpDown service worker — push notifications only.
 *
 * Intentionally NO offline/precache caching: a real-time betting app is useless
 * offline, and Workbox-style precaching would fight the app's VersionGate stale-
 * bundle detection (BUILD_ID / git SHA in next.config.js). This SW only exists
 * to receive Web Push and route clicks back into the app.
 */

// Activate immediately on install/update instead of waiting for all tabs to close.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Incoming push → show a notification. Payload shape is set by the API's
// webpush service: { title, body, url?, tag? }.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = { title: 'UpDown', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'UpDown';
  const options = {
    body: payload.body || '',
    icon: '/updown-logos/Logo_512px_Cyan_Transparent.png',
    badge: '/updown-logos/Logo_48px_Cyan_Transparent.png',
    tag: payload.tag || undefined,
    // Replace an existing notification with the same tag instead of stacking.
    renotify: Boolean(payload.tag),
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click → focus an existing app tab (navigating it to the target) or open one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // Reuse an already-open UpDown tab.
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
