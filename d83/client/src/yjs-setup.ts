import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

const WEBSOCKET_URL = 'ws://localhost:1234';
const DOC_NAME = 'markdown-doc';

export const createYjsSetup = () => {
  const ydoc = new Y.Doc({
    guid: DOC_NAME,
  });
  
  const ytext = ydoc.getText('markdown');
  
  const wsProvider = new WebsocketProvider(
    WEBSOCKET_URL, 
    DOC_NAME, 
    ydoc,
    {
      connect: true,
      maxBackoffTime: 2500,
      disableBc: false,
    }
  );
  
  const idbProvider = new IndexeddbPersistence(DOC_NAME, ydoc);
  
  const awareness = wsProvider.awareness;
  
  const userColors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];
  
  const userColor = userColors[Math.floor(Math.random() * userColors.length)];
  const userName = `用户${Math.floor(Math.random() * 1000)}`;
  
  awareness.setLocalStateField('user', {
    name: userName,
    color: userColor,
  });
  
  awareness.on('update', ({ added, updated, removed }) => {
    const changedClients = added.concat(updated).concat(removed);
    if (changedClients.length > 0) {
      console.debug('Awareness updated:', { added, updated, removed });
    }
  });
  
  wsProvider.on('sync', (isSynced: boolean) => {
    console.debug('Document synced:', isSynced);
  });
  
  wsProvider.on('connection-close', () => {
    console.debug('WebSocket connection closed');
  });
  
  wsProvider.on('connection-error', (error: Error) => {
    console.error('WebSocket connection error:', error);
  });
  
  idbProvider.on('synced', () => {
    console.debug('IndexedDB synced');
  });
  
  return {
    ydoc,
    ytext,
    wsProvider,
    idbProvider,
    awareness,
  };
};

export type YjsSetup = ReturnType<typeof createYjsSetup>;
