import { invoke } from '@tauri-apps/api/tauri'
import { FileNode, Note, NoteVersion, SearchResult } from '../types'

export async function readDirectory(path: string): Promise<FileNode[]> {
  return invoke('read_directory', { path })
}

export async function readFile(path: string): Promise<string> {
  return invoke('read_file', { path })
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content })
}

export async function createFile(path: string, content: string): Promise<void> {
  return invoke('create_file', { path, content })
}

export async function createDirectory(path: string): Promise<void> {
  return invoke('create_directory', { path })
}

export async function deleteFile(path: string): Promise<void> {
  return invoke('delete_file', { path })
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  return invoke('rename_file', { oldPath, newPath })
}

export async function selectFolder(): Promise<string | null> {
  return invoke('select_folder')
}

export async function saveVersion(
  noteId: string,
  title: string,
  content: string,
  message?: string
): Promise<void> {
  return invoke('save_version', { noteId, title, content, message })
}

export async function getVersions(noteId: string): Promise<NoteVersion[]> {
  return invoke('get_versions', { noteId })
}

export async function restoreVersion(
  noteId: string,
  notePath: string,
  version: NoteVersion
): Promise<void> {
  return invoke('restore_version', { noteId, notePath, version })
}

export async function searchNotes(query: string, folderPath: string): Promise<SearchResult[]> {
  return invoke('search_notes', { query, folderPath })
}

export async function getNotesFromFolder(folderPath: string): Promise<Note[]> {
  return invoke('get_notes_from_folder', { folderPath })
}