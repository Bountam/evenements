// Service worker de la PWA (GitHub Pages). Le jeton de CACHE_NAME est remplacé au build par vite.config.ts :
// chaque déploiement crée un nouveau cache et purge l'ancien.
const CACHE_NAME = 'insertech-evenements-1.3.0-mvmdxwqc';
const INDEX_URL = './index.html';
const ASSETS_TO_CACHE = [
  INDEX_URL,
  './manifest.json',
  './favicon.ico',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './pwa-maskable-192x192.png',
  './pwa-maskable-512x512.png',
  './apple-touch-icon.png'
];
// Au-delà, on sert la copie en cache : sur le Wi-Fi saturé d'un événement, attendre l'échec
// réseau peut prendre des dizaines de secondes.
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

// Navigation (index.html, quels que soient ?vue=public ou ?rejoindre=CODE) : réseau d'abord,
// cache après NETWORK_TIMEOUT_MS. Une seule entrée en cache, mise à jour à chaque réponse réseau.
function handleNavigation(event) {
  const network = fetch(event.request).then(async (response) => {
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(INDEX_URL, response.clone());
    }
    return response;
  });
  // La mise à jour du cache continue même si la copie en cache a déjà été servie
  event.waitUntil(network.catch(() => undefined));

  const cached = () => caches.match(INDEX_URL);
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS)).then(cached);

  return Promise.race([network.catch(cached), timeout]).then(
    (response) => response || network.catch(() => new Response('Hors ligne', { status: 503, statusText: 'Hors-ligne' }))
  );
}

// Fichiers statiques du même site : cache d'abord, rafraîchi en arrière-plan.
function handleAsset(event) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cachedResponse || new Response('', { status: 503, statusText: 'Hors-ligne' }));
      if (cachedResponse) {
        event.waitUntil(network.then(() => undefined));
        return cachedResponse;
      }
      return network;
    })
  );
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Le reste (signalisation PeerJS, etc.) passe directement par le réseau
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
  } else {
    event.respondWith(handleAsset(event));
  }
});
