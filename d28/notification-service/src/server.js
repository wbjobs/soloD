const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const PROTO_PATH = path.join(__dirname, '../../proto/routing.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const routingProto = grpc.loadPackageDefinition(packageDefinition).routing;

const activeStreams = new Map();
const webSocketClients = new Set();

const locationBuffer = new Map();
const BUFFER_THROTTLE_MS = 500;
const BATCH_SIZE = 50;

const stats = {
  totalPushes: 0,
  avgLatency: 0,
  lastMinutePushes: 0
};

setInterval(() => {
  stats.lastMinutePushes = 0;
}, 60000);

function serializeUpdate(update) {
  return JSON.stringify({
    driver_id: update.driver_id,
    location: update.location,
    heading: update.heading,
    timestamp: update.timestamp
  });
}

function sendWebSocketMessage(ws, message) {
  return new Promise((resolve, reject) => {
    if (ws.readyState !== WebSocket.OPEN) {
      resolve(false);
      return;
    }
    ws.send(message, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve(true);
      }
    });
  });
}

async function batchPushToWebSocket(message) {
  const clients = Array.from(webSocketClients);
  const batches = [];
  
  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    batches.push(clients.slice(i, i + BATCH_SIZE));
  }
  
  let successCount = 0;
  for (const batch of batches) {
    const promises = batch.map(ws => 
      sendWebSocketMessage(ws, message).catch(() => false)
    );
    const results = await Promise.all(promises);
    successCount += results.filter(r => r).length;
  }
  
  return successCount;
}

function shouldThrottle(driverId) {
  const lastPush = locationBuffer.get(driverId);
  const now = Date.now();
  if (lastPush && now - lastPush < BUFFER_THROTTLE_MS) {
    return true;
  }
  locationBuffer.set(driverId, now);
  return false;
}

function subscribeDriverLocation(call) {
  const { driver_id, order_id } = call.request;
  const key = `${driver_id}_${order_id}`;
  activeStreams.set(key, call);
  
  call.on('cancelled', () => {
    activeStreams.delete(key);
  });
}

async function publishDriverLocation(call, callback) {
  const startTime = Date.now();
  const update = call.request;
  
  if (shouldThrottle(update.driver_id)) {
    callback(null, { 
      success: true, 
      throttled: true,
      throttled_ms: BUFFER_THROTTLE_MS 
    });
    return;
  }
  
  setImmediate(() => {
    activeStreams.forEach((stream, key) => {
      if (key.startsWith(update.driver_id)) {
        try {
          stream.write(update);
        } catch (e) {
          console.error('gRPC stream write error:', e.message);
        }
      }
    });
  });
  
  try {
    const serializedMessage = serializeUpdate(update);
    const wsCount = await batchPushToWebSocket(serializedMessage);
    
    const latency = Date.now() - startTime;
    stats.totalPushes++;
    stats.lastMinutePushes++;
    stats.avgLatency = (stats.avgLatency * (stats.totalPushes - 1) + latency) / stats.totalPushes;
    
    if (stats.totalPushes % 100 === 0) {
      console.log(`[Stats] Total pushes: ${stats.totalPushes}, Avg latency: ${stats.avgLatency.toFixed(2)}ms, WebSocket clients: ${wsCount}`);
    }
    
    callback(null, { 
      success: true, 
      latency_ms: latency,
      websocket_clients: wsCount
    });
  } catch (error) {
    console.error('Publish error:', error.message);
    callback(null, { success: false, error: error.message });
  }
}

function startGrpcServer() {
  const server = new grpc.Server();
  server.addService(routingProto.NotificationService.service, {
    subscribeDriverLocation,
    publishDriverLocation
  });
  
  const port = '0.0.0.0:50053';
  server.bindAsync(port, grpc.ServerCredentials.createInsecure(), () => {
    console.log(`Notification gRPC Service running on ${port}`);
    server.start();
  });
}

function startWebSocketServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });
  
  wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');
    webSocketClients.add(ws);
    
    ws.on('close', () => {
      webSocketClients.delete(ws);
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
  
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', clients: webSocketClients.size });
  });
  
  const wsPort = 8080;
  server.listen(wsPort, () => {
    console.log(`WebSocket server running on port ${wsPort}`);
  });
}

function main() {
  startGrpcServer();
  startWebSocketServer();
}

main();
