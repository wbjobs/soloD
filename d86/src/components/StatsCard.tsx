import { useStore } from '../store'
import { ShieldCheck, Clock, TrendingUp } from 'lucide-react'

export default function StatsCard() {
  const { stats } = useStore()

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-dark-500 rounded-xl p-5 border border-dark-400">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <span className="text-dark-200 text-sm">总脱敏次数</span>
        </div>
        <p className="text-3xl font-bold text-white">
          {stats?.total || 0}
        </p>
      </div>

      <div className="bg-dark-500 rounded-xl p-5 border border-dark-400">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-success" />
          </div>
          <span className="text-dark-200 text-sm">今日次数</span>
        </div>
        <p className="text-3xl font-bold text-white">
          {stats?.today || 0}
        </p>
      </div>

      <div className="bg-dark-500 rounded-xl p-5 border border-dark-400">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-warning/20 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-warning" />
          </div>
          <span className="text-dark-200 text-sm">类型分布</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {stats?.byType.slice(0, 3).map((item) => (
            <span 
              key={item.sensitive_type}
              className="px-2 py-1 bg-dark-400 rounded text-xs text-dark-100"
            >
              {item.sensitive_type}: {item.count}
            </span>
          ))}
          {!stats?.byType.length && (
            <span className="text-dark-300 text-sm">暂无数据</span>
          )}
        </div>
      </div>
    </div>
  )
}
