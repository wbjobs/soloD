const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { SerialPort } = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline')
const Database = require('better-sqlite3')
const createCsvWriter = require('csv-writer').createObjectCsvWriter
const fs = require('fs')

let mainWindow
let serialPort = null
let db = null
let dataInterval = null
let isCollecting = false
let parser = null

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'sensor_data.db')
  db = new Database(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sensor_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      temperature REAL,
      humidity REAL,
      voltage REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

async function safeCloseSerialPort() {
  if (!serialPort) return
  
  try {
    if (parser) {
      parser.removeAllListeners('data')
      parser = null
    }
    
    serialPort.removeAllListeners('error')
    serialPort.removeAllListeners('open')
    serialPort.removeAllListeners('close')
    
    if (serialPort.isOpen) {
      await new Promise((resolve, reject) => {
        serialPort.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }
    
    serialPort.destroy()
    serialPort = null
  } catch (error) {
    console.warn('关闭串口警告:', error.message)
    serialPort = null
    parser = null
  }
}

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
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  initDatabase()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await safeCloseSerialPort()
    if (db) db.close()
    if (dataInterval) clearInterval(dataInterval)
    app.quit()
  }
})

ipcMain.handle('get-serial-ports', async () => {
  try {
    const ports = await SerialPort.list()
    return ports.map(port => ({
      path: port.path,
      manufacturer: port.manufacturer
    }))
  } catch (error) {
    console.error('获取串口列表失败:', error)
    return []
  }
})

ipcMain.handle('connect-serial', async (event, portPath, baudRate) => {
  try {
    await safeCloseSerialPort()

    await new Promise((resolve, reject) => {
      serialPort = new SerialPort({
        path: portPath,
        baudRate: baudRate || 9600,
        autoOpen: false
      })

      serialPort.open((err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }))

    const dataHandler = (data) => {
      try {
        const sensorData = JSON.parse(data)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sensor-data', sensorData)
        }
      } catch (e) {
        console.log('解析数据失败:', data)
      }
    }

    const errorHandler = (err) => {
      console.error('串口错误:', err)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('serial-error', err.message)
      }
    }

    parser.on('data', dataHandler)
    serialPort.on('error', errorHandler)

    return { success: true }
  } catch (error) {
    await safeCloseSerialPort()
    return { success: false, error: error.message }
  }
})

ipcMain.handle('disconnect-serial', async () => {
  try {
    await safeCloseSerialPort()
    return { success: true }
  } catch (error) {
    serialPort = null
    parser = null
    return { success: true, warning: error.message }
  }
})

ipcMain.handle('start-collection', () => {
  isCollecting = true
  return { success: true }
})

ipcMain.handle('stop-collection', () => {
  isCollecting = false
  return { success: true }
})

ipcMain.on('save-sensor-data', (event, data) => {
  if (!isCollecting || !db) return
  
  try {
    const stmt = db.prepare(`
      INSERT INTO sensor_data (temperature, humidity, voltage)
      VALUES (?, ?, ?)
    `)
    stmt.run(data.temperature, data.humidity, data.voltage)
  } catch (error) {
    console.error('保存数据失败:', error)
  }
})

ipcMain.handle('get-history-data', async (event, limit = 100) => {
  try {
    const stmt = db.prepare(`
      SELECT * FROM sensor_data
      ORDER BY timestamp DESC
      LIMIT ?
    `)
    return stmt.all(limit)
  } catch (error) {
    console.error('获取历史数据失败:', error)
    return []
  }
})

ipcMain.handle('export-csv', async () => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '导出CSV文件',
      defaultPath: path.join(app.getPath('documents'), `sensor_data_${Date.now()}.csv`),
      filters: [{ name: 'CSV文件', extensions: ['csv'] }]
    })

    if (canceled || !filePath) {
      return { success: false, canceled: true }
    }

    const stmt = db.prepare('SELECT * FROM sensor_data ORDER BY timestamp')
    const data = stmt.all()

    const csvWriter = createCsvWriter({
      path: filePath,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'temperature', title: '温度(°C)' },
        { id: 'humidity', title: '湿度(%)' },
        { id: 'voltage', title: '电压(V)' },
        { id: 'timestamp', title: '时间' }
      ]
    })

    await csvWriter.writeRecords(data)
    return { success: true, filePath }
  } catch (error) {
    console.error('导出CSV失败:', error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle('generate-mock-data', () => {
  const temperature = (Math.random() * 20 + 20).toFixed(2)
  const humidity = (Math.random() * 40 + 40).toFixed(2)
  const voltage = (Math.random() * 2 + 3).toFixed(2)
  
  return {
    temperature: parseFloat(temperature),
    humidity: parseFloat(humidity),
    voltage: parseFloat(voltage)
  }
})

ipcMain.handle('send-hex-command', async (event, hexString) => {
  try {
    if (!serialPort || !serialPort.isOpen) {
      return { success: false, error: '串口未连接' }
    }

    const hexData = hexString.replace(/\s+/g, '')
    if (!/^[0-9A-Fa-f]+$/.test(hexData)) {
      return { success: false, error: '无效的十六进制格式' }
    }

    if (hexData.length % 2 !== 0) {
      return { success: false, error: '十六进制长度必须为偶数' }
    }

    const buffer = Buffer.from(hexData, 'hex')
    
    return new Promise((resolve, reject) => {
      serialPort.write(buffer, (err) => {
        if (err) {
          resolve({ success: false, error: err.message })
        } else {
          serialPort.drain((drainErr) => {
            if (drainErr) {
              resolve({ success: false, error: drainErr.message })
            } else {
              resolve({ success: true, sentBytes: buffer.length })
            }
          })
        }
      })
    })
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('send-text-command', async (event, text) => {
  try {
    if (!serialPort || !serialPort.isOpen) {
      return { success: false, error: '串口未连接' }
    }

    return new Promise((resolve, reject) => {
      serialPort.write(text + '\n', (err) => {
        if (err) {
          resolve({ success: false, error: err.message })
        } else {
          serialPort.drain((drainErr) => {
            if (drainErr) {
              resolve({ success: false, error: drainErr.message })
            } else {
              resolve({ success: true })
            }
          })
        }
      })
    })
  } catch (error) {
    return { success: false, error: error.message }
  }
})
