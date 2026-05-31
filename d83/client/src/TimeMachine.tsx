import { useState, useEffect } from 'react';

interface Snapshot {
  timestamp: number;
  docName: string;
  stateVector: string;
  preview: string;
}

interface TimeMachineProps {
  onClose: () => void;
  onRestore: (timestamp: number) => void;
}

const TimeMachine = ({ onClose, onRestore }: TimeMachineProps) => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    fetchSnapshots();
    const interval = setInterval(fetchSnapshots, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchSnapshots = async () => {
    try {
      const response = await fetch('http://localhost:1234/api/snapshots/markdown-doc');
      const data = await response.json();
      setSnapshots(data);
    } catch (error) {
      console.error('Failed to fetch snapshots:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (timestamp: number) => {
    if (isRestoring) return;
    
    setIsRestoring(true);
    try {
      const response = await fetch(`http://localhost:1234/api/restore/markdown-doc/${timestamp}`, {
        method: 'POST',
      });
      const result = await response.json();
      if (result.success) {
        onRestore(timestamp);
      }
    } catch (error) {
      console.error('Failed to restore snapshot:', error);
    } finally {
      setIsRestoring(false);
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">历史时光机</h2>
              <p className="text-sm text-gray-500">浏览并恢复文档历史版本</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-700">时间轴</span>
            <span className="text-sm text-gray-500">{snapshots.length} 个快照</span>
          </div>
          
          {snapshots.length > 0 ? (
            <>
              <input
                type="range"
                min="0"
                max={snapshots.length - 1}
                value={selectedIndex >= 0 ? selectedIndex : snapshots.length - 1}
                onChange={(e) => setSelectedIndex(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between mt-2">
                <span className="text-xs text-gray-500">最早</span>
                <span className="text-xs text-gray-500">现在</span>
              </div>
            </>
          ) : (
            <p className="text-center text-gray-500 py-4">暂无快照，系统每分钟自动创建快照</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <p className="text-gray-500">等待创建第一个快照...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {snapshots.map((snapshot, index) => (
                <div
                  key={snapshot.timestamp}
                  className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    selectedIndex === index
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 bg-white hover:border-indigo-300'
                  }`}
                  onClick={() => setSelectedIndex(index)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-sm font-semibold text-gray-800">
                          {formatTime(snapshot.timestamp)}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          {formatRelativeTime(snapshot.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2 font-mono bg-gray-50 p-2 rounded">
                        {snapshot.preview || '(空文档)'}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRestore(snapshot.timestamp);
                      }}
                      disabled={isRestoring}
                      className="ml-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRestoring ? '恢复中...' : '恢复'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              💡 提示：快照每分钟自动创建，最多保留 100 个历史版本
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeMachine;
