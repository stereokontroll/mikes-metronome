const CACHE_NAME = "metronome-v2.11"; // Verhoog dit nummer bij elke update!
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
  // Voeg hier eventueel je CSS of JS bestanden toe (bijv. ./style.css of ./app.js)
];

// 1. Installeren en cachen
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 2. Activeren en oude caches opruimen (NIEUW)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Oude cache verwijderd:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// 3. Ophalen (Cache first, fallback to network)
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});

// 4. Luister naar bericht van de pagina om direct te activeren (skipWaiting)
self.addEventListener("message", (event) => {
  if (event.data && event.data.action === "skipWaiting") {
    self.skipWaiting();
  }
});
