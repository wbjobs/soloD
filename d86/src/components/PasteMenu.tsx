import { useEffect, useState } from 'react'
import { Shield, X, Copy, User, Smartphone, Mail, Key, Globe, AlertTriangle } from 'lucide-react'

export interface ClipboardRecord {
  id: number
  masked_content: string
  sensitive_type: string
  created_at: string
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case '身份证号':
      return <User className="w-4 h-4" />
    case '手机号':
      return <Smartphone className="w-4 h-4" />
    case '邮箱':
      return <Mail className="w-4 h-4" />
    case 'API密钥':
      return <Key className="w-4 h-4" />
    default:
      return <AlertTriangle className="w-4 h-4" />
  }
}

const getTypeColor = (type: string) => {
  switch (type) {
    case '身份证号':
      return 'text-red-400 bg-red-500/20'
    case '手机号':
      return 'text-orange-400 bg-orange-500/20'
    case '邮箱':
      return 'text-blue-400 bg-blue-500/20'
    case 'API密钥':
      return 'text-purple-400 bg-purple-500/20'
    default:
      return 'text-gray-400 bg-gray-500/20'
  }
}

export default function PasteMenu() {
  const [records, setRecords] = useState<ClipboardRecord[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    loadRecords()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electronAPI.closePasteMenu()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, records.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (records[selectedIndex]) {
          handlePaste(records[selectedIndex].id)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [records, selectedIndex])

  const loadRecords = async () => {
    const data = await window.electronAPI.getRecentRecords(10)
    setRecords(data)
  }

  const handlePaste = async (id: number) => {
    await window.electronAPI.pasteRecord(id)
  }

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    if (diff < 60000) {
      return '刚刚'
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}小时前`
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    }
  }

  return (
    <div className="min-h-screen bg-dark-600/95 backdrop-blur-sm text-white p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm">安全粘贴</h2>
        </div>
        <button
          onClick={() => window.electronAPI.closePasteMenu()}
          className="p-1 hover:bg-dark-400 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-dark-300 mb-3">
        按 ↑↓ 选择，Enter 粘贴，Esc 关闭
      </p>

      {records.length === 0 ? (
        <div className="text-center py-8">
          <Shield className="w-12 h-12 mx-auto mb-3 text-dark-400" />
          <p className="text-dark-300 text-sm">暂无可粘贴的敏感记录</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-[320px] overflow-y-auto">
          {records.map((record, index) => (
            <button
              key={record.id}
              onClick={() => handlePaste(record.id)}
              className={`w-full text-left p-3 rounded-lg transition-all flex items-center gap-3 ${
                selectedIndex === index
                  ? 'bg-primary text-white'
                  : 'bg-dark-500 hover:bg-dark-400 text-white'
              }`}
            >
              <div className={`p-2 rounded-lg flex-shrink-0 ${
                selectedIndex === index ? 'bg-white/20' : getTypeColor(record.sensitive_type)
              }`}>
                {getTypeIcon(record.sensitive_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{record.masked_content}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    selectedIndex === index ? 'bg-white/20' : 'bg-dark-400'
                  }`}>
                    {record.sensitive_type}
                  </span>
                  <span className="text-xs opacity-70">{formatTime(record.created_at)}</span>
                </div>
              </div>
              <Copy className="w-4 h-4 flex-shrink-0 opacity-70" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-dark-400">
        <p className="text-xs text-dark-400 text-center">
          ⚡ 按 Ctrl+Shift+V 随时呼出此菜单
        </p>
      </div>
    </div>
  )
}
