import { contextBridge, ipcRenderer } from 'electron'

export interface ClipboardRecord {
  id: number
  masked_content: string
  sensitive_type: string
  created_at: string
}

export interface RecordDetail extends ClipboardRecord {
  original_content: string
}

export interface Stats {
  total: number
  today: number
  byType: { sensitive_type: string; count: number }[]
}

export interface Settings {
  [key: string]: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  getRecords: (limit?: number) => ipcRenderer.invoke('get-records', limit),
  getRecordDetail: (id: number) => ipcRenderer.invoke('get-record-detail', id),
  deleteRecord: (id: number) => ipcRenderer.invoke('delete-record', id),
  clearRecords: () => ipcRenderer.invoke('clear-records'),
  getStats: () => ipcRenderer.invoke('get-stats'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: Settings) => ipcRenderer.invoke('update-settings', settings),
  getMonitorStatus: () => ipcRenderer.invoke('get-monitor-status'),
  onNewRecord: (callback: (record: ClipboardRecord) => void) => {
    ipcRenderer.on('new-record', (_, record) => callback(record))
  },
  removeNewRecordListener: () => {
    ipcRenderer.removeAllListeners('new-record')
  },
  getRecentRecords: (limit?: number) => ipcRenderer.invoke('get-recent-records', limit),
  pasteRecord: (id: number) => ipcRenderer.invoke('paste-record', id),
  closePasteMenu: () => ipcRenderer.invoke('close-paste-menu'),
  requestAccessibilityPermission: () => ipcRenderer.invoke('request-accessibility-permission'),
})

declare global {
  interface Window {
    electronAPI: {
      getRecords: (limit?: number) => Promise<ClipboardRecord[]>
      getRecordDetail: (id: number) => Promise<RecordDetail | null>
      deleteRecord: (id: number) => Promise<boolean>
      clearRecords: () => Promise<boolean>
      getStats: () => Promise<Stats>
      getSettings: () => Promise<Settings>
      updateSettings: (settings: Settings) => Promise<boolean>
      getMonitorStatus: () => Promise<boolean>
      onNewRecord: (callback: (record: ClipboardRecord) => void) => void
      removeNewRecordListener: () => void
      getRecentRecords: (limit?: number) => Promise<ClipboardRecord[]>
      pasteRecord: (id: number) => Promise<boolean>
      closePasteMenu: () => Promise<boolean>
      requestAccessibilityPermission: () => Promise<boolean>
    }
  }
}
