import { X, Copy } from 'lucide-react'
import { useStore } from '../store'
import { useState } from 'react'

export default function RecordDetail() {
  const { selectedRecord, closeRecordDetail } = useStore()
  const [copied, setCopied] = useState(false)

  if (!selectedRecord) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedRecord.original_content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr)
    return date.toLocaleString('zh-CN')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-dark-600 rounded-xl w-full max-w-lg mx-4 border border-dark-400 shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-dark-400">
          <h3 className="text-lg font-semibold text-white">记录详情</h3>
          <button
            onClick={closeRecordDetail}
            className="p-2 hover:bg-dark-400 rounded-lg transition-all text-dark-200 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm text-dark-300 block mb-2">敏感信息类型</label>
            <div className="px-4 py-3 bg-dark-500 rounded-lg text-white">
              {selectedRecord.sensitive_type}
            </div>
          </div>

          <div>
            <label className="text-sm text-dark-300 block mb-2">脱敏后内容</label>
            <div className="px-4 py-3 bg-dark-500 rounded-lg text-white font-mono">
              {selectedRecord.masked_content}
            </div>
          </div>

          <div>
            <label className="text-sm text-dark-300 block mb-2">原始内容（已解密）</label>
            <div className="relative">
              <div className="px-4 py-3 bg-danger/10 rounded-lg text-danger font-mono pr-12 break-all">
                {selectedRecord.original_content}
              </div>
              <button
                onClick={handleCopy}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-dark-400 rounded-lg transition-all text-dark-200 hover:text-white"
                title="复制原始内容"
              >
                <Copy className="w-4 h-4" />
              </button>
              {copied && (
                <span className="absolute right-10 top-1/2 -translate-y-1/2 text-xs text-success bg-success/10 px-2 py-1 rounded">
                  已复制
                </span>
              )}
            </div>
            <p className="text-xs text-warning mt-2">
              ⚠️ 请注意保护原始敏感信息的安全
            </p>
          </div>

          <div>
            <label className="text-sm text-dark-300 block mb-2">记录时间</label>
            <div className="px-4 py-3 bg-dark-500 rounded-lg text-white">
              {formatTime(selectedRecord.created_at)}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-dark-400">
          <button
            onClick={closeRecordDetail}
            className="w-full py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all font-medium"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
