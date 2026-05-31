import sqlite3
import json
import threading
import time
from datetime import datetime

DB_NAME = 'ik_history.db'

db_lock = threading.Lock()

MAX_RETRIES = 5
RETRY_DELAY = 0.1


def init_db():
    with db_lock:
        conn = None
        try:
            conn = sqlite3.connect(DB_NAME, timeout=10.0)
            cursor = conn.cursor()
            
            cursor.execute('PRAGMA journal_mode=WAL')
            cursor.execute('PRAGMA busy_timeout=5000')
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS ik_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    target_x REAL NOT NULL,
                    target_y REAL NOT NULL,
                    target_z REAL NOT NULL,
                    angles_rad TEXT,
                    angles_deg TEXT,
                    position TEXT,
                    error REAL,
                    success BOOLEAN,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            conn.commit()
        finally:
            if conn:
                conn.close()


def save_record(target_x, target_y, target_z, result):
    for attempt in range(MAX_RETRIES):
        try:
            with db_lock:
                conn = sqlite3.connect(DB_NAME, timeout=10.0)
                cursor = conn.cursor()
                
                try:
                    cursor.execute('''
                        INSERT INTO ik_records 
                        (target_x, target_y, target_z, angles_rad, angles_deg, position, error, success)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        float(target_x) if target_x is not None else 0.0,
                        float(target_y) if target_y is not None else 0.0,
                        float(target_z) if target_z is not None else 0.0,
                        json.dumps(result.get('angles_rad', [])),
                        json.dumps(result.get('angles_deg', [])),
                        json.dumps(result.get('position', [])),
                        float(result.get('error', 0)) if result.get('error') is not None else 0.0,
                        bool(result.get('success', False))
                    ))
                    
                    conn.commit()
                    record_id = cursor.lastrowid
                    return record_id
                finally:
                    conn.close()
                    
        except sqlite3.OperationalError as e:
            if 'database is locked' in str(e) and attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
                continue
            raise
        except Exception:
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
                continue
            raise
    
    raise Exception('Failed to save record after max retries')


def get_recent_records(limit=50):
    for attempt in range(MAX_RETRIES):
        try:
            with db_lock:
                conn = sqlite3.connect(DB_NAME, timeout=10.0)
                cursor = conn.cursor()
                
                try:
                    cursor.execute('''
                        SELECT id, target_x, target_y, target_z, angles_deg, error, success, created_at
                        FROM ik_records
                        ORDER BY created_at DESC
                        LIMIT ?
                    ''', (limit,))
                    
                    records = cursor.fetchall()
                    
                    return [
                        {
                            'id': r[0],
                            'target': {'x': r[1], 'y': r[2], 'z': r[3]},
                            'angles_deg': json.loads(r[4]) if r[4] else [],
                            'error': r[5],
                            'success': bool(r[6]),
                            'created_at': r[7]
                        }
                        for r in records
                    ]
                finally:
                    conn.close()
                    
        except sqlite3.OperationalError as e:
            if 'database is locked' in str(e) and attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
                continue
            return []
        except Exception:
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
                continue
            return []
    
    return []


def get_record_by_id(record_id):
    for attempt in range(MAX_RETRIES):
        try:
            with db_lock:
                conn = sqlite3.connect(DB_NAME, timeout=10.0)
                cursor = conn.cursor()
                
                try:
                    cursor.execute('''
                        SELECT id, target_x, target_y, target_z, angles_rad, angles_deg, position, error, success, created_at
                        FROM ik_records
                        WHERE id = ?
                    ''', (record_id,))
                    
                    r = cursor.fetchone()
                    
                    if r:
                        return {
                            'id': r[0],
                            'target': {'x': r[1], 'y': r[2], 'z': r[3]},
                            'angles_rad': json.loads(r[4]) if r[4] else [],
                            'angles_deg': json.loads(r[5]) if r[5] else [],
                            'position': json.loads(r[6]) if r[6] else [],
                            'error': r[7],
                            'success': bool(r[8]),
                            'created_at': r[9]
                        }
                    return None
                finally:
                    conn.close()
                    
        except sqlite3.OperationalError as e:
            if 'database is locked' in str(e) and attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
                continue
            return None
        except Exception:
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
                continue
            return None
    
    return None
