import { writable } from 'svelte/store';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

function createSyncStore() {
	const { subscribe, set } = writable<SyncStatus>('idle');

	return {
		subscribe,
		setSyncing: () => set('syncing'),
		setSynced: () => set('synced'),
		setError: () => set('error'),
		setIdle: () => set('idle')
	};
}

export const syncStatus = createSyncStore();
