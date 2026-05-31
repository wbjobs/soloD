export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  isOpen?: boolean
}

export interface Note {
  id: string
  title: string
  content: string
  path: string
  tags: string[]
  category: string
  createdAt: number
  updatedAt: number
}

export interface NoteVersion {
  id: string
  noteId: string
  content: string
  title: string
  timestamp: number
  message?: string
}

export interface SearchResult {
  note: Note
  matches: {
    line: number
    content: string
    startIndex: number
    endIndex: number
  }[]
}

export interface WikiLink {
  title: string
  path?: string
  exists: boolean
}

export interface Backlink {
  noteId: string
  noteTitle: string
  notePath: string
  context: string
}

export interface AppState {
  notes: Note[]
  versions: NoteVersion[]
  currentNote: Note | null
  fileTree: FileNode[]
  selectedFolder: string | null
  searchQuery: string
  searchResults: SearchResult[]
  tags: string[]
  categories: string[]
  backlinks: Backlink[]
  darkMode: boolean
}