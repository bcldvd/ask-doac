/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Two jobs:
//  1. cache the app shell (SvelteKit build + static files) — cache-first
//  2. cache Gemma model downloads (*.litertlm) in MODEL_CACHE so the 2GB
//     file is fetched from the network exactly once per model
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const APP_CACHE = `ask-doac-app-${version}`;
const MODEL_CACHE = 'ask-doac-models-v1';
// RAG index shards are versioned with the app build.
const APP_ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(APP_CACHE)
			.then((cache) => cache.addAll(APP_ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== APP_CACHE && key !== MODEL_CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})
	);
});

function isModelRequest(url: URL): boolean {
	return url.pathname.endsWith('.litertlm');
}

sw.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (event.request.method !== 'GET') return;

	if (isModelRequest(url)) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(MODEL_CACHE);
				const hit = await cache.match(event.request.url);
				if (hit) return hit;
				const res = await fetch(event.request);
				if (res.ok) {
					// Clone into cache while streaming the original to the page.
					const [toCache, toPage] = [res.clone(), res];
					event.waitUntil(cache.put(event.request.url, toCache));
					return toPage;
				}
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

// Let the page ask which models are already cached (for the preferences UI).
sw.addEventListener('message', async (event) => {
	if (event.data?.type !== 'model-cache-status') return;
	const cache = await caches.open(MODEL_CACHE);
	const keys = await cache.keys();
	event.source?.postMessage({
		type: 'model-cache-status',
		cached: keys.map((k) => k.url)
	});
});
