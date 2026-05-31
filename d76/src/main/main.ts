import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { serialManager } from './serial'
import { dbManager } from './database'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  dbManager.init()
  createWindow()

  serialManager.on('data', (data) => {
    mainWindow?.webContents.send('serial:data', data)
  })

  serialManager.on('error', (error) => {
    mainWindow?.webContents.send('serial:error', error.message)
  })

  serialManager.on('disconnected', () => {
    mainWindow?.webContents.send('serial:disconnected')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  await serialManager.disconnect()
  dbManager.close()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('serial:listPorts', async () => {
  return await serialManager.listPorts()
})

ipcMain.handle('serial:connect', async (_, portPath: string, baudRate: number) => {
  try {
    await serialManager.connect(portPath, baudRate)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('serial:disconnect', async () => {
  await serialManager.disconnect()
  return { success: true }
})

ipcMain.handle('serial:sendHex', async (_, hexString: string) => {
  try {
    await serialManager.sendHex(hexString)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('serial:isConnected', () => {
  return serialManager.isConnected()
})

ipcMain.handle('db:queryRecords', async (_, startTime?: number, endTime?: number, limit?: number) => {
  return dbManager.queryRecords(startTime, endTime, limit)
})
