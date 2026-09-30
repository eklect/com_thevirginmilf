/*
 * The Virgin MILF — push-only service worker.
 *
 * THIS FILE EXISTS FOR ONE REASON: a browser cannot receive a Web Push message
 * without a service worker to hand it to. It is the estate's one exception to
 * "manifest only, no service worker", and the exception is this worker's job,
 * not the rule:
 *
 *   - It handles `push`, `notificationclick` and `pushsubscriptionchange`.
 *   - It has NO `fetch` handler, opens NO Cache Storage and imports nothing.
 *
 * That last line is the whole point. The rule exists because a caching worker
 * serves a stale shell and pins people to an old build. A worker that never
 * touches a request cannot do either — every page load still goes to nginx
 * exactly as if this file were not here. Do not add a fetch handler, Workbox
 * or `importScripts` to it. If a venture ever wants offline, that is a
 * different decision with a different owner.
 *
 * Registered only from an explicit click on the account page
 * (`src/lib/push.ts`), with `updateViaCache: 'none'`, and nginx serves this
 * path `no-cache` — so a change here reaches an installed worker on its next
 * update check rather than in a year.
 *
 * Plain JavaScript in `public/`, not a module under `src/`: it has to be
 * served from the site root at a stable, unhashed URL, because its scope is
 * the directory it is served from.
 */

/* A new version takes over at once. With nothing cached there is no stale
   page for it to disagree with, so there is nothing to wait for. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/*
 * A push arrived. The payload is what `StreamAlertsScheduler` enqueued:
 * `{ title, body, url, tag }`.
 *
 * A notification is ALWAYS shown, even for a payload that cannot be read.
 * Browsers require a visible notification for every push, and revoke the
 * subscription of a site that swallows them.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {};
  }

  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'The Virgin MILF';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/streams';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof payload.body === 'string' ? payload.body : '',
      icon: '/icons/v1/icon-192.png',
      badge: '/icons/v1/icon-192.png',
      /* One tag per stream, so its reminder replaces its announcement in the
         tray instead of stacking under it — and `renotify` so the replacement
         still makes a sound, which is the point of a reminder. */
      tag: typeof payload.tag === 'string' ? payload.tag : undefined,
      renotify: typeof payload.tag === 'string',
      data: { url },
    }),
  );
});

/*
 * A click opens the stream's page on this site — never the stream itself.
 * The link is behind the sign-in gate, and the page is where that is handled.
 * An already-open tab is focused and navigated rather than a second one opened.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '/streams';
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus().then((focused) =>
            focused && 'navigate' in focused ? focused.navigate(target) : undefined,
          );
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

/*
 * The browser rotated the subscription on its own. Re-subscribe with the same
 * key and tell the server, so alerts do not silently stop. The session cookie
 * rides along on a same-origin request; if the person has since signed out the
 * POST is refused and the account page re-syncs the next time they visit.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  const options = event.oldSubscription && event.oldSubscription.options;
  if (!options || !options.applicationServerKey) return;

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
      .then((subscription) => {
        const json = subscription.toJSON();
        return fetch('/api/account/push-subscriptions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });
      })
      .catch(() => undefined),
  );
});
