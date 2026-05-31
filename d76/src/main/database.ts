import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

export interface SerialRecord {
  id?: number
  timestamp: number
  type: 'send' | 'receive'
  data: string
  hexData: string
  port: string
}

class DatabaseManager {
  private db: Database.Database | null = null

  init() {
    const dbPath = path.join(app.getPath('userData'), 'serial-terminal.db')
    this.db = new Database(dbPath)
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS serial_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        hexData TEXT NOT NULL,
        port TEXT NOT NULL
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON serial_records(timestamp)
    `)
  }

  insertRecord(record: Omit<SerialRecord, 'id'>): number {
    if (!this.db) throw new Error('Database not initialized')
    
    const stmt = this.db.prepare(`
      INSERT INTO serial_records (timestamp, type, data, hexData, port)
      VALUES (?, ?, ?, ?, ?)
    `)
    
    const result = stmt.run(
      record.timestamp,
      record.type,
      record.data,
      record.hexData,
      record.port
    )
    
    return Number(result.lastInsertRowid)
  }

  queryRecords(startTime?: number, endTime?: number, limit: number = 100): SerialRecord[] {
    if (!this.db) throw new Error('Database not initialized')
    
    let query = 'SELECT * FROM serial_records'
    const params: (number | string)[] = []
    
    if (startTime || endTime) {
      query += ' WHERE 1=1'
      if (startTime) {
        query += ' AND timestamp >= ?'
        params.push(startTime)
      }
      if (endTime) {
        query += ' AND timestamp <= ?'
        params.push(endTime)
      }
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ?'
    params.push(limit)
    
    const stmt = this.db.prepare(query)
    return stmt.all(...params) as SerialRecord[]
  }

  close() {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

export const dbManager = new DatabaseManager()
