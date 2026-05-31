import { useEffect, useState, useMemo } from 'react';
import { createYjsSetup } from './yjs-setup';
import Editor from './Editor';
import Preview from './Preview';
import TimeMachine from './TimeMachine';

function App() {
  const [content, setContent] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [showTimeMachine, setShowTimeMachine] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState('');
  
  const yjsSetup = useMemo(() => createYjsSetup(), []);
  
  useEffect(() => {
    const { ydoc, ytext, wsProvider, awareness } = yjsSetup;
    
    wsProvider.on('status', (event: { status: string }) => {
      setIsConnected(event.status === 'connected');
    });
    
    const updateAwareness = () => {
      const states = Array.from(awareness.getStates().values());
      setOnlineUsers(states);
    };
    
    awareness.on('update', updateAwareness);
    updateAwareness();
    
    const handleYTextUpdate = () => {
      setContent(ytext.toString());
    };
    
    ytext.observe(handleYTextUpdate);
    setContent(ytext.toString());
    
    return () => {
      ytext.unobserve(handleYTextUpdate);
      awareness.off('update', updateAwareness);
      wsProvider.destroy();
      ydoc.destroy();
    };
  }, [yjsSetup]);
  
  const handleRestore = (timestamp: number) => {
    setRestoreMessage(`已恢复到 ${new Date(timestamp).toLocaleString('zh-CN')} 的版本`);
    setShowTimeMachine(false);
    setTimeout(() => setRestoreMessage(''), 3000);
  };
  
  const currentUser = onlineUsers.find(
    (u) => u?.user?.name === yjsSetup.awareness.getLocalState()?.user?.name
  );
  
  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-800">
              Markdown 协同编辑器
            </h1>
            <div className="flex items-center space-x-2">
              <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="text-sm text-gray-600">
                {isConnected ? '已连接' : '离线模式'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">在线用户:</span>
              <div className="flex -space-x-2">
                {onlineUsers.map((user, index) => (
                  <div
                    key={index}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium border-2 border-white"
                    style={{ backgroundColor: user?.user?.color || '#6b7280' }}
                    title={user?.user?.name || '未知用户'}
                  >
                    {user?.user?.name?.charAt(0) || '?'}
                  </div>
                ))}
              </div>
            </div>
            
            <button
              onClick={() => setShowTimeMachine(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">历史时光机</span>
            </button>
            
            {currentUser?.user && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-full">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: currentUser.user.color }}
                ></div>
                <span className="text-sm text-gray-700">{currentUser.user.name}</span>
              </div>
            )}
          </div>
        </div>
      </header>
      
      {restoreMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-40">
          <div className="bg-green-100 border border-green-400 text-green-700 px-6 py-3 rounded-lg shadow-lg">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{restoreMessage}</span>
            </div>
          </div>
        </div>
      )}
      
      <main className="flex-1 flex overflow-hidden">
        <div className="w-1/2 h-full border-r border-gray-200">
          <div className="h-full flex flex-col">
            <div className="bg-gray-800 text-white px-4 py-2 text-sm font-medium">
              编辑区
            </div>
            <div className="flex-1 overflow-hidden">
              <Editor
                ytext={yjsSetup.ytext}
                awareness={yjsSetup.awareness}
              />
            </div>
          </div>
        </div>
        
        <div className="w-1/2 h-full">
          <div className="h-full flex flex-col">
            <div className="bg-gray-100 text-gray-700 px-4 py-2 text-sm font-medium border-b border-gray-200">
              预览区
            </div>
            <div className="flex-1 overflow-hidden">
              <Preview content={content} />
            </div>
          </div>
        </div>
      </main>
      
      <footer className="bg-white border-t border-gray-200 px-6 py-2">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>使用 Yjs CRDT 协议实现实时协同</span>
          <span>数据自动保存到本地 IndexedDB 和服务器 LevelDB</span>
        </div>
      </footer>
      
      {showTimeMachine && (
        <TimeMachine
          onClose={() => setShowTimeMachine(false)}
          onRestore={handleRestore}
        />
      )}
    </div>
  );
}

export default App;
