/*
 * Network-only service worker for the game under /play.
 * It exists so the game can be installed. It does not cache pages, puzzles,
 * or auth responses, and it does not control the landing page at /.
 */
self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  event.respondWith(fetch(event.request));
});
