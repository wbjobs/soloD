use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_open: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub path: String,
    pub tags: Vec<String>,
    pub category: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NoteVersion {
    pub id: String,
    #[serde(rename = "noteId")]
    pub note_id: String,
    pub content: String,
    pub title: String,
    pub timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchMatch {
    pub line: usize,
    pub content: String,
    #[serde(rename = "startIndex")]
    pub start_index: usize,
    #[serde(rename = "endIndex")]
    pub end_index: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub note: Note,
    pub matches: Vec<SearchMatch>,
}

struct VersionManager {
    versions_dir: PathBuf,
}

impl VersionManager {
    fn new(app_dir: &Path) -> Self {
        let versions_dir = app_dir.join(".versions");
        if !versions_dir.exists() {
            let _ = fs::create_dir_all(&versions_dir);
        }
        VersionManager { versions_dir }
    }

    fn save_version(&self, note_id: &str, title: &str, content: &str, message: Option<&str>) -> Result<(), String> {
        let note_hash = format!("{}.json", Uuid::new_v4());
        let version = NoteVersion {
            id: Uuid::new_v4().to_string(),
            note_id: note_id.to_string(),
            content: content.to_string(),
            title: title.to_string(),
            timestamp: Utc::now().timestamp_millis(),
            message: message.map(|s| s.to_string()),
        };
        
        let note_versions_dir = self.versions_dir.join(&note_id.replace(':', "_").replace('\\', "_").replace('/', "_"));
        if !note_versions_dir.exists() {
            fs::create_dir_all(&note_versions_dir).map_err(|e| e.to_string())?;
        }
        
        let version_path = note_versions_dir.join(note_hash);
        let json = serde_json::to_string_pretty(&version).map_err(|e| e.to_string())?;
        fs::write(&version_path, json).map_err(|e| e.to_string())?;
        
        Ok(())
    }

    fn get_versions(&self, note_id: &str) -> Result<Vec<NoteVersion>, String> {
        let note_versions_dir = self.versions_dir.join(&note_id.replace(':', "_").replace('\\', "_").replace('/', "_"));
        if !note_versions_dir.exists() {
            return Ok(Vec::new());
        }
        
        let mut versions = Vec::new();
        for entry in WalkDir::new(&note_versions_dir).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    if let Ok(version) = serde_json::from_str::<NoteVersion>(&content) {
                        versions.push(version);
                    }
                }
            }
        }
        
        versions.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        Ok(versions)
    }
}

fn build_file_tree(dir: &Path, root_path: &str) -> Result<Vec<FileNode>> {
    let mut nodes = Vec::new();
    
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            
            if name.starts_with('.') {
                continue;
            }
            
            let path_str = path.to_string_lossy().to_string();
            
            if path.is_dir() {
                let children = build_file_tree(&path, root_path);
                nodes.push(FileNode {
                    name,
                    path: path_str,
                    node_type: "directory".to_string(),
                    children: Some(children.unwrap_or_default()),
                    is_open: Some(false),
                });
            } else if name.ends_with(".md") || name.ends_with(".markdown") {
                nodes.push(FileNode {
                    name,
                    path: path_str,
                    node_type: "file".to_string(),
                    children: None,
                    is_open: None,
                });
            }
        }
    }
    
    nodes.sort_by(|a, b| {
        a.node_type.cmp(&b.node_type).reverse().then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    
    Ok(nodes)
}

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<FileNode>, String> {
    let dir_path = Path::new(&path);
    if !dir_path.exists() {
        return Err("Directory does not exist".to_string());
    }
    build_file_tree(dir_path, &path)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn select_folder(window: tauri::Window) -> Result<Option<String>, String> {
    let dialog = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .pick_folder();
    
    Ok(dialog.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn save_version(
    app_handle: tauri::AppHandle,
    note_id: String,
    title: String,
    content: String,
    message: Option<String>,
) -> Result<(), String> {
    let app_dir = app_handle.path_resolver().app_data_dir().ok_or("Failed to get app data dir")?;
    let version_manager = VersionManager::new(&app_dir);
    version_manager.save_version(&note_id, &title, &content, message.as_deref())
}

#[tauri::command]
fn get_versions(app_handle: tauri::AppHandle, note_id: String) -> Result<Vec<NoteVersion>, String> {
    let app_dir = app_handle.path_resolver().app_data_dir().ok_or("Failed to get app data dir")?;
    let version_manager = VersionManager::new(&app_dir);
    version_manager.get_versions(&note_id)
}

#[tauri::command]
fn restore_version(
    app_handle: tauri::AppHandle,
    note_id: String,
    note_path: String,
    version: NoteVersion,
) -> Result<(), String> {
    fs::write(&note_path, &version.content).map_err(|e| e.to_string())?;
    
    let app_dir = app_handle.path_resolver().app_data_dir().ok_or("Failed to get app data dir")?;
    let version_manager = VersionManager::new(&app_dir);
    version_manager.save_version(
        &note_id,
        &version.title,
        &version.content,
        Some(&format!("恢复版本: {}", version.message.as_deref().unwrap_or("")))
    )
}

#[tauri::command]
fn search_notes(query: String, folder_path: String) -> Result<Vec<SearchResult>, String> {
    let mut results = Vec::new();
    
    for entry in WalkDir::new(&folder_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "md" || ext == "markdown" {
                    if let Ok(content) = fs::read_to_string(path) {
                        let mut matches = Vec::new();
                        let query_lower = query.to_lowercase();
                        
                        for (line_num, line) in content.lines().enumerate() {
                            let line_lower = line.to_lowercase();
                            let mut start = 0;
                            while let Some(pos) = line_lower[start..].find(&query_lower) {
                                let actual_start = start + pos;
                                let actual_end = actual_start + query.len();
                                matches.push(SearchMatch {
                                    line: line_num + 1,
                                    content: line.to_string(),
                                    start_index: actual_start,
                                    end_index: actual_end,
                                });
                                start = actual_start + 1;
                            }
                        }
                        
                        if !matches.is_empty() {
                            let note = Note {
                                id: path.to_string_lossy().to_string(),
                                title: path.file_stem().unwrap_or_default().to_string_lossy().to_string(),
                                content: content.clone(),
                                path: path.to_string_lossy().to_string(),
                                tags: Vec::new(),
                                category: String::new(),
                                created_at: Utc::now().timestamp_millis(),
                                updated_at: Utc::now().timestamp_millis(),
                            };
                            results.push(SearchResult { note, matches });
                        }
                    }
                }
            }
        }
    }
    
    Ok(results)
}

#[tauri::command]
fn get_notes_from_folder(folder_path: String) -> Result<Vec<Note>, String> {
    let mut notes = Vec::new();
    
    for entry in WalkDir::new(&folder_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "md" || ext == "markdown" {
                    if let Ok(content) = fs::read_to_string(path) {
                        let metadata = fs::metadata(path).ok();
                        notes.push(Note {
                            id: path.to_string_lossy().to_string(),
                            title: path.file_stem().unwrap_or_default().to_string_lossy().to_string(),
                            content,
                            path: path.to_string_lossy().to_string(),
                            tags: Vec::new(),
                            category: String::new(),
                            created_at: metadata.as_ref().and_then(|m| m.created().ok()).map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64).unwrap_or(0),
                            updated_at: metadata.as_ref().and_then(|m| m.modified().ok()).map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64).unwrap_or(0),
                        });
                    }
                }
            }
        }
    }
    
    Ok(notes)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_directory,
            read_file,
            write_file,
            create_file,
            create_directory,
            delete_file,
            rename_file,
            select_folder,
            save_version,
            get_versions,
            restore_version,
            search_notes,
            get_notes_from_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}