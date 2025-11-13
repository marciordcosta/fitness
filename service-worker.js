self.addEventListener("install", () => {
  console.log("Service Worker instalado");
});

self.addEventListener("fetch", (e) => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
