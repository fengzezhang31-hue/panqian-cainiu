// 鍏洏灞?- Service Worker v59.0
// 缃戠粶浼樺厛 + JSON鏁版嵁姘镐笉缂撳瓨 + 寮哄埗鏇存柊

const CACHE_NAME = 'liupanshan-v61';
const CORE_ASSETS = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  caches.keys().then(function(keys){ keys.forEach(function(key){ caches.delete(key); }); });
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS).catch(err => {
        console.warn('SW: 棰勭紦瀛樿祫婧愬け璐?, err);
      });
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    caches.keys().then(function(keys){ keys.forEach(function(key){ caches.delete(key); }); });
  }
});

function isDataFile(url) {
  try {
    var pathname = new URL(url).pathname;
    return pathname.endsWith('.json');
  } catch(e) {
    return url.indexOf('.json') > -1;
  }
}

self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith(self.location.origin)) return;

  if (isDataFile(event.request.url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(() => {
      return caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match('./gumo-app.html');
        }
      });
    })
  );
});
