const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getSerialPorts: () => ipcRenderer.invoke('get-serial-ports'),
  connectSerial: (portPath, baudRate) => ipcRenderer.invoke('connect-serial', portPath, baudRate),
  disconnectSerial: () => ipcRenderer.invoke('disconnect-serial'),
  startCollection: () => ipcRenderer.invoke('start-collection'),
  stopCollection: () => ipcRenderer.invoke('stop-collection'),
  saveSensorData: (data) => ipcRenderer.send('save-sensor-data', data),
  getHistoryData: (limit) => ipcRenderer.invoke('get-history-data', limit),
  exportCsv: () => ipcRenderer.invoke('export-csv'),
  generateMockData: () => ipcRenderer.invoke('generate-mock-data'),
  onSensorData: (callback) => ipcRenderer.on('sensor-data', (event, data) => callback(data)),
  onSerialError: (callback) => ipcRenderer.on('serial-error', (event, error) => callback(error)),
  sendHexCommand: (hexString) => ipcRenderer.invoke('send-hex-command', hexString),
  sendTextCommand: (text) => ipcRenderer.invoke('send-text-command', text)
})
