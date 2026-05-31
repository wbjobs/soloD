import { create } from 'zustand'

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

interface AppState {
  records: ClipboardRecord[]
  stats: Stats | null
  settings: Settings | null
  monitorStatus: boolean
  currentView: 'records' | 'settings'
  selectedRecord: RecordDetail | null
  isLoading: boolean

  fetchRecords: () => Promise<void>
  fetchStats: () => Promise<void>
  fetchSettings: () => Promise<void>
  fetchMonitorStatus: () => Promise<void>
  addRecord: (record: ClipboardRecord) => void
  selectRecord: (id: number) => Promise<void>
  deleteRecord: (id: number) => Promise<void>
  clearRecords: () => Promise<void>
  updateSettings: (settings: Settings) => Promise<void>
  setView: (view: 'records' | 'settings') => void
  closeRecordDetail: () => void
}

export const useStore = create<AppState>((set, get) => ({
  records: [],
  stats: null,
  settings: null,
  monitorStatus: true,
  currentView: 'records',
  selectedRecord: null,
  isLoading: false,

  fetchRecords: async () => {
    set({ isLoading: true })
    try {
      const records = await window.electronAPI.getRecords(100)
      set({ records })
    } finally {
      set({ isLoading: false })
    }
  },

  fetchStats: async () => {
    const stats = await window.electronAPI.getStats()
    set({ stats })
  },

  fetchSettings: async () => {
    const settings = await window.electronAPI.getSettings()
    set({ settings })
  },

  fetchMonitorStatus: async () => {
    const status = await window.electronAPI.getMonitorStatus()
    set({ monitorStatus: status })
  },

  addRecord: (record: ClipboardRecord) => {
    set((state) => ({
      records: [record, ...state.records]
    }))
    get().fetchStats()
  },

  selectRecord: async (id: number) => {
    const record = await window.electronAPI.getRecordDetail(id)
    set({ selectedRecord: record })
  },

  deleteRecord: async (id: number) => {
    await window.electronAPI.deleteRecord(id)
    set((state) => ({
      records: state.records.filter(r => r.id !== id)
    }))
    get().fetchStats()
  },

  clearRecords: async () => {
    await window.electronAPI.clearRecords()
    set({ records: [] })
    get().fetchStats()
  },

  updateSettings: async (settings: Settings) => {
    await window.electronAPI.updateSettings(settings)
    set({ settings })
    get().fetchMonitorStatus()
  },

  setView: (view: 'records' | 'settings') => {
    set({ currentView: view })
  },

  closeRecordDetail: () => {
    set({ selectedRecord: null })
  }
}))
