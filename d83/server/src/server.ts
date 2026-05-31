import http from 'http';
import WebSocket, { Server } from 'ws';
import * as Y from 'yjs';
import { LeveldbPersistence } from 'y-leveldb';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Level } from 'level';

const PORT = 1234;

interface WSSharedDoc extends Y.Doc {
  name: string;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
}

interface Snapshot {
  timestamp: number;
  docName: string;
  stateVector: string;
  preview: string;
}

const docs = new Map<string, WSSharedDoc>();
const persistence = new LeveldbPersistence('./db');
let snapshotDB: Level<string, string>;

const messageSync = 0;
const messageAwareness = 1;
const messageAuth = 2;

const SNAPSHOT_INTERVAL = 60000;
const MAX_SNAPSHOTS = 100;

const updateHandler = (update: Uint8Array, origin: any, doc: WSSharedDoc) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeUpdate(encoder, update);
  const message = encoding.toUint8Array(encoder);
  doc.conns.forEach((_, conn) => send(doc, conn, message));
};

class WSSharedDocClass extends Y.Doc implements WSSharedDoc {
  name: string;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;

  constructor(name: string) {
    super();
    this.name = name;
    this.awareness = new awarenessProtocol.Awareness(this);
    this.conns = new Map();

    const awarenessChangeHandler = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      conn: WebSocket | null
    ) => {
      const changedClients = added.concat(updated, removed);
      if (conn !== null) {
        const connControlledIDs = this.conns.get(conn);
        if (connControlledIDs !== undefined) {
          added.forEach(clientID => connControlledIDs.add(clientID));
          removed.forEach(clientID => connControlledIDs.delete(clientID));
        }
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients));
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => send(this, c, buff));
    };

    this.awareness.on('update', awarenessChangeHandler);
    this.on('update', updateHandler);
  }
}

const createSnapshot = async (docName: string, doc: WSSharedDoc) => {
  try {
    const timestamp = Date.now();
    const stateVector = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
    const ytext = doc.getText('markdown');
    const preview = ytext.toString().slice(0, 200);

    const snapshot: Snapshot = {
      timestamp,
      docName,
      stateVector,
      preview,
    };

    await snapshotDB.put(`snapshot:${docName}:${timestamp}`, JSON.stringify(snapshot));
    console.log(`Created snapshot for ${docName} at ${new Date(timestamp).toISOString()}`);

    await cleanupOldSnapshots(docName);
  } catch (error) {
    console.error('Error creating snapshot:', error);
  }
};

const cleanupOldSnapshots = async (docName: string) => {
  try {
    const snapshots: Snapshot[] = [];
    for await (const [key, value] of snapshotDB.iterator({ gte: `snapshot:${docName}:`, lte: `snapshot:${docName}:\xff` })) {
      snapshots.push(JSON.parse(value));
    }

    if (snapshots.length > MAX_SNAPSHOTS) {
      snapshots.sort((a, b) => a.timestamp - b.timestamp);
      const toDelete = snapshots.slice(0, snapshots.length - MAX_SNAPSHOTS);
      for (const snap of toDelete) {
        await snapshotDB.del(`snapshot:${docName}:${snap.timestamp}`);
      }
      console.log(`Cleaned up ${toDelete.length} old snapshots for ${docName}`);
    }
  } catch (error) {
    console.error('Error cleaning up snapshots:', error);
  }
};

const getSnapshots = async (docName: string): Promise<Snapshot[]> => {
  try {
    const snapshots: Snapshot[] = [];
    for await (const [key, value] of snapshotDB.iterator({ gte: `snapshot:${docName}:`, lte: `snapshot:${docName}:\xff` })) {
      snapshots.push(JSON.parse(value));
    }
    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error getting snapshots:', error);
    return [];
  }
};

const restoreSnapshot = async (docName: string, timestamp: number): Promise<boolean> => {
  try {
    const snapshotData = await snapshotDB.get(`snapshot:${docName}:${timestamp}`);
    if (!snapshotData) return false;

    const snapshot: Snapshot = JSON.parse(snapshotData);
    const stateVector = Buffer.from(snapshot.stateVector, 'base64');

    const doc = docs.get(docName);
    if (doc) {
      doc.transact(() => {
        Y.applyUpdate(doc, stateVector);
      }, 'snapshot-restore');
      console.log(`Restored snapshot for ${docName} from ${new Date(timestamp).toISOString()}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error restoring snapshot:', error);
    return false;
  }
};

const getYDoc = async (docName: string): Promise<WSSharedDoc> => {
  let doc = docs.get(docName);
  if (!doc) {
    doc = new WSSharedDocClass(docName);
    
    const persistedYdoc = await persistence.getYDoc(docName);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(persistedYdoc));
    
    await persistence.clearDocument(docName);
    const newUpdates = Y.encodeStateAsUpdate(doc);
    await persistence.storeUpdate(docName, newUpdates);
    
    doc.on('update', async (update: Uint8Array) => {
      await persistence.storeUpdate(docName, update);
    });
    
    docs.set(docName, doc);
  }
  return doc;
};

const send = (doc: WSSharedDoc, conn: WebSocket, m: Uint8Array) => {
  if (conn.readyState === WebSocket.OPEN) {
    conn.send(m, err => {
      if (err != null) {
        closeConn(doc, conn);
      }
    });
  }
};

const closeConn = (doc: WSSharedDoc, conn: WebSocket) => {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    if (controlledIds) {
      doc.conns.delete(conn);
      awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
      if (doc.conns.size === 0) {
        doc.destroy();
        docs.delete(doc.name);
      }
    }
  }
  conn.close();
};

const setupWSConnection = async (conn: WebSocket, req: http.IncomingMessage) => {
  const docName = req.url?.slice(1).split('?')[0] || 'default';
  
  conn.binaryType = 'arraybuffer';
  
  const doc = await getYDoc(docName);
  
  doc.conns.set(conn, new Set());
  
  conn.on('message', (message: ArrayBuffer) => {
    try {
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(new Uint8Array(message));
      const messageType = decoding.readVarUint(decoder);
      
      switch (messageType) {
        case messageSync:
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
          if (encoding.length(encoder) > 1) {
            send(doc, conn, encoding.toUint8Array(encoder));
          }
          break;
        case messageAwareness: {
          awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
          break;
        }
      }
    } catch (err) {
      console.error(err);
      doc.emit('error', [err]);
    }
  });
  
  conn.on('close', () => {
    closeConn(doc, conn);
  });
  
  conn.on('error', () => {
    closeConn(doc, conn);
  });
  
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, messageSync);
  syncProtocol.writeSyncStep1(syncEncoder, doc);
  send(doc, conn, encoding.toUint8Array(syncEncoder));
  
  const awarenessStates = doc.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(awarenessEncoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())));
    send(doc, conn, encoding.toUint8Array(awarenessEncoder));
  }
};

const handleHttpRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const url = req.url || '/';
  const method = req.method || 'GET';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Yjs WebSocket Server with Time Machine\n');
    return;
  }

  if (url.startsWith('/api/snapshots/') && method === 'GET') {
    const docName = url.replace('/api/snapshots/', '') || 'default';
    const snapshots = await getSnapshots(docName);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(snapshots));
    return;
  }

  if (url.startsWith('/api/restore/') && method === 'POST') {
    const parts = url.replace('/api/restore/', '').split('/');
    const docName = parts[0] || 'default';
    const timestamp = parseInt(parts[1], 10);
    
    if (isNaN(timestamp)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid timestamp' }));
      return;
    }

    const success = await restoreSnapshot(docName, timestamp);
    res.writeHead(success ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success }));
    return;
  }

  if (url === '/api/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
};

const startServer = async () => {
  snapshotDB = new Level('./snapshots', { valueEncoding: 'json' });

  const server = http.createServer(handleHttpRequest);
  const wss = new Server({ server });

  wss.on('connection', (conn, req) => {
    setupWSConnection(conn, req);
  });

  const snapshotInterval = setInterval(async () => {
    for (const [docName, doc] of docs.entries()) {
      await createSnapshot(docName, doc);
    }
  }, SNAPSHOT_INTERVAL);

  await getYDoc('markdown-doc');
  setTimeout(async () => {
    const doc = docs.get('markdown-doc');
    if (doc) {
      await createSnapshot('markdown-doc', doc);
    }
  }, 1000);

  server.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`);
    console.log(`HTTP API available at http://localhost:${PORT}`);
    console.log(`  GET /api/snapshots/:docName - List snapshots`);
    console.log(`  POST /api/restore/:docName/:timestamp - Restore snapshot`);
  });

  process.on('SIGINT', async () => {
    clearInterval(snapshotInterval);
    for (const [docName, doc] of docs.entries()) {
      await createSnapshot(docName, doc);
    }
    await snapshotDB.close();
    process.exit(0);
  });
};

startServer().catch(console.error);
