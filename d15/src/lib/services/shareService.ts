import { getNoteById, updateNote } from '../db/indexedDB';
import { generateShareId, syncNoteToFirebase } from '../firebase/notes';
import { isOnline } from '../stores/network';
import { get } from 'svelte/store';
import type { Note } from '../types/note';

export async function shareNote(noteId: string): Promise<{ note: Note; shareUrl: string } | null> {
	try {
		const note = await getNoteById(noteId);
		if (!note || note.isDeleted) {
			console.error('[Share] Note not found or deleted');
			return null;
		}

		const shareId = note.shareId || (await generateShareId());
		const now = new Date();

		const updatedNote = await updateNote(noteId, {
			isPublic: true,
			shareId,
			sharedAt: now,
			synced: false
		});

		if (!updatedNote) {
			console.error('[Share] Failed to update note');
			return null;
		}

		if (get(isOnline)) {
			try {
				await syncNoteToFirebase(updatedNote);
				await updateNote(noteId, { synced: true });
				console.log('[Share] Note shared and synced to Firebase');
			} catch (error) {
				console.error('[Share] Failed to sync to Firebase immediately, will sync later');
			}
		}

		const shareUrl = `${window.location.origin}/shared/${shareId}`;
		console.log('[Share] Note shared successfully:', shareUrl);

		return { note: updatedNote, shareUrl };
	} catch (error) {
		console.error('[Share] Error sharing note:', error);
		return null;
	}
}

export async function unshareNote(noteId: string): Promise<Note | null> {
	try {
		const note = await getNoteById(noteId);
		if (!note) {
			console.error('[Share] Note not found');
			return null;
		}

		const updatedNote = await updateNote(noteId, {
			isPublic: false,
			shareId: null,
			sharedAt: null,
			synced: false
		});

		if (!updatedNote) {
			console.error('[Share] Failed to update note');
			return null;
		}

		if (get(isOnline)) {
			try {
				await syncNoteToFirebase(updatedNote);
				await updateNote(noteId, { synced: true });
				console.log('[Share] Note unshared and synced to Firebase');
			} catch (error) {
				console.error('[Share] Failed to sync to Firebase immediately, will sync later');
			}
		}

		console.log('[Share] Note unshared successfully');
		return updatedNote;
	} catch (error) {
		console.error('[Share] Error unsharing note:', error);
		return null;
	}
}

export function getShareUrl(shareId: string): string {
	return `${window.location.origin}/shared/${shareId}`;
}

export function copyShareUrlToClipboard(shareUrl: string): Promise<boolean> {
	try {
		if (!navigator.clipboard) {
			const textArea = document.createElement('textarea');
			textArea.value = shareUrl;
			textArea.style.position = 'fixed';
			textArea.style.left = '-999999px';
			textArea.style.top = '-999999px';
			document.body.appendChild(textArea);
			textArea.focus();
			textArea.select();
			document.execCommand('copy');
			document.body.removeChild(textArea);
			return Promise.resolve(true);
		}

		return navigator.clipboard
			.writeText(shareUrl)
			.then(() => true)
			.catch(() => false);
	} catch (error) {
		console.error('[Share] Error copying to clipboard:', error);
		return Promise.resolve(false);
	}
}
