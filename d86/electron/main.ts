import { app, BrowserWindow, ipcMain, globalShortcut, screen, Menu, MenuItem } from 'electron'
import path from 'node:path'
import { execSync } from 'child_process'
import { ClipboardMonitor } from './clipboard-monitor'
import { Database } from './database'
import { Encryption } from './encryption'

process.env.DIST_ELECTRON = path.join(__dirname, '..')
process.env.DIST = path.join(process.env.DIST_ELECTRON, '../dist')
process.env.PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST

let win: BrowserWindow | null
let pasteMenuWin: BrowserWindow | null
const preload = path.join(__dirname, '../preload/preload.js')
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

let db: Database
let encryption: Encryption
let clipboardMonitor: ClipboardMonitor

function writeClipboardNative(text: string): void {
  try {
    if (process.platform === 'win32') {
      const escapedText = text.replace(/"/g, '`"').replace(/\$/g, '`$')
      execSync(`powershell.exe -NoProfile -Command "Set-Clipboard -Value \"${escapedText}\""`, {
        timeout: 500,
        stdio: ['pipe', 'pipe', 'ignore']
      })
    }
  } catch (e) {
    console.error('Failed to write clipboard:', e)
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(process.env.PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'default',
    backgroundColor: '#1D2129',
    show: false,
  })

  win.once('ready-to-show', () => {
    win?.show()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }

  clipboardMonitor.start((record) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('new-record', record)
    }
  })
}

function createPasteMenu() {
  if (pasteMenuWin && !pasteMenuWin.isDestroyed()) {
    pasteMenuWin.close()
  }

  const cursorPoint = screen.getCursorScreenPoint()
  
  pasteMenuWin = new BrowserWindow({
    width: 320,
    height: 400,
    x: cursorPoint.x,
    y: cursorPoint.y,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#1D2129',
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  pasteMenuWin.on('blur', () => {
    if (pasteMenuWin && !pasteMenuWin.isDestroyed()) {
      pasteMenuWin.close()
    }
  })

  pasteMenuWin.on('closed', () => {
    pasteMenuWin = null
  })

  const pasteUrl = VITE_DEV_SERVER_URL
    ? `${VITE_DEV_SERVER_URL}#/paste-menu`
    : `file://${path.join(process.env.DIST, 'index.html')}#/paste-menu`

  pasteMenuWin.loadURL(pasteUrl)
}

function registerGlobalShortcuts() {
  try {
    const ret = globalShortcut.register('CommandOrControl+Shift+V', () => {
      const records = db.getRecords(10)
      if (records.length === 0) {
        if (win && !win.isDestroyed()) {
          win.show()
          win.focus()
        }
        return
      }
      createPasteMenu()
    })

    if (!ret) {
      console.log('Global shortcut registration failed')
      if (process.platform === 'win32') {
        try {
          execSync('powershell.exe -NoProfile -Command "Add-MpPreference -ExclusionProcess \\"' + process.execPath + '\\"" 2>$null', {
            timeout: 2000
          })
        } catch {}
      }
    }
  } catch (error) {
    console.error('Failed to register global shortcut:', error)
  }
}

function pasteRecord(recordId: number) {
  const record = db.getRecordById(recordId)
  if (record) {
    const originalContent = encryption.decrypt(record.original_content, record.iv, record.auth_tag)
    writeClipboardNative(originalContent)
    
    if (pasteMenuWin && !pasteMenuWin.isDestroyed()) {
      pasteMenuWin.close()
    }

    setTimeout(() => {
      try {
        if (process.platform === 'win32') {
          execSync('powershell.exe -NoProfile -Command "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys(''^v'')"', {
            timeout: 500
          })
        }
      } catch (e) {
        console.error('Auto-paste failed:', e)
      }
    }, 100)
  }
}

app.whenReady().then(() => {
  db = new Database()
  encryption = new Encryption()
  clipboardMonitor = new ClipboardMonitor(db, encryption)

  setupIpcHandlers()
  createWindow()
  registerGlobalShortcuts()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (clipboardMonitor) {
    clipboardMonitor.stop()
  }
  if (db) {
    db.close()
  }
  win = null
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function setupIpcHandlers() {
  ipcMain.handle('get-records', async (_, limit = 50) => {
    return db.getRecords(limit)
  })

  ipcMain.handle('get-record-detail', async (_, id: number) => {
    const record = db.getRecordById(id)
    if (record) {
      return {
        ...record,
        original_content: encryption.decrypt(record.original_content, record.iv, record.auth_tag)
      }
    }
    return null
  })

  ipcMain.handle('delete-record', async (_, id: number) => {
    return db.deleteRecord(id)
  })

  ipcMain.handle('clear-records', async () => {
    return db.clearRecords()
  })

  ipcMain.handle('get-stats', async () => {
    return db.getStats()
  })

  ipcMain.handle('get-settings', async () => {
    return db.getSettings()
  })

  ipcMain.handle('update-settings', async (_, settings: Record<string, string>) => {
    Object.entries(settings).forEach(([key, value]) => {
      db.setSetting(key, value)
    })
    
    if (settings['monitorEnabled'] !== undefined) {
      if (settings['monitorEnabled'] === 'true') {
        clipboardMonitor.start((record) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('new-record', record)
          }
        })
      } else {
        clipboardMonitor.stop()
      }
    }
    
    return true
  })

  ipcMain.handle('get-monitor-status', async () => {
    return clipboardMonitor.isRunning()
  })

  ipcMain.handle('get-recent-records', async (_, limit = 10) => {
    return db.getRecords(limit)
  })

  ipcMain.handle('paste-record', async (_, id: number) => {
    pasteRecord(id)
    return true
  })

  ipcMain.handle('close-paste-menu', async () => {
    if (pasteMenuWin && !pasteMenuWin.isDestroyed()) {
      pasteMenuWin.close()
    }
    return true
  })

  ipcMain.handle('request-accessibility-permission', async () => {
    if (process.platform === 'win32') {
      return true
    }
    return true
  })
}
