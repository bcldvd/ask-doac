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
// App shell: the SPA fallback page (served at '/') plus build + static assets.
const SHELL = '/';
const APP_ASSETS = [SHELL, ...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(APP_CACHE)
			.then(async (cache) => {
				// Shell + build must cache; static data files are best-effort so a
				// single bad URL can't leave the worker permanently redundant.
				await cache.addAll([SHELL, ...build]);
				await Promise.allSettled(files.map((f) => cache.add(f)));
			})
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				// webllm/* caches hold the mobile model's shards — never touch them
				if (key !== APP_CACHE && key !== LEGACY_MODEL_CACHE && !key.startsWith('webllm/')) {
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

	if (url.origin === sw.location.origin && APP_ASSETS.includes(url.pathname)) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(APP_CACHE);
				return (await cache.match(url.pathname)) ?? fetch(event.request);
			})()
		);
	}
});
