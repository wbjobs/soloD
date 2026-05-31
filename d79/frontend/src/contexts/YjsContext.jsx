import { createContext, useContext, useEffect, useState, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

const YjsContext = createContext(null);

export function YjsProvider({ children, docId }) {
  const [ydoc, setYdoc] = useState(null);
  const [provider, setProvider] = useState(null);
  const [persistence, setPersistence] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    const ydocInstance = new Y.Doc({
      guid: docId
    });
    
    setYdoc(ydocInstance);

    const persistenceInstance = new IndexeddbPersistence(docId, ydocInstance);
    setPersistence(persistenceInstance);

    persistenceInstance.on('synced', () => {
      console.log('IndexedDB 数据已同步');
    });

    const connectWebSocket = () => {
      setIsSyncing(true);
      
      const providerInstance = new WebsocketProvider(
        'ws://localhost:1234',
        docId,
        ydocInstance,
        {
          connect: true,
          resyncInterval: 3000,
          maxBackoffTime: 5000
        }
      );

      providerInstance.on('status', (event) => {
        console.log('WebSocket 状态:', event.status);
        setIsConnected(event.status === 'connected');
        setIsSyncing(false);
      });

      providerInstance.on('sync', (isSync) => {
        console.log('同步状态:', isSync);
        if (!isSync) {
          setIsSyncing(false);
        }
      });

      providerInstance.on('connection-close', () => {
        console.log('WebSocket 连接关闭');
        setIsConnected(false);
        setIsSyncing(false);
      });

      providerInstance.on('connection-error', (error) => {
        console.error('WebSocket 连接错误:', error);
        setIsConnected(false);
        setIsSyncing(false);
      });

      setProvider(providerInstance);
    };

    const handleOnline = () => {
      console.log('网络恢复，尝试重连...');
      setIsOnline(true);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => {
        if (provider) {
          provider.connect();
        } else {
          connectWebSocket();
        }
      }, 1000);
    };

    const handleOffline = () => {
      console.log('网络断开');
      setIsOnline(false);
      setIsConnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) {
      connectWebSocket();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      
      if (provider) {
        provider.destroy();
      }
      if (persistenceInstance) {
        persistenceInstance.destroy();
      }
      if (ydocInstance) {
        ydocInstance.destroy();
      }
    };
  }, [docId]);

  const value = {
    ydoc,
    provider,
    persistence,
    isOnline,
    isConnected,
    isSyncing
  };

  return (
    <YjsContext.Provider value={value}>
      {children}
    </YjsContext.Provider>
  );
}

export function useYjs() {
  const context = useContext(YjsContext);
  if (!context) {
    throw new Error('useYjs must be used within a YjsProvider');
  }
  return context;
}