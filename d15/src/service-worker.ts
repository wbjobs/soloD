/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

declare global {
	interface ServiceWorkerGlobalScope {
		__WB_MANIFEST: Array<{ url: string; revision: string | null }>;
	}
}

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = `pwa-notes-cache-${version}`;
const ASSETS_TO_CACHE = [...build, ...files, ...prerendered];

sw.addEventListener('install', (event) => {
	console.log('[Service Worker] Installing...');
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => {
				console.log('[Service Worker] Caching assets:', ASSETS_TO_CACHE.length, 'files');
				return cache.addAll(ASSETS_TO_CACHE);
			})
			.then(() => {
				console.log('[Service Worker] Installation complete');
				return sw.skipWaiting();
			})
	);
});

sw.addEventListener('activate', (event) => {
	console.log('[Service Worker] Activating...');
	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) => {
				return Promise.all(
					cacheNames
						.filter((cacheName) => cacheName !== CACHE_NAME)
						.map((cacheName) => {
							console.log('[Service Worker] Deleting old cache:', cacheName);
							return caches.delete(cacheName);
						})
				);
			})
			.then(() => {
				console.log('[Service Worker] Activation complete, claiming clients');
				return sw.clients.claim();
			})
	);
});

sw.addEventListener('fetch', (event) => {
	const request = event.request;

	if (request.method !== 'GET') {
		return;
	}

	event.respondWith(
		caches.match(request).then((cachedResponse) => {
			if (cachedResponse) {
				console.log('[Service Worker] Serving from cache:', request.url);
				return cachedResponse;
			}

			return fetch(request)
				.then((response) => {
					if (!response || response.status !== 200 || response.type !== 'basic') {
						return response;
					}

					const responseToCache = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(request, responseToCache);
					});

					return response;
				})
				.catch(() => {
					console.log('[Service Worker] Fetch failed for:', request.url);
					return caches.match('/').then((fallback) => fallback || new Response('Offline'));
				});
		})
	);
});

sw.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		console.log('[Service Worker] Received SKIP_WAITING message');
		sw.skipWaiting();
	}
});

sw.addEventListener('sync', (event) => {
	console.log('[Service Worker] Background sync event:', event.tag);
	if (event.tag === 'sync-notes') {
		event.waitUntil(
			fetch('/api/sync')
				.then((response) => response.json())
				.then((data) => {
					console.log('[Service Worker] Sync completed:', data);
				})
				.catch((error) => {
					console.error('[Service Worker] Sync failed:', error);
				})
		);
	}
});

console.log('[Service Worker] Script loaded');

