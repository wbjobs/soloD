import { contextBridge, ipcRenderer } from 'electron'

export interface SerialData {
  timestamp: number
  type: 'send' | 'receive'
  data: string
  hexData: string
  port: string
}

export interface PortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  vendorId?: string
  productId?: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  listPorts: (): Promise<PortInfo[]> => ipcRenderer.invoke('serial:listPorts'),
  connect: (portPath: string, baudRate: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('serial:connect', portPath, baudRate),
  disconnect: (): Promise<{ success: boolean }> => ipcRenderer.invoke('serial:disconnect'),
  sendHex: (hexString: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('serial:sendHex', hexString),
  isConnected: (): Promise<boolean> => ipcRenderer.invoke('serial:isConnected'),
  queryRecords: (startTime?: number, endTime?: number, limit?: number): Promise<SerialData[]> =>
    ipcRenderer.invoke('db:queryRecords', startTime, endTime, limit),
  onSerialData: (callback: (data: SerialData) => void) => {
    ipcRenderer.on('serial:data', (_, data) => callback(data))
  },
  onSerialError: (callback: (error: string) => void) => {
    ipcRenderer.on('serial:error', (_, error) => callback(error))
  },
  onSerialDisconnected: (callback: () => void) => {
    ipcRenderer.on('serial:disconnected', () => callback())
  },
  removeListeners: () => {
    ipcRenderer.removeAllListeners('serial:data')
    ipcRenderer.removeAllListeners('serial:error')
    ipcRenderer.removeAllListeners('serial:disconnected')
  }
})

declare global {
  interface Window {
    electronAPI: {
      listPorts: () => Promise<PortInfo[]>
      connect: (portPath: string, baudRate: number) => Promise<{ success: boolean; error?: string }>
      disconnect: () => Promise<{ success: boolean }>
      sendHex: (hexString: string) => Promise<{ success: boolean; error?: string }>
      isConnected: () => Promise<boolean>
      queryRecords: (startTime?: number, endTime?: number, limit?: number) => Promise<SerialData[]>
      onSerialData: (callback: (data: SerialData) => void) => void
      onSerialError: (callback: (error: string) => void) => void
      onSerialDisconnected: (callback: () => void) => void
      removeListeners: () => void
    }
  }
}
