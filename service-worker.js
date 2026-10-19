/*
 * MiRutina Vanilla — service-worker.js
 * Modo offline (PWA ligera): precachea la app entera y la sirve con
 * stale-while-revalidate (respuesta de caché al instante + refresco en
 * segundo plano). Solo actúa sobre GET del mismo origen; no toca
 * localStorage ni peticiones cross-origin. Rutas relativas para que
 * funcione igual en la raíz del dominio que en una subcarpeta.
 */
"use strict";

// Versión del caché: al renombrarla se instala la nueva, se activa al
// instante (skipWaiting + clients.claim) y se purgan las versiones viejas.
var CACHE_NAME = "mirutina-v1";

var PRECACHE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./i18n.js",
  "./domain.js",
  "./storage.js",
  "./ui.js",
  "./charts.js",
  "./app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Instalación: precacheo completo de la app.
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

// Activación: quedarse solo con la caché vigente y tomar las pestañas abiertas.
function cleanOldCaches() {
  return caches.keys().then(function (names) {
    return Promise.all(
      names
        .filter(function (name) {
          return name !== CACHE_NAME;
        })
        .map(function (name) {
          return caches.delete(name);
        })
    );
  });
}

self.addEventListener("activate", function (event) {
  event.waitUntil(
    cleanOldCaches()
      .then(function () {
        return self.clients.claim();
      })
      .then(function () {
        // Segunda pasada: el SW anterior puede dejar escritos tardíos de su
        // stale-while-revalidate justo al ser reciclado.
        return new Promise(function (resolve) {
          setTimeout(resolve, 1500);
        });
      })
      .then(cleanOldCaches)
  );
});

// Fetch: stale-while-revalidate para GET del mismo origen; el resto a la red.
self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(serve(event, request));
});

/** Caché al instante si existe y refresco en segundo plano; sin caché, red. */
function serve(event, request) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var refresh = fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(function () {
          return cached;
        });
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return refresh;
    });
  });
}
