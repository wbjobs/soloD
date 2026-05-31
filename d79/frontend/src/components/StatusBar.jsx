import { useYjs } from '../contexts/YjsContext';

function StatusBar() {
  const { isOnline, isConnected, isSyncing, ydoc } = useYjs();

  const getStatusClass = () => {
    if (isSyncing) return 'syncing';
    if (isConnected) return 'online';
    return 'offline';
  };

  const getStatusText = () => {
    if (isSyncing) return '同步中...';
    if (isConnected) return '已连接';
    if (isOnline) return '在线 (未连接)';
    return '离线模式';
  };

  return (
    <footer className="status-bar">
      <div className="status-left">
        <div className="status-item">
          <span className={`status-indicator ${getStatusClass()}`} />
          <span>网络状态: {getStatusText()}</span>
        </div>
        <div className="status-item">
          <span>存储: IndexedDB</span>
        </div>
        <div className="status-item">
          <span>同步协议: Yjs CRDT</span>
        </div>
      </div>
      <div className="status-right">
        <span>提示: 断开网络后仍可编辑，恢复网络自动同步</span>
      </div>
    </footer>
  );
}

export default StatusBar;