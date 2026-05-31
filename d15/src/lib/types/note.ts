export interface Note {
	id: string;
	title: string;
	content: string;
	createdAt: Date;
	updatedAt: Date;
	synced: boolean;
	isDeleted: boolean;
	isPublic: boolean;
	shareId: string | null;
	sharedAt: Date | null;
}

export type NoteCreate = Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'synced' | 'isDeleted' | 'isPublic' | 'shareId' | 'sharedAt'>;
export type NoteUpdate = Partial<Omit<Note, 'id' | 'createdAt'>>;
