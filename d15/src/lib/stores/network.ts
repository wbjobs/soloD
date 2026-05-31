import { writable } from 'svelte/store';

function createNetworkStore() {
	const { subscribe, set } = writable(navigator.onLine);

	function handleOnline() {
		set(true);
	}

	function handleOffline() {
		set(false);
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
	}

	return {
		subscribe
	};
}

export const isOnline = createNetworkStore();
