// Offline support for the installed app. Online, every file comes fresh from the network, so a new
// version shows up the first time the app is opened; the cache is only the fallback when offline
// or the network is too slow. The Android app reads the version number and FILES list below to
// update itself (see android-app/.../Updater.java), so keep both accurate.
const CACHE = 'hanzi-v10';
const FILES = [
  './',
  './index.html',
  './app.js',
  './fun.js',
  './shared.js',
  './words.js',
  './styles.css',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

const NETWORK_WAIT_MS = 4000;

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      // 'no-cache' makes the browser check with the server instead of trusting its own copy.
      const fresh = fetch(e.request, { cache: 'no-cache' }).then((res) => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      });
      if (!cached) return fresh;
      const giveUp = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_WAIT_MS));
      return Promise.race([fresh.catch(() => cached), giveUp]);
    })
  );
});
