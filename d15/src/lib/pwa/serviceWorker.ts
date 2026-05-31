import { browser } from '$app/environment';

export interface ServiceWorkerState {
	registration: ServiceWorkerRegistration | null;
	installing: ServiceWorker | null;
	waiting: ServiceWorker | null;
	active: ServiceWorker | null;
	error: Error | null;
	isOnline: boolean;
}

const state: ServiceWorkerState = {
	registration: null,
	installing: null,
	waiting: null,
	active: null,
	error: null,
	isOnline: browser ? navigator.onLine : true
};

const listeners = new Set<(state: ServiceWorkerState) => void>();

function notify() {
	listeners.forEach((listener) => listener({ ...state }));
}

function updateServiceWorkerState(registration: ServiceWorkerRegistration) {
	state.installing = registration.installing;
	state.waiting = registration.waiting;
	state.active = registration.active;
	notify();
}

function handleServiceWorkerUpdate(registration: ServiceWorkerRegistration) {
	registration.addEventListener('updatefound', () => {
		console.log('[PWA] Service Worker update found');
		const newWorker = registration.installing;
		if (newWorker) {
			newWorker.addEventListener('statechange', () => {
				console.log('[PWA] Service Worker state changed:', newWorker.state);
				updateServiceWorkerState(registration);

				if (newWorker.state === 'installed' && registration.waiting) {
					console.log('[PWA] New Service Worker installed and waiting');
				}
			});
		}
	});
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	if (!browser || !('serviceWorker' in navigator)) {
		console.log('[PWA] Service Worker not supported');
		return null;
	}

	try {
		console.log('[PWA] Registering Service Worker...');

		const registration = await navigator.serviceWorker.register('/service-worker.js', {
			updateViaCache: 'none',
			scope: '/'
		});

		state.registration = registration;
		updateServiceWorkerState(registration);
		handleServiceWorkerUpdate(registration);

		registration.addEventListener('onupdatefound', () => {
			console.log('[PWA] Service Worker update found event');
		});

		navigator.serviceWorker.addEventListener('controllerchange', () => {
			console.log('[PWA] Service Worker controller changed');
			window.location.reload();
		});

		console.log('[PWA] Service Worker registered successfully:', registration.scope);
		return registration;
	} catch (error) {
		console.error('[PWA] Service Worker registration failed:', error);
		state.error = error instanceof Error ? error : new Error(String(error));
		notify();
		return null;
	}
}

export async function updateServiceWorker(): Promise<void> {
	if (!state.registration) {
		console.warn('[PWA] No Service Worker registration to update');
		return;
	}

	try {
		console.log('[PWA] Checking for Service Worker updates...');
		await state.registration.update();
		console.log('[PWA] Service Worker update check complete');
	} catch (error) {
		console.error('[PWA] Service Worker update failed:', error);
	}
}

export function activateWaitingServiceWorker(): void {
	if (!state.registration || !state.registration.waiting) {
		console.warn('[PWA] No waiting Service Worker to activate');
		return;
	}

	console.log('[PWA] Activating waiting Service Worker...');
	state.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function subscribeToServiceWorkerState(
	listener: (state: ServiceWorkerState) => void
): () => void {
	listeners.add(listener);
	listener({ ...state });
	return () => listeners.delete(listener);
}

export function getServiceWorkerState(): ServiceWorkerState {
	return { ...state };
}

export async function requestBackgroundSync(tag: string): Promise<void> {
	if (!('SyncManager' in window)) {
		console.warn('[PWA] Background Sync not supported');
		return;
	}

	if (!state.registration) {
		console.warn('[PWA] No Service Worker registration for background sync');
		return;
	}

	try {
		console.log('[PWA] Requesting background sync:', tag);
		await state.registration.sync.register(tag);
		console.log('[PWA] Background sync registered successfully');
	} catch (error) {
		console.error('[PWA] Background sync registration failed:', error);
	}
}

export function setupNetworkListeners(): void {
	if (!browser) return;

	window.addEventListener('online', () => {
		console.log('[PWA] Network status: online');
		state.isOnline = true;
		notify();
	});

	window.addEventListener('offline', () => {
		console.log('[PWA] Network status: offline');
		state.isOnline = false;
		notify();
	});
}

export async function initPWA(): Promise<void> {
	if (!browser) return;

	console.log('[PWA] Initializing PWA...');

	setupNetworkListeners();
	await registerServiceWorker();

	console.log('[PWA] PWA initialization complete');
}
