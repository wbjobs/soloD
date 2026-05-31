const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const UDP_PORT = 5000;
const HTTP_PORT = 3000;

const SVC_LAYERS = {
  L0: { bitrate: 500000, resolution: '320x240', fps: 15, quality: 'low' },
  L1: { bitrate: 1000000, resolution: '640x480', fps: 30, quality: 'medium' },
  L2: { bitrate: 2500000, resolution: '1280x720', fps: 30, quality: 'high' }
};

const BANDWIDTH_THRESHOLDS = {
  L0: 700000,
  L1: 1500000,
  L2: 3000000
};

const udpServer = dgram.createSocket('udp4');
const clients = new Map();
const connections = new Map();

class BandwidthEstimator {
  constructor() {
    this.packets = [];
    this.maxPackets = 50;
    this.estimatedBitrate = 1000000;
    this.lastUpdate = Date.now();
    this.packetLossRate = 0;
    this.jitter = 0;
    this.rtt = 0;
  }

  addPacket(size, timestamp, arrivalTimestamp) {
    this.packets.push({
      size,
      timestamp,
      arrivalTimestamp,
      received: true
    });

    if (this.packets.length > this.maxPackets) {
      this.packets.shift();
    }

    this.estimate();
  }

  updateRTCPReport(report) {
    if (report.jitter) {
      this.jitter = report.jitter;
    }
    if (report.fractionLost !== undefined) {
      this.packetLossRate = report.fractionLost / 256;
    }
    if (report.rtt) {
      this.rtt = report.rtt;
    }
    this.estimate();
  }

  estimate() {
    if (this.packets.length < 5) {
      return this.estimatedBitrate;
    }

    const now = Date.now();
    const windowStart = now - 1000;
    
    const recentPackets = this.packets.filter(p => p.arrivalTimestamp > windowStart);
    
    if (recentPackets.length > 0) {
      const totalBytes = recentPackets.reduce((sum, p) => sum + p.size, 0);
      const firstArrival = Math.min(...recentPackets.map(p => p.arrivalTimestamp));
      const lastArrival = Math.max(...recentPackets.map(p => p.arrivalTimestamp));
      const durationMs = Math.max(lastArrival - firstArrival, 100);
      
      const rawBitrate = (totalBytes * 8 * 1000) / durationMs;
      
      const lossFactor = Math.max(1 - this.packetLossRate * 2, 0.3);
      const jitterFactor = Math.max(1 - this.jitter / 100000, 0.5);
      
      this.estimatedBitrate = rawBitrate * lossFactor * jitterFactor * 0.8;
    }

    this.lastUpdate = now;
    return this.estimatedBitrate;
  }

  getEstimate() {
    return this.estimatedBitrate;
  }

  getStats() {
    return {
      bitrate: this.estimatedBitrate,
      packetLoss: this.packetLossRate,
      jitter: this.jitter,
      rtt: this.rtt
    };
  }
}

class ConnectionManager {
  constructor(userId1, userId2) {
    this.id = `${userId1}-${userId2}`;
    this.userId1 = userId1;
    this.userId2 = userId2;
    this.estimator = new BandwidthEstimator();
    this.currentLayer = 'L1';
    this.targetLayer = 'L1';
    this.layerSwitchCooldown = 0;
    this.stats = {
      bitrate: 1000000,
      packetLoss: 0,
      jitter: 0,
      rtt: 0,
      layerChanges: 0
    };
  }

  addPacketStats(size, timestamp, arrivalTimestamp) {
    this.estimator.addPacket(size, timestamp, arrivalTimestamp);
    this.stats = { ...this.stats, ...this.estimator.getStats() };
    this.checkLayerSwitch();
  }

  updateRTCPReport(report) {
    this.estimator.updateRTCPReport(report);
    this.stats = { ...this.stats, ...this.estimator.getStats() };
    this.checkLayerSwitch();
  }

  checkLayerSwitch() {
    if (this.layerSwitchCooldown > 0) {
      this.layerSwitchCooldown--;
      return null;
    }

    const bitrate = this.stats.bitrate;
    let newLayer = this.currentLayer;

    if (bitrate < BANDWIDTH_THRESHOLDS.L0) {
      newLayer = 'L0';
    } else if (bitrate < BANDWIDTH_THRESHOLDS.L1) {
      newLayer = 'L1';
    } else {
      newLayer = 'L2';
    }

    if (newLayer !== this.currentLayer) {
      const oldLayer = this.currentLayer;
      this.currentLayer = newLayer;
      this.targetLayer = newLayer;
      this.layerSwitchCooldown = 10;
      this.stats.layerChanges++;
      
      console.log(`SVC 层切换: ${oldLayer} -> ${newLayer}, 带宽: ${(bitrate/1000).toFixed(1)} kbps`);
      
      return {
        oldLayer,
        newLayer,
        layerConfig: SVC_LAYERS[newLayer]
      };
    }

    return null;
  }

  getCurrentLayerInfo() {
    return {
      layer: this.currentLayer,
      config: SVC_LAYERS[this.currentLayer],
      stats: this.stats
    };
  }
}

function getOrCreateConnection(userId1, userId2) {
  const connectionId1 = `${userId1}-${userId2}`;
  const connectionId2 = `${userId2}-${userId1}`;
  
  let conn = connections.get(connectionId1) || connections.get(connectionId2);
  if (!conn) {
    conn = new ConnectionManager(userId1, userId2);
    connections.set(connectionId1, conn);
  }
  return conn;
}

function handleMessage(data, senderId, sender) {
  switch (data.type) {
    case 'register':
      sender.userId = data.userId;
      console.log(`用户 ${data.userId} 已注册`);
      break;
    
    case 'offer':
    case 'answer':
    case 'candidate':
      forwardToPeer(data, senderId, sender);
      break;
    
    case 'getPeers':
      sendPeerList(sender);
      break;
    
    case 'rtcpReport':
      handleRTCPReport(data, sender);
      break;
    
    case 'packetStats':
      handlePacketStats(data, sender);
      break;
  }
}

function handleRTCPReport(data, sender) {
  const report = data.report;
  const targetUserId = data.targetUserId;
  
  if (sender.userId && targetUserId) {
    const conn = getOrCreateConnection(sender.userId, targetUserId);
    const switchInfo = conn.checkLayerSwitch();
    
    if (switchInfo) {
      sendLayerSwitchCommand(sender, targetUserId, switchInfo);
    }
    
    sendBandwidthStats(sender, targetUserId, conn.getCurrentLayerInfo());
  }
}

function handlePacketStats(data, sender) {
  const { size, timestamp, targetUserId } = data;
  
  if (sender.userId && targetUserId) {
    const conn = getOrCreateConnection(sender.userId, targetUserId);
    conn.addPacketStats(size, timestamp, Date.now());
    
    const switchInfo = conn.checkLayerSwitch();
    if (switchInfo) {
      sendLayerSwitchCommand(sender, targetUserId, switchInfo);
    }
  }
}

function sendLayerSwitchCommand(sender, targetUserId, switchInfo) {
  const message = {
    type: 'svcLayerSwitch',
    layer: switchInfo.newLayer,
    layerConfig: switchInfo.newLayer,
    reason: `带宽变化触发: ${(switchInfo.stats?.bitrate || 0)/1000} kbps`,
    fromUserId: 'server'
  };

  for (const [clientId, client] of clients.entries()) {
    if (client.userId === targetUserId) {
      if (client.type === 'ws' && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      } else if (client.type === 'udp') {
        udpServer.send(Buffer.from(JSON.stringify(message)), client.port, client.address);
      }
    }
  }
}

function sendBandwidthStats(sender, targetUserId, layerInfo) {
  const message = {
    type: 'bandwidthStats',
    stats: layerInfo.stats,
    currentLayer: layerInfo.layer,
    layerConfig: layerInfo.config,
    fromUserId: 'server'
  };

  for (const [clientId, client] of clients.entries()) {
    if (client.userId === targetUserId || client.userId === sender.userId) {
      if (client.type === 'ws' && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      } else if (client.type === 'udp') {
        udpServer.send(Buffer.from(JSON.stringify(message)), client.port, client.address);
      }
    }
  }
}

function forwardToPeer(data, senderId, sender) {
  const targetUserId = data.targetUserId;
  const message = JSON.stringify({
    ...data,
    fromUserId: sender.userId
  });
  
  for (const [clientId, client] of clients.entries()) {
    if (clientId !== senderId && client.userId === targetUserId) {
      if (client.type === 'udp') {
        udpServer.send(Buffer.from(message), client.port, client.address, (err) => {
          if (err) console.error('UDP 转发失败:', err);
        });
      } else if (client.type === 'ws' && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
      console.log(`转发 ${data.type} 从 ${sender.userId} 到 ${targetUserId}`);
      return;
    }
  }
  
  console.log(`未找到目标用户: ${targetUserId}`);
}

function sendPeerList(client) {
  const peers = [];
  for (const c of clients.values()) {
    if (c.userId && c.userId !== client.userId) {
      peers.push(c.userId);
    }
  }
  
  const message = JSON.stringify({
    type: 'peerList',
    peers
  });
  
  if (client.type === 'udp') {
    udpServer.send(Buffer.from(message), client.port, client.address);
  } else if (client.type === 'ws' && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(message);
  }
}

udpServer.on('error', (err) => {
  console.error(`UDP 服务器错误:\n${err.stack}`);
  udpServer.close();
});

udpServer.on('message', (msg, rinfo) => {
  try {
    const data = JSON.parse(msg.toString());
    const clientId = `udp:${rinfo.address}:${rinfo.port}`;
    
    let client = clients.get(clientId);
    if (!client) {
      client = { 
        type: 'udp',
        address: rinfo.address, 
        port: rinfo.port 
      };
      clients.set(clientId, client);
      console.log(`新 UDP 客户端连接: ${clientId}`);
    }

    handleMessage(data, clientId, client);
  } catch (e) {
    console.error('解析 UDP 消息失败:', e);
  }
});

udpServer.on('listening', () => {
  const address = udpServer.address();
  console.log(`UDP 信令服务器运行在 ${address.address}:${address.port}`);
});

udpServer.bind(UDP_PORT);

const httpServer = http.createServer((req, res) => {
  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './index.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const wss = new WebSocket.Server({ server: httpServer });

wss.on('connection', (ws) => {
  const clientId = `ws:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
  const client = { type: 'ws', ws };
  clients.set(clientId, client);
  
  console.log(`新 WebSocket 客户端连接: ${clientId}`);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleMessage(data, clientId, client);
    } catch (e) {
      console.error('解析 WebSocket 消息失败:', e);
    }
  });
  
  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`WebSocket 客户端断开: ${clientId}`);
  });
  
  ws.on('error', (err) => {
    console.error(`WebSocket 错误: ${err.message}`);
  });
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP 服务器运行在 http://localhost:${HTTP_PORT}`);
  console.log(`WebSocket 信令服务器运行在 ws://localhost:${HTTP_PORT}`);
  console.log(`SVC 层配置:`, SVC_LAYERS);
});
