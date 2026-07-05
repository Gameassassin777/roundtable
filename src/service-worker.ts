/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (event: any) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => (self as any).skipWaiting())
    );
});

self.addEventListener('activate', (event: any) => {
    event.waitUntil(
        caches.keys().then(async (keys) => {
            for (const key of keys) {
                if (key !== CACHE) await caches.delete(key);
            }
            await (self as any).clients.claim();
        })
    );
});

self.addEventListener('fetch', (event: any) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // never touch the Gemini API etc.

    // Navigations / HTML: network-first so a stale (or cached-404) page always self-heals.
    // Falls back to the cached shell only when actually offline.
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req).catch(() =>
                caches.match(req).then((c) => c || caches.match('/roundtable/') || caches.match('/'))
            )
        );
        return;
    }

    // Hashed immutable build assets: cache-first (safe — the filename changes on every build).
    if (url.pathname.includes('/_app/immutable/')) {
        event.respondWith(
            caches.match(req).then((cached) => cached || fetch(req).then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((cache) => cache.put(req, copy));
                return res;
            }))
        );
        return;
    }

    // Everything else: try network, fall back to cache.
    event.respondWith(fetch(req).catch(() => caches.match(req)));
});
