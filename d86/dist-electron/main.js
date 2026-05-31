"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const electron = require("electron");
const path$1 = require("node:path");
const child_process = require("child_process");
const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
class SensitiveDetector {
  constructor() {
    __publicField(this, "patterns", {
      idCard: /(^|\D)([1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx])($|\D)/,
      phone: /(^|\D)(1[3-9]\d{9})($|\D)/,
      email: /(^|\D)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})($|\D)/,
      ip: /(^|\D)((?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))($|\D)/,
      apiKey: /(^|\W)(sk_[a-zA-Z0-9]{20,}|pk_[a-zA-Z0-9]{20,}|api[_-]?key|secret[_-]?key[a-zA-Z0-9_]*\s*[=:]\s*['"]?[a-zA-Z0-9]{16,}['"]?)/i
    });
    __publicField(this, "typeNames", {
      idCard: "身份证号",
      phone: "手机号",
      email: "邮箱",
      ip: "IP地址",
      apiKey: "API密钥"
    });
  }
  detect(text, enabledTypes = ["idCard", "phone", "email", "ip", "apiKey"]) {
    for (const type of enabledTypes) {
      const pattern = this.patterns[type];
      if (pattern) {
        const match = text.match(pattern);
        if (match) {
          const matchedText = match[2] || match[0].trim();
          return {
            detected: true,
            type: this.typeNames[type] || type,
            matches: [matchedText]
          };
        }
      }
    }
    return null;
  }
  getAllTypes() {
    return Object.keys(this.patterns);
  }
  getTypeName(type) {
    return this.typeNames[type] || type;
  }
}
class DataMasker {
  mask(text, keepStart = 3, keepEnd = 4, maskChar = "*") {
    if (text.length <= keepStart + keepEnd) {
      return maskChar.repeat(text.length);
    }
    const start = text.substring(0, keepStart);
    const middle = maskChar.repeat(text.length - keepStart - keepEnd);
    const end = text.substring(text.length - keepEnd);
    return start + middle + end;
  }
  maskEmail(email) {
    const [username, domain] = email.split("@");
    if (!domain) return this.mask(email);
    const maskedUsername = this.mask(username, 2, 1);
    return `${maskedUsername}@${domain}`;
  }
  maskIP(ip) {
    const parts = ip.split(".");
    if (parts.length !== 4) return this.mask(ip);
    return `${parts[0]}.${"*".repeat(3)}.${"*".repeat(3)}.${parts[3]}`;
  }
  maskByType(text, type, keepStart, keepEnd, maskChar) {
    switch (type) {
      case "邮箱":
        return this.maskEmail(text);
      case "IP地址":
        return this.maskIP(text);
      default:
        return this.mask(text, keepStart, keepEnd, maskChar);
    }
  }
}
function readClipboard() {
  try {
    if (process.platform === "win32") {
      const result = child_process.execSync('powershell.exe -NoProfile -Command "Get-Clipboard -Raw"', {
        encoding: "utf8",
        timeout: 500,
        stdio: ["pipe", "pipe", "ignore"]
      });
      return result.replace(/\r\n$/, "\n").trimEnd();
    } else {
      const { execSync: execSync2 } = require("child_process");
      const result = execSync2("xclip -selection clipboard -o 2>/dev/null || pbpaste 2>/dev/null", {
        encoding: "utf8",
        timeout: 500
      });
      return result;
    }
  } catch (e) {
    return "";
  }
}
function writeClipboard(text) {
  try {
    if (process.platform === "win32") {
      const escapedText = text.replace(/"/g, '`"').replace(/\$/g, "`$");
      child_process.execSync(`powershell.exe -NoProfile -Command "Set-Clipboard -Value "${escapedText}""`, {
        timeout: 500,
        stdio: ["pipe", "pipe", "ignore"]
      });
    } else {
      const { execSync: execSync2 } = require("child_process");
      execSync2(`echo -n "${text.replace(/"/g, '\\"')}" | xclip -selection clipboard 2>/dev/null || echo -n "${text.replace(/"/g, '\\"')}" | pbcopy 2>/dev/null`, {
        timeout: 500
      });
    }
  } catch (e) {
    console.error("Failed to write clipboard:", e);
  }
}
class ClipboardMonitor {
  constructor(db2, encryption2) {
    __publicField(this, "db");
    __publicField(this, "encryption");
    __publicField(this, "detector");
    __publicField(this, "masker");
    __publicField(this, "lastContent", "");
    __publicField(this, "intervalId", null);
    __publicField(this, "isRunningFlag", false);
    __publicField(this, "isProcessing", false);
    this.db = db2;
    this.encryption = encryption2;
    this.detector = new SensitiveDetector();
    this.masker = new DataMasker();
  }
  start(callback) {
    if (this.isRunningFlag) return;
    this.isRunningFlag = true;
    this.lastContent = readClipboard();
    this.intervalId = setInterval(() => {
      this.checkClipboard(callback);
    }, 150);
  }
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunningFlag = false;
  }
  isRunning() {
    return this.isRunningFlag;
  }
  checkClipboard(callback) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      const currentContent = readClipboard();
      if (currentContent && currentContent !== this.lastContent) {
        this.lastContent = currentContent;
        const settings = this.db.getSettings();
        const enabledTypes = this.detector.getAllTypes().filter(
          (type) => settings[`detect${type.charAt(0).toUpperCase() + type.slice(1)}`] === "true"
        );
        const result = this.detector.detect(currentContent, enabledTypes);
        if (result && result.matches.length > 0) {
          const sensitiveText = result.matches[0];
          const keepStart = parseInt(settings.maskKeepStart || "3");
          const keepEnd = parseInt(settings.maskKeepEnd || "4");
          const maskChar = settings.maskChar || "*";
          const maskedText = this.masker.maskByType(sensitiveText, result.type, keepStart, keepEnd, maskChar);
          const maskedContent = currentContent.replace(sensitiveText, maskedText);
          const { encrypted, iv, authTag } = this.encryption.encrypt(currentContent);
          const recordId = this.db.insertRecord({
            original_content: encrypted,
            masked_content: maskedText,
            sensitive_type: result.type,
            iv,
            auth_tag: authTag
          });
          writeClipboard(maskedContent);
          this.lastContent = maskedContent;
          if (callback) {
            const record = this.db.getRecordById(recordId);
            callback(record);
          }
        }
      }
    } catch (error) {
      console.error("Clipboard monitor error:", error);
    } finally {
      this.isProcessing = false;
    }
  }
}
const DEFAULT_SETTINGS = {
  monitorEnabled: "true",
  detectIdCard: "true",
  detectApiKey: "true",
  detectIP: "true",
  detectPhone: "true",
  detectEmail: "true",
  maskKeepStart: "3",
  maskKeepEnd: "4",
  maskChar: "*"
};
class DatabaseManager {
  constructor() {
    __publicField(this, "db");
    const dbPath = path.join(electron.app.getPath("userData"), "clipboard-guard.db");
    this.db = new Database(dbPath);
    this.initTables();
    this.initDefaultSettings();
  }
  initTables() {
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
    `);
  }
  initDefaultSettings() {
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO settings (key_name, value) VALUES (?, ?)
    `);
    Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
      insertStmt.run(key, value);
    });
  }
  insertRecord(record) {
    const stmt = this.db.prepare(`
      INSERT INTO clipboard_records (original_content, masked_content, sensitive_type, iv, auth_tag)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      record.original_content,
      record.masked_content,
      record.sensitive_type,
      record.iv,
      record.auth_tag
    );
    return Number(result.lastInsertRowid);
  }
  getRecords(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT id, masked_content, sensitive_type, created_at
      FROM clipboard_records
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }
  getRecordById(id) {
    const stmt = this.db.prepare(`
      SELECT * FROM clipboard_records WHERE id = ?
    `);
    return stmt.get(id) || null;
  }
  deleteRecord(id) {
    const stmt = this.db.prepare("DELETE FROM clipboard_records WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }
  clearRecords() {
    const stmt = this.db.prepare("DELETE FROM clipboard_records");
    stmt.run();
    return true;
  }
  getStats() {
    const totalStmt = this.db.prepare("SELECT COUNT(*) as count FROM clipboard_records");
    const typeStmt = this.db.prepare(`
      SELECT sensitive_type, COUNT(*) as count
      FROM clipboard_records
      GROUP BY sensitive_type
      ORDER BY count DESC
    `);
    const todayStmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM clipboard_records
      WHERE DATE(created_at) = DATE('now')
    `);
    const total = totalStmt.get().count;
    const byType = typeStmt.all();
    const today = todayStmt.get().count;
    return { total, today, byType };
  }
  getSettings() {
    const stmt = this.db.prepare("SELECT key_name, value FROM settings");
    const rows = stmt.all();
    const settings = {};
    rows.forEach((row) => {
      settings[row.key_name] = row.value;
    });
    return settings;
  }
  setSetting(key, value) {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key_name, value)
      VALUES (?, ?)
      ON CONFLICT(key_name) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(key, value, value);
  }
  close() {
    this.db.close();
  }
}
const ALGORITHM = "aes-256-gcm";
const KEY_SIZE = 32;
const IV_SIZE = 16;
class Encryption {
  constructor() {
    __publicField(this, "key");
    this.key = this.loadOrGenerateKey();
  }
  loadOrGenerateKey() {
    const keyPath = path.join(electron.app.getPath("userData"), ".encryption-key");
    if (fs.existsSync(keyPath)) {
      const keyHex = fs.readFileSync(keyPath, "utf8");
      return Buffer.from(keyHex, "hex");
    }
    const key = crypto.randomBytes(KEY_SIZE);
    fs.writeFileSync(keyPath, key.toString("hex"), { mode: 384 });
    return key;
  }
  encrypt(text) {
    const iv = crypto.randomBytes(IV_SIZE);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return {
      encrypted,
      iv: iv.toString("hex"),
      authTag
    };
  }
  decrypt(encryptedHex, ivHex, authTagHex) {
    try {
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error) {
      console.error("Decryption failed:", error);
      return "[解密失败]";
    }
  }
}
process.env.DIST_ELECTRON = path$1.join(__dirname, "..");
process.env.DIST = path$1.join(process.env.DIST_ELECTRON, "../dist");
process.env.PUBLIC = process.env.VITE_DEV_SERVER_URL ? path$1.join(process.env.DIST_ELECTRON, "../public") : process.env.DIST;
let win;
const preload = path$1.join(__dirname, "../preload/preload.js");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
let db;
let encryption;
let clipboardMonitor;
function createWindow() {
  win = new electron.BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    icon: path$1.join(process.env.PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: "default",
    backgroundColor: "#1D2129",
    show: false
  });
  win.once("ready-to-show", () => {
    win == null ? void 0 : win.show();
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path$1.join(process.env.DIST, "index.html"));
  }
  clipboardMonitor.start((record) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("new-record", record);
    }
  });
}
electron.app.whenReady().then(() => {
  db = new DatabaseManager();
  encryption = new Encryption();
  clipboardMonitor = new ClipboardMonitor(db, encryption);
  setupIpcHandlers();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (clipboardMonitor) {
    clipboardMonitor.stop();
  }
  if (db) {
    db.close();
  }
  win = null;
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
function setupIpcHandlers() {
  electron.ipcMain.handle("get-records", async (_, limit = 50) => {
    return db.getRecords(limit);
  });
  electron.ipcMain.handle("get-record-detail", async (_, id) => {
    const record = db.getRecordById(id);
    if (record) {
      return {
        ...record,
        original_content: encryption.decrypt(record.original_content, record.iv, record.auth_tag)
      };
    }
    return null;
  });
  electron.ipcMain.handle("delete-record", async (_, id) => {
    return db.deleteRecord(id);
  });
  electron.ipcMain.handle("clear-records", async () => {
    return db.clearRecords();
  });
  electron.ipcMain.handle("get-stats", async () => {
    return db.getStats();
  });
  electron.ipcMain.handle("get-settings", async () => {
    return db.getSettings();
  });
  electron.ipcMain.handle("update-settings", async (_, settings) => {
    Object.entries(settings).forEach(([key, value]) => {
      db.setSetting(key, value);
    });
    if (settings["monitorEnabled"] !== void 0) {
      if (settings["monitorEnabled"] === "true") {
        clipboardMonitor.start((record) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send("new-record", record);
          }
        });
      } else {
        clipboardMonitor.stop();
      }
    }
    return true;
  });
  electron.ipcMain.handle("get-monitor-status", async () => {
    return clipboardMonitor.isRunning();
  });
}
