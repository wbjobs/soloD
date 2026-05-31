import {
	getUnsyncedNotes,
	markNoteAsSynced,
	markNotesAsSynced,
	bulkUpsertNotes,
	hardDeleteNote,
	hasUnsyncedNotes
} from '../db/indexedDB';
import { syncNotesToFirebase, fetchAllNotesFromFirebase } from '../firebase/notes';
import { syncStatus } from '../stores/sync';
import { isOnline } from '../stores/network';
import { get } from 'svelte/store';
import { requestBackgroundSync } from '../pwa/serviceWorker';
import type { Note } from '../types/note';

let syncInProgress = false;
let lastSyncTime: Date | null = null;

export async function syncLocalToRemote(): Promise<void> {
	if (syncInProgress || !get(isOnline)) return;

	syncInProgress = true;
	syncStatus.setSyncing();
	console.log('[Sync] Starting local to remote sync...');

	try {
		const unsyncedNotes = await getUnsyncedNotes();
		console.log(`[Sync] Found ${unsyncedNotes.length} unsynced note(s)`);

		if (unsyncedNotes.length > 0) {
			await syncNotesToFirebase(unsyncedNotes);
			console.log('[Sync] Successfully synced notes to Firebase');

			const syncedIds: string[] = [];
			const deletedIds: string[] = [];

			for (const note of unsyncedNotes) {
				if (note.isDeleted) {
					deletedIds.push(note.id);
				} else {
					syncedIds.push(note.id);
				}
			}

			if (syncedIds.length > 0) {
				await markNotesAsSynced(syncedIds);
				console.log(`[Sync] Marked ${syncedIds.length} note(s) as synced`);
			}

			for (const id of deletedIds) {
				await hardDeleteNote(id);
			}
			if (deletedIds.length > 0) {
				console.log(`[Sync] Hard deleted ${deletedIds.length} note(s)`);
			}
		}

		lastSyncTime = new Date();
		syncStatus.setSynced();
		setTimeout(() => syncStatus.setIdle(), 2000);
		console.log('[Sync] Local to remote sync completed');
	} catch (error) {
		console.error('[Sync] Local to remote sync error:', error);
		syncStatus.setError();
		setTimeout(() => syncStatus.setIdle(), 3000);

		if ('SyncManager' in window) {
			await requestBackgroundSync('sync-notes');
		}
	} finally {
		syncInProgress = false;
	}
}

export async function syncRemoteToLocal(): Promise<void> {
	if (!get(isOnline)) {
		console.log('[Sync] Offline, skipping remote to local sync');
		return;
	}

	console.log('[Sync] Starting remote to local sync...');

	try {
		const remoteNotes = await fetchAllNotesFromFirebase();
		console.log(`[Sync] Fetched ${remoteNotes.length} note(s) from Firebase`);

		await bulkUpsertNotes(remoteNotes);
		console.log('[Sync] Remote to local sync completed');
	} catch (error) {
		console.error('[Sync] Remote to local sync error:', error);
	}
}

export async function fullSync(): Promise<void> {
	console.log('[Sync] Starting full sync...');
	await syncRemoteToLocal();
	await syncLocalToRemote();
	console.log('[Sync] Full sync completed');
}

export function initializeSyncService(): void {
	if (typeof window === 'undefined') return;

	console.log('[Sync] Initializing sync service...');

	window.addEventListener('online', () => {
		console.log('[Sync] Network restored, triggering sync');
		fullSync();
	});

	window.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			console.log('[Sync] Page visible, checking for pending syncs');
			hasUnsyncedNotes().then((hasUnsynced) => {
				if (hasUnsynced && get(isOnline)) {
					syncLocalToRemote();
				}
			});
		}
	});

	fullSync();
	console.log('[Sync] Sync service initialized');
}

export async function saveNoteAndSync(note: Note): Promise<void> {
	if (get(isOnline)) {
		try {
			syncStatus.setSyncing();
			await syncNotesToFirebase([note]);
			await markNoteAsSynced(note.id);
			syncStatus.setSynced();
			setTimeout(() => syncStatus.setIdle(), 2000);
			console.log('[Sync] Note synced immediately:', note.id);
		} catch (error) {
			console.error('[Sync] Immediate sync failed, will retry later:', error);
			syncStatus.setError();
			setTimeout(() => syncStatus.setIdle(), 3000);

			if ('SyncManager' in window) {
				await requestBackgroundSync('sync-notes');
			}
		}
	} else {
		console.log('[Sync] Offline, note will be synced when network returns');
	}
}

export function getLastSyncTime(): Date | null {
	return lastSyncTime;
}

