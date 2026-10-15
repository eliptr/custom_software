const CACHE = "recipe-tracker-__VERSION__";
const SHELL = "/";
const BASICS = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch(new Request(SHELL, { cache: "reload" }));
    if (!response.ok) throw new Error("Offline shell unavailable");
    const html = await response.clone().text();
    const resources = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+(?:\?[^"\s]*)?)"/g)].map((match) => match[1].replace(/&amp;/g, "&")))];
    if (!resources.length) throw new Error("Offline assets unavailable");
    await cache.addAll([...BASICS, ...resources]);
    await cache.put(SHELL, response);
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("recipe-tracker-") && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => { if (event.data?.type === "ACTIVATE") void self.skipWaiting(); });
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try { return await fetch(request); }
      catch { return (await cache.match(SHELL)) || new Response("Open Recipe Tracker once online to prepare offline access.", { status: 503, headers: { "Content-Type": "text/plain;charset=utf-8" } }); }
    })());
  } else if (url.pathname.startsWith("/_next/static/") || BASICS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const existing = await cache.match(request);
      if (existing) return existing;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
