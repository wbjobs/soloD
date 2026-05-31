#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::{Database, Node, Edge};
use std::sync::Arc;
use tauri::State;
use std::fs;

struct AppState {
    db: Arc<Database>,
}

#[tauri::command]
fn get_nodes(state: State<AppState>) -> Result<Vec<Node>, String> {
    state.db.get_nodes().map_err(|e| e.to_string())
}

#[tauri::command]
fn add_node(label: String, x: f64, y: f64, state: State<AppState>) -> Result<Node, String> {
    state.db.add_node(label, x, y).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_node(id: String, label: String, state: State<AppState>) -> Result<Node, String> {
    state.db.update_node(id, label).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_node_position(id: String, x: f64, y: f64, state: State<AppState>) -> Result<Node, String> {
    state.db.update_node_position(id, x, y).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_node(id: String, state: State<AppState>) -> Result<bool, String> {
    state.db.delete_node(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_edges(state: State<AppState>) -> Result<Vec<Edge>, String> {
    state.db.get_edges().map_err(|e| e.to_string())
}

#[tauri::command]
fn add_edge(source: String, target: String, label: String, state: State<AppState>) -> Result<Edge, String> {
    state.db.add_edge(source, target, label).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_edge(id: String, label: String, state: State<AppState>) -> Result<Edge, String> {
    state.db.update_edge(id, label).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_edge(id: String, state: State<AppState>) -> Result<bool, String> {
    state.db.delete_edge(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_db_path(state: State<AppState>) -> Result<String, String> {
    Ok(state.db.path.to_string_lossy().to_string())
}

#[tauri::command]
fn search_nodes(keyword: String, state: State<AppState>) -> Result<Vec<Node>, String> {
    state.db.search_nodes(keyword).map_err(|e| e.to_string())
}

fn main() {
    let context = tauri::generate_context!();
    
    let app_dir = tauri::api::path::app_data_dir(context.config())
        .expect("Failed to get app data directory");
    
    fs::create_dir_all(&app_dir).expect("Failed to create app data directory");
    
    let db_path = app_dir.join("knowledge_graph.db");
    println!("Database path: {:?}", db_path);
    
    let db = Database::new(db_path).expect("Failed to initialize database");
    
    tauri::Builder::default()
        .manage(AppState { db: Arc::new(db) })
        .invoke_handler(tauri::generate_handler![
            get_nodes,
            add_node,
            update_node,
            update_node_position,
            delete_node,
            get_edges,
            add_edge,
            update_edge,
            delete_edge,
            get_db_path,
            search_nodes
        ])
        .run(context)
        .expect("error while running tauri application");
}
