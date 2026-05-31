import { openDB, type DBSchema, type IDBPDatabase, type StoreKey, type StoreValue } from 'idb';
import type { Note, NoteCreate, NoteUpdate } from '../types/note';

interface NotesDB extends DBSchema {
	notes: {
		key: string;
		value: Note;
		indexes: {
			'by-updatedAt': Date;
			'by-synced': boolean;
			'by-isDeleted': boolean;
		};
	};
}

type NotesStore = NotesDB['notes'];
type NoteKey = StoreKey<NotesDB, 'notes'>;
type NoteValue = StoreValue<NotesDB, 'notes'>;

const DB_NAME = 'notes-db';
const STORE_NAME = 'notes';
const DB_VERSION = 2;

class NotesDatabase {
	private static instance: NotesDatabase | null = null;
	private dbPromise: Promise<IDBPDatabase<NotesDB>> | null = null;

	private constructor() {}

	public static getInstance(): NotesDatabase {
		if (!NotesDatabase.instance) {
			NotesDatabase.instance = new NotesDatabase();
		}
		return NotesDatabase.instance;
	}

	private async getDB(): Promise<IDBPDatabase<NotesDB>> {
		if (!this.dbPromise) {
			this.dbPromise = openDB<NotesDB>(DB_NAME, DB_VERSION, {
				upgrade: (db, oldVersion, newVersion, transaction) => {
					console.log(`[IndexedDB] Upgrading from version ${oldVersion} to ${newVersion}`);

					let store: ReturnType<typeof db.createObjectStore<NotesStore>>;
					if (!db.objectStoreNames.contains(STORE_NAME)) {
						store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
					} else {
						store = transaction.objectStore(STORE_NAME);
					}

					const indexNames = Array.from(store.indexNames);

					if (!indexNames.includes('by-updatedAt')) {
						store.createIndex('by-updatedAt', 'updatedAt');
					}

					if (!indexNames.includes('by-synced')) {
						store.createIndex('by-synced', 'synced');
					}

					if (!indexNames.includes('by-isDeleted')) {
						store.createIndex('by-isDeleted', 'isDeleted');
					}
				},
				blocked: () => {
					console.warn('[IndexedDB] Database upgrade blocked by another tab');
				},
				blocking: () => {
					console.log('[IndexedDB] Database is blocking upgrade in another tab');
				},
				terminated: () => {
					console.error('[IndexedDB] Database connection terminated unexpectedly');
					this.dbPromise = null;
				}
			});
		}
		return this.dbPromise;
	}

	public async getAllActiveNotes(): Promise<Note[]> {
		try {
			const db = await this.getDB();
			const allNotes = await db.getAllFromIndex(STORE_NAME, 'by-updatedAt', null, 'prev');
			return allNotes.filter((note) => !note.isDeleted);
		} catch (error) {
			console.error('[IndexedDB] Error getting all notes:', error);
			throw error;
		}
	}

	public async getNoteById(id: NoteKey): Promise<Note | undefined> {
		try {
			const db = await this.getDB();
			return await db.get(STORE_NAME, id);
		} catch (error) {
			console.error('[IndexedDB] Error getting note by id:', error);
			throw error;
		}
	}

	public async createNote(noteData: NoteCreate): Promise<Note> {
		try {
			const db = await this.getDB();
			const now = new Date();
			const note: Note = {
				...noteData,
				id: crypto.randomUUID(),
				createdAt: now,
				updatedAt: now,
				synced: false,
				isDeleted: false,
				isPublic: false,
				shareId: null,
				sharedAt: null
			};
			await db.put(STORE_NAME, note);
			console.log('[IndexedDB] Note created:', note.id);
			return note;
		} catch (error) {
			console.error('[IndexedDB] Error creating note:', error);
			throw error;
		}
	}

	public async updateNote(id: NoteKey, noteData: NoteUpdate): Promise<Note | undefined> {
		try {
			const db = await this.getDB();
			const existingNote = await db.get(STORE_NAME, id);

			if (!existingNote) {
				console.warn('[IndexedDB] Note not found for update:', id);
				return undefined;
			}

			const updatedNote: Note = {
				...existingNote,
				...noteData,
				updatedAt: new Date(),
				synced: false
			};

			await db.put(STORE_NAME, updatedNote);
			console.log('[IndexedDB] Note updated:', id);
			return updatedNote;
		} catch (error) {
			console.error('[IndexedDB] Error updating note:', error);
			throw error;
		}
	}

	public async softDeleteNote(id: NoteKey): Promise<boolean> {
		try {
			const db = await this.getDB();
			const note = await db.get(STORE_NAME, id);

			if (!note) {
				console.warn('[IndexedDB] Note not found for deletion:', id);
				return false;
			}

			note.isDeleted = true;
			note.updatedAt = new Date();
			note.synced = false;

			await db.put(STORE_NAME, note);
			console.log('[IndexedDB] Note soft deleted:', id);
			return true;
		} catch (error) {
			console.error('[IndexedDB] Error soft deleting note:', error);
			throw error;
		}
	}

	public async hardDeleteNote(id: NoteKey): Promise<boolean> {
		try {
			const db = await this.getDB();
			await db.delete(STORE_NAME, id);
			console.log('[IndexedDB] Note hard deleted:', id);
			return true;
		} catch (error) {
			console.error('[IndexedDB] Error hard deleting note:', error);
			throw error;
		}
	}

	public async getUnsyncedNotes(): Promise<Note[]> {
		try {
			const db = await this.getDB();
			return await db.getAllFromIndex(STORE_NAME, 'by-synced', false);
		} catch (error) {
			console.error('[IndexedDB] Error getting unsynced notes:', error);
			throw error;
		}
	}

	public async hasUnsyncedNotes(): Promise<boolean> {
		try {
			const unsynced = await this.getUnsyncedNotes();
			return unsynced.length > 0;
		} catch (error) {
			console.error('[IndexedDB] Error checking unsynced notes:', error);
			return false;
		}
	}

	public async markNoteAsSynced(id: NoteKey): Promise<boolean> {
		try {
			const db = await this.getDB();
			const note = await db.get(STORE_NAME, id);

			if (!note) {
				console.warn('[IndexedDB] Note not found for marking as synced:', id);
				return false;
			}

			note.synced = true;
			await db.put(STORE_NAME, note);
			console.log('[IndexedDB] Note marked as synced:', id);
			return true;
		} catch (error) {
			console.error('[IndexedDB] Error marking note as synced:', error);
			throw error;
		}
	}

	public async markNotesAsSynced(ids: NoteKey[]): Promise<void> {
		try {
			const db = await this.getDB();
			const tx = db.transaction(STORE_NAME, 'readwrite');

			await Promise.all(
				ids.map(async (id) => {
					const note = await tx.store.get(id);
					if (note) {
						note.synced = true;
						await tx.store.put(note);
					}
				})
			);

			await tx.done;
			console.log('[IndexedDB] Batch marked notes as synced:', ids.length);
		} catch (error) {
			console.error('[IndexedDB] Error batch marking notes as synced:', error);
			throw error;
		}
	}

	public async bulkUpsertNotes(notes: NoteValue[]): Promise<void> {
		try {
			const db = await this.getDB();
			const tx = db.transaction(STORE_NAME, 'readwrite');

			await Promise.all([...notes.map((note) => tx.store.put(note)), tx.done]);
			console.log('[IndexedDB] Bulk upserted notes:', notes.length);
		} catch (error) {
			console.error('[IndexedDB] Error bulk upserting notes:', error);
			throw error;
		}
	}

	public async getNoteCount(): Promise<number> {
		try {
			const db = await this.getDB();
			return await db.count(STORE_NAME);
		} catch (error) {
			console.error('[IndexedDB] Error getting note count:', error);
			throw error;
		}
	}

	public async getNotesUpdatedAfter(timestamp: Date): Promise<Note[]> {
		try {
			const db = await this.getDB();
			const allNotes = await db.getAllFromIndex(STORE_NAME, 'by-updatedAt', null, 'prev');
			return allNotes.filter((note) => note.updatedAt > timestamp && !note.isDeleted);
		} catch (error) {
			console.error('[IndexedDB] Error getting notes updated after timestamp:', error);
			throw error;
		}
	}

	public async searchNotes(query: string): Promise<Note[]> {
		try {
			const db = await this.getDB();
			const allNotes = await db.getAllFromIndex(STORE_NAME, 'by-updatedAt', null, 'prev');
			const lowerQuery = query.toLowerCase();

			return allNotes.filter(
				(note) =>
					!note.isDeleted &&
					(note.title.toLowerCase().includes(lowerQuery) ||
						note.content.toLowerCase().includes(lowerQuery))
			);
		} catch (error) {
			console.error('[IndexedDB] Error searching notes:', error);
			throw error;
		}
	}

	public async clearAllNotes(): Promise<void> {
		try {
			const db = await this.getDB();
			await db.clear(STORE_NAME);
			console.log('[IndexedDB] All notes cleared');
		} catch (error) {
			console.error('[IndexedDB] Error clearing all notes:', error);
			throw error;
		}
	}

	public async deleteDatabase(): Promise<void> {
		try {
			if (this.dbPromise) {
				const db = await this.dbPromise;
				db.close();
				this.dbPromise = null;
			}

			await indexedDB.deleteDatabase(DB_NAME);
			NotesDatabase.instance = null;
			console.log('[IndexedDB] Database deleted');
		} catch (error) {
			console.error('[IndexedDB] Error deleting database:', error);
			throw error;
		}
	}
}

export const notesDB = NotesDatabase.getInstance();

export const getAllNotes = () => notesDB.getAllActiveNotes();
export const getNoteById = (id: string) => notesDB.getNoteById(id);
export const createNote = (noteData: NoteCreate) => notesDB.createNote(noteData);
export const updateNote = (id: string, noteData: NoteUpdate) => notesDB.updateNote(id, noteData);
export const deleteNote = (id: string) => notesDB.softDeleteNote(id);
export const hardDeleteNote = (id: string) => notesDB.hardDeleteNote(id);
export const getUnsyncedNotes = () => notesDB.getUnsyncedNotes();
export const hasUnsyncedNotes = () => notesDB.hasUnsyncedNotes();
export const markNoteAsSynced = (id: string) => notesDB.markNoteAsSynced(id);
export const markNotesAsSynced = (ids: string[]) => notesDB.markNotesAsSynced(ids);
export const bulkUpsertNotes = (notes: Note[]) => notesDB.bulkUpsertNotes(notes);
export const getNoteCount = () => notesDB.getNoteCount();
export const getNotesUpdatedAfter = (timestamp: Date) => notesDB.getNotesUpdatedAfter(timestamp);
export const searchNotes = (query: string) => notesDB.searchNotes(query);
export const clearAllNotes = () => notesDB.clearAllNotes();
export const deleteDatabase = () => notesDB.deleteDatabase();

