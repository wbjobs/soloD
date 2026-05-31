use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::sync::Mutex;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Node {
    pub id: String,
    pub label: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub label: String,
}

pub struct Database {
    conn: Mutex<Connection>,
    pub path: PathBuf,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(&db_path)?;
        Self::init_tables(&conn)?;
        Ok(Database {
            conn: Mutex::new(conn),
            path: db_path,
        })
    }

    fn init_tables(conn: &Connection) -> Result<()> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS nodes (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS edges (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                target TEXT NOT NULL,
                label TEXT,
                FOREIGN KEY (source) REFERENCES nodes(id),
                FOREIGN KEY (target) REFERENCES nodes(id)
            )",
            [],
        )?;

        Ok(())
    }

    pub fn get_nodes(&self) -> Result<Vec<Node>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, label, x, y FROM nodes")?;
        let nodes = stmt.query_map([], |row| {
            Ok(Node {
                id: row.get(0)?,
                label: row.get(1)?,
                x: row.get(2)?,
                y: row.get(3)?,
            })
        })?;

        nodes.collect()
    }

    pub fn add_node(&self, label: String, x: f64, y: f64) -> Result<Node> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO nodes (id, label, x, y) VALUES (?1, ?2, ?3, ?4)",
            params![id, label, x, y],
        )?;

        Ok(Node { id, label, x, y })
    }

    pub fn update_node(&self, id: String, label: String) -> Result<Node> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE nodes SET label = ?1 WHERE id = ?2",
            params![label, id],
        )?;

        let mut stmt = conn.prepare("SELECT id, label, x, y FROM nodes WHERE id = ?1")?;
        let node = stmt.query_row(params![id], |row| {
            Ok(Node {
                id: row.get(0)?,
                label: row.get(1)?,
                x: row.get(2)?,
                y: row.get(3)?,
            })
        })?;

        Ok(node)
    }

    pub fn update_node_position(&self, id: String, x: f64, y: f64) -> Result<Node> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE nodes SET x = ?1, y = ?2 WHERE id = ?3",
            params![x, y, id],
        )?;

        let mut stmt = conn.prepare("SELECT id, label, x, y FROM nodes WHERE id = ?1")?;
        let node = stmt.query_row(params![id], |row| {
            Ok(Node {
                id: row.get(0)?,
                label: row.get(1)?,
                x: row.get(2)?,
                y: row.get(3)?,
            })
        })?;

        Ok(node)
    }

    pub fn delete_node(&self, id: String) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM edges WHERE source = ?1 OR target = ?1", params![id])?;
        let affected = conn.execute("DELETE FROM nodes WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }

    pub fn get_edges(&self) -> Result<Vec<Edge>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, source, target, label FROM edges")?;
        let edges = stmt.query_map([], |row| {
            Ok(Edge {
                id: row.get(0)?,
                source: row.get(1)?,
                target: row.get(2)?,
                label: row.get(3)?,
            })
        })?;

        edges.collect()
    }

    pub fn add_edge(&self, source: String, target: String, label: String) -> Result<Edge> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO edges (id, source, target, label) VALUES (?1, ?2, ?3, ?4)",
            params![id, source, target, label],
        )?;

        Ok(Edge { id, source, target, label })
    }

    pub fn update_edge(&self, id: String, label: String) -> Result<Edge> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE edges SET label = ?1 WHERE id = ?2",
            params![label, id],
        )?;

        let mut stmt = conn.prepare("SELECT id, source, target, label FROM edges WHERE id = ?1")?;
        let edge = stmt.query_row(params![id], |row| {
            Ok(Edge {
                id: row.get(0)?,
                source: row.get(1)?,
                target: row.get(2)?,
                label: row.get(3)?,
            })
        })?;

        Ok(edge)
    }

    pub fn delete_edge(&self, id: String) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let affected = conn.execute("DELETE FROM edges WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }

    pub fn search_nodes(&self, keyword: String) -> Result<Vec<Node>> {
        let conn = self.conn.lock().unwrap();
        let search_pattern = format!("%{}%", keyword);
        let mut stmt = conn.prepare(
            "SELECT id, label, x, y FROM nodes WHERE label LIKE ?1"
        )?;
        let nodes = stmt.query_map(params![search_pattern], |row| {
            Ok(Node {
                id: row.get(0)?,
                label: row.get(1)?,
                x: row.get(2)?,
                y: row.get(3)?,
            })
        })?;

        nodes.collect()
    }
}
