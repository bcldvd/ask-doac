/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// One job: cache the app shell (SvelteKit build + static files), cache-first.
// Model files live in OPFS, handled entirely by the page (see modelStore) —
// they used to be cached here, so LEGACY_MODEL_CACHE is kept alive until the
// page migrates its contents to OPFS and deletes it.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const APP_CACHE = `ask-doac-app-${version}`;
const LEGACY_MODEL_CACHE = 'ask-doac-models-v1';
// The vendored search embedder (~59 MB of weights + ONNX runtime WASM, see
// scripts/vendor-embedder.mjs). Far too big to precache on install, and half of
// it is the WASM build this browser won't pick — so it's cached on first use
// instead, which still leaves a later boot fully offline-capable.
const EMBEDDER_PREFIX = '/embedder/';
// Deliberately NOT the versioned app cache: these bytes are pinned (one model
// revision, one onnxruntime-web version), so a deploy has no reason to make
// everyone re-download 36 MB. Bump the suffix if the vendored set ever changes.
const EMBEDDER_CACHE = 'ask-doac-embedder-v1';
// App shell: the SPA fallback page (served at '/') plus build + static assets.
const SHELL = '/';
const PRECACHE_FILES = files.filter((f) => !f.startsWith(EMBEDDER_PREFIX));
const APP_ASSETS = [SHELL, ...build, ...PRECACHE_FILES];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(APP_CACHE)
			.then(async (cache) => {
				// Shell + build must cache; static data files are best-effort so a
				// single bad URL can't leave the worker permanently redundant.
				await cache.addAll([SHELL, ...build]);
				await Promise.allSettled(PRECACHE_FILES.map((f) => cache.add(f)));
			})
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				// webllm/* holds the mobile model's shards, transformers-cache the
				// MiniLM embedder — other libraries' caches are never ours to wipe
				if (
					key !== APP_CACHE &&
					key !== LEGACY_MODEL_CACHE &&
					key !== EMBEDDER_CACHE &&
					key !== 'transformers-cache' &&
					!key.startsWith('webllm/')
				) {
					await caches.delete(key);
				}
			}
			await sw.clients.claim();
		})
	);
});

sw.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (event.request.method !== 'GET') return;

	// SPA navigations get the cached shell so the app opens offline.
	if (event.request.mode === 'navigate' && url.origin === sw.location.origin) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(APP_CACHE);
				return (await cache.match(SHELL)) ?? fetch(event.request);
			})()
		);
		return;
	}

	// Embedder assets: serve from cache, and store on the first network hit so
	// the next boot needs no network at all.
	if (url.origin === sw.location.origin && url.pathname.startsWith(EMBEDDER_PREFIX)) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(EMBEDDER_CACHE);
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
				const res = await fetch(event.request);
				// Only whole responses are worth keeping — a 206 or an error page
				// cached here would poison every later boot.
				if (res.ok && res.status === 200) await cache.put(url.pathname, res.clone());
				return res;
			})()
		);
		return;
	}

	if (url.origin === sw.location.origin && APP_ASSETS.includes(url.pathname)) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(APP_CACHE);
				return (await cache.match(url.pathname)) ?? fetch(event.request);
			})()
		);
	}
});
