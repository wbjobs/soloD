import { Trash2, Eye, AlertTriangle, User, Mail, Smartphone, Key, Globe } from 'lucide-react'
import { useStore } from '../store'

const getTypeIcon = (type: string) => {
  switch (type) {
    case '身份证号':
      return <User className="w-4 h-4" />
    case '手机号':
      return <Smartphone className="w-4 h-4" />
    case '邮箱':
      return <Mail className="w-4 h-4" />
    case 'IP地址':
      return <Globe className="w-4 h-4" />
    case 'API密钥':
      return <Key className="w-4 h-4" />
    default:
      return <AlertTriangle className="w-4 h-4" />
  }
}

const getTypeColor = (type: string) => {
  switch (type) {
    case '身份证号':
      return 'bg-danger/20 text-danger'
    case '手机号':
      return 'bg-warning/20 text-warning'
    case '邮箱':
      return 'bg-primary/20 text-primary'
    case 'IP地址':
      return 'bg-success/20 text-success'
    case 'API密钥':
      return 'bg-orange-500/20 text-orange-500'
    default:
      return 'bg-dark-400 text-dark-100'
  }
}

export default function RecordList() {
  const { records, selectRecord, deleteRecord, clearRecords, isLoading } = useStore()

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr)
    return date.toLocaleString('zh-CN')
  }

  return (
    <div className="bg-dark-500 rounded-xl border border-dark-400">
      <div className="flex items-center justify-between p-5 border-b border-dark-400">
        <h3 className="text-lg font-semibold text-white">历史记录</h3>
        {records.length > 0 && (
          <button
            onClick={() => {
              if (confirm('确定要清空所有记录吗？')) {
                clearRecords()
              }
            }}
            className="px-4 py-2 bg-danger/20 text-danger rounded-lg hover:bg-danger/30 transition-all text-sm"
          >
            清空记录
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-dark-300">
          加载中...
        </div>
      ) : records.length === 0 ? (
        <div className="p-10 text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-dark-400" />
          <p className="text-dark-300">暂无脱敏记录</p>
          <p className="text-dark-400 text-sm mt-1">
            当您复制包含敏感信息的文本时，会自动进行脱敏处理
          </p>
        </div>
      ) : (
        <div className="divide-y divide-dark-400 max-h-96 overflow-auto">
          {records.map((record) => (
            <div
              key={record.id}
              className="p-4 flex items-center justify-between hover:bg-dark-400/50 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getTypeColor(record.sensitive_type)}`}>
                  {getTypeIcon(record.sensitive_type)}
                </div>
                <div>
                  <p className="text-white font-medium">{record.masked_content}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 bg-dark-400 rounded text-dark-200">
                      {record.sensitive_type}
                    </span>
                    <span className="text-xs text-dark-400">
                      {formatTime(record.created_at)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => selectRecord(record.id)}
                  className="p-2 hover:bg-dark-300 rounded-lg transition-all text-dark-200 hover:text-white"
                  title="查看原文"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm('确定要删除这条记录吗？')) {
                      deleteRecord(record.id)
                    }
                  }}
                  className="p-2 hover:bg-danger/20 rounded-lg transition-all text-dark-200 hover:text-danger"
                  title="删除记录"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Shield({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}
