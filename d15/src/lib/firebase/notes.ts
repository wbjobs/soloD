import {
	collection,
	doc,
	setDoc,
	deleteDoc,
	getDocs,
	getDoc,
	query,
	where,
	writeBatch
} from 'firebase/firestore';
import { db } from './config';
import type { Note } from '../types/note';

const NOTES_COLLECTION = 'notes';

interface FirestoreNote {
	title: string;
	content: string;
	createdAt: Date;
	updatedAt: Date;
	isPublic: boolean;
	shareId: string | null;
	sharedAt: Date | null;
}

export async function syncNoteToFirebase(note: Note): Promise<void> {
	const noteRef = doc(db, NOTES_COLLECTION, note.id);
	if (note.isDeleted) {
		await deleteDoc(noteRef);
	} else {
		const noteData: FirestoreNote = {
			title: note.title,
			content: note.content,
			createdAt: note.createdAt,
			updatedAt: note.updatedAt,
			isPublic: note.isPublic,
			shareId: note.shareId,
			sharedAt: note.sharedAt
		};
		await setDoc(noteRef, noteData);
	}
}

export async function syncNotesToFirebase(notes: Note[]): Promise<void> {
	const batch = writeBatch(db);
	notes.forEach((note) => {
		const noteRef = doc(db, NOTES_COLLECTION, note.id);
		if (note.isDeleted) {
			batch.delete(noteRef);
		} else {
			const noteData: FirestoreNote = {
				title: note.title,
				content: note.content,
				createdAt: note.createdAt,
				updatedAt: note.updatedAt,
				isPublic: note.isPublic,
				shareId: note.shareId,
				sharedAt: note.sharedAt
			};
			batch.set(noteRef, noteData);
		}
	});
	await batch.commit();
}

export async function fetchAllNotesFromFirebase(): Promise<Note[]> {
	const notesRef = collection(db, NOTES_COLLECTION);
	const snapshot = await getDocs(notesRef);
	return snapshot.docs.map((docSnapshot) => ({
		id: docSnapshot.id,
		...docSnapshot.data(),
		synced: true,
		isDeleted: false
	})) as Note[];
}

export async function fetchNotesUpdatedAfter(timestamp: Date): Promise<Note[]> {
	const notesRef = collection(db, NOTES_COLLECTION);
	const q = query(notesRef, where('updatedAt', '>', timestamp));
	const snapshot = await getDocs(q);
	return snapshot.docs.map((docSnapshot) => ({
		id: docSnapshot.id,
		...docSnapshot.data(),
		synced: true,
		isDeleted: false
	})) as Note[];
}

export async function fetchPublicNoteByShareId(shareId: string): Promise<Note | null> {
	try {
		const notesRef = collection(db, NOTES_COLLECTION);
		const q = query(notesRef, where('shareId', '==', shareId), where('isPublic', '==', true));
		const snapshot = await getDocs(q);

		if (snapshot.empty) {
			return null;
		}

		const docSnapshot = snapshot.docs[0];
		return {
			id: docSnapshot.id,
			...docSnapshot.data(),
			synced: true,
			isDeleted: false
		} as Note;
	} catch (error) {
		console.error('[Firebase] Error fetching public note:', error);
		return null;
	}
}

export async function generateShareId(): Promise<string> {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
