// DockEcho service worker.
//
// Anti-stale is a red line: because push == production, HTML/JS/CSS use
// network-first so a new deploy is picked up on the next load — the cache is
// only a fallback for offline. Big, immutable assets (the semantic model from
// the HF/jsDelivr CDNs) may be cache-first. It also receives shared text via the
// Web Share Target and stashes it for the app to turn into a note.

const CACHE = "dockecho-shell-v1";
const SHARE_KEY = "/__dockecho_share__";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

function isModelAsset(url) {
  return /cdn\.jsdelivr\.net|huggingface\.co|hf\.co/.test(url);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Web Share Target: the OS POSTs shared text here. Stash it, then redirect the
  // app to pick it up.
  if (request.method === "POST" && url.pathname.endsWith("/app.html")) {
    event.respondWith(handleShare(request));
    return;
  }

  if (request.method !== "GET") return;

  // The app reads the stashed share payload from this virtual URL.
  if (url.pathname.endsWith(SHARE_KEY)) {
    event.respondWith(caches.open(CACHE).then((c) => c.match(SHARE_KEY).then((r) => r ?? new Response("null", { headers: { "Content-Type": "application/json" } }))));
    return;
  }

  // Model/library files: cache-first (large, immutable).
  if (isModelAsset(url.href)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    }));
    return;
  }

  // Same-origin shell (HTML/JS/CSS/assets): network-first, cache fallback.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(request);
        return cached ?? Response.error();
      }
    })());
  }
});

async function handleShare(request) {
  try {
    const form = await request.formData();
    const payload = {
      title: form.get("title") || "",
      text: form.get("text") || "",
      url: form.get("url") || "",
    };
    const cache = await caches.open(CACHE);
    await cache.put(SHARE_KEY, new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } }));
  } catch {
    // fall through to redirect regardless
  }
  return Response.redirect("./app.html?shared=1", 303);
}
