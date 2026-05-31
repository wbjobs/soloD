import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

export interface ClipboardRecord {
  id: number
  original_content: string
  masked_content: string
  sensitive_type: string
  created_at: string
  iv: string
  auth_tag: string
}

export interface Settings {
  [key: string]: string
}

const DEFAULT_SETTINGS: Settings = {
  monitorEnabled: 'true',
  detectIdCard: 'true',
  detectApiKey: 'true',
  detectIP: 'true',
  detectPhone: 'true',
  detectEmail: 'true',
  maskKeepStart: '3',
  maskKeepEnd: '4',
  maskChar: '*'
}

export class DatabaseManager {
  private db: Database.Database

  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'clipboard-guard.db')
    this.db = new Database(dbPath)
    this.initTables()
    this.initDefaultSettings()
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clipboard_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_content TEXT NOT NULL,
        masked_content TEXT NOT NULL,
        sensitive_type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_name TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_records_created ON clipboard_records(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_records_type ON clipboard_records(sensitive_type);
    `)
  }

  private initDefaultSettings() {
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO settings (key_name, value) VALUES (?, ?)
    `)

    Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
      insertStmt.run(key, value)
    })
  }

  insertRecord(record: Omit<ClipboardRecord, 'id' | 'created_at'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO clipboard_records (original_content, masked_content, sensitive_type, iv, auth_tag)
      VALUES (?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      record.original_content,
      record.masked_content,
      record.sensitive_type,
      record.iv,
      record.auth_tag
    )
    return Number(result.lastInsertRowid)
  }

  getRecords(limit: number = 50): ClipboardRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, masked_content, sensitive_type, created_at
      FROM clipboard_records
      ORDER BY created_at DESC
      LIMIT ?
    `)
    return stmt.all(limit) as ClipboardRecord[]
  }

  getRecordById(id: number): ClipboardRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM clipboard_records WHERE id = ?
    `)
    return stmt.get(id) as ClipboardRecord || null
  }

  deleteRecord(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM clipboard_records WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  clearRecords(): boolean {
    const stmt = this.db.prepare('DELETE FROM clipboard_records')
    stmt.run()
    return true
  }

  getStats() {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM clipboard_records')
    const typeStmt = this.db.prepare(`
      SELECT sensitive_type, COUNT(*) as count
      FROM clipboard_records
      GROUP BY sensitive_type
      ORDER BY count DESC
    `)
    const todayStmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM clipboard_records
      WHERE DATE(created_at) = DATE('now')
    `)

    const total = (totalStmt.get() as { count: number }).count
    const byType = typeStmt.all() as { sensitive_type: string; count: number }[]
    const today = (todayStmt.get() as { count: number }).count

    return { total, today, byType }
  }

  getSettings(): Settings {
    const stmt = this.db.prepare('SELECT key_name, value FROM settings')
    const rows = stmt.all() as { key_name: string; value: string }[]
    const settings: Settings = {}
    rows.forEach(row => {
      settings[row.key_name] = row.value
    })
    return settings
  }

  setSetting(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key_name, value)
      VALUES (?, ?)
      ON CONFLICT(key_name) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `)
    stmt.run(key, value, value)
  }

  close() {
    this.db.close()
  }
}

export { DatabaseManager as Database }
