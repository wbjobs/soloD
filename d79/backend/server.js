const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');
const Y = require('yjs');
const { setupWSConnection } = require('y-websocket/bin/utils');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const docs = new Map();

const getYDoc = (docname) => {
  if (!docs.has(docname)) {
    const ydoc = new Y.Doc();
    docs.set(docname, ydoc);
    console.log(`Created document: ${docname}`);
  }
  return docs.get(docname);
};

wss.on('connection', (conn, req) => {
  const docname = new URL(req.url, 'http://localhost').searchParams.get('room') || 'default';
  console.log(`Client connected to document: ${docname}`);
  
  const ydoc = getYDoc(docname);
  
  setupWSConnection(conn, req, {
    docName: docname,
    gc: true
  });
  
  conn.on('close', () => {
    console.log(`Client disconnected from document: ${docname}`);
  });
  
  conn.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

app.get('/api/docs', (req, res) => {
  res.json({
    documents: Array.from(docs.keys()),
    count: docs.size
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 1234;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}`);
});