import { useEffect, useState } from 'react'
import { Shield, Settings, Activity } from 'lucide-react'
import { useStore } from './store'
import RecordList from './components/RecordList'
import SettingsPanel from './components/SettingsPanel'
import StatsCard from './components/StatsCard'
import RecordDetail from './components/RecordDetail'
import PasteMenu from './components/PasteMenu'

function App() {
  const { 
    currentView, 
    setView, 
    fetchRecords, 
    fetchStats, 
    fetchSettings,
    fetchMonitorStatus,
    addRecord,
    monitorStatus,
    selectedRecord
  } = useStore()

  const [isPasteMenu, setIsPasteMenu] = useState(false)

  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash
      if (hash === '#/paste-menu') {
        setIsPasteMenu(true)
      } else {
        setIsPasteMenu(false)
      }
    }

    checkHash()
    window.addEventListener('hashchange', checkHash)
    return () => window.removeEventListener('hashchange', checkHash)
  }, [])

  useEffect(() => {
    if (!isPasteMenu) {
      fetchRecords()
      fetchStats()
      fetchSettings()
      fetchMonitorStatus()

      window.electronAPI.onNewRecord((record) => {
        addRecord(record)
      })

      return () => {
        window.electronAPI.removeNewRecordListener()
      }
    }
  }, [isPasteMenu])

  if (isPasteMenu) {
    return <PasteMenu />
  }

  return (
    <div className="min-h-screen bg-dark-600 flex">
      {/* 侧边栏 */}
      <div className="w-64 bg-dark-700 border-r border-dark-500 flex flex-col">
        <div className="p-6 border-b border-dark-500">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">剪贴板卫士</h1>
              <p className="text-xs text-dark-300">Clipboard Guard</p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg mb-2 cursor-pointer transition-all ${
            monitorStatus ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
          }`}>
            <Activity className="w-4 h-4" />
            <span className="text-sm font-medium">
              {monitorStatus ? '监听中' : '已停止'}
            </span>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <button
            onClick={() => setView('records')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all ${
              currentView === 'records'
                ? 'bg-primary text-white'
                : 'text-dark-200 hover:bg-dark-500'
            }`}
          >
            <Shield className="w-5 h-5" />
            <span>脱敏记录</span>
          </button>
          <button
            onClick={() => setView('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
              currentView === 'settings'
                ? 'bg-primary text-white'
                : 'text-dark-200 hover:bg-dark-500'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>设置</span>
          </button>
        </nav>

        <div className="p-4 border-t border-dark-500">
          <p className="text-xs text-dark-400 text-center mb-2">
            按 Ctrl+Shift+V 呼出安全粘贴
          </p>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col">
        <header className="h-16 border-b border-dark-500 flex items-center px-6">
          <h2 className="text-xl font-semibold text-white">
            {currentView === 'records' ? '脱敏记录' : '设置'}
          </h2>
        </header>

        <main className="flex-1 overflow-auto p-6">
          {currentView === 'records' ? (
            <div className="space-y-6">
              <StatsCard />
              <RecordList />
            </div>
          ) : (
            <SettingsPanel />
          )}
        </main>
      </div>

      {selectedRecord && <RecordDetail />}
    </div>
  )
}

export default App
