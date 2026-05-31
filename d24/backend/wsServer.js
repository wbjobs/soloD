const WebSocket = require('ws');
const OrderSimulator = require('./orderSimulator');

class WSServer {
  constructor(httpServer) {
    this.wss = new WebSocket.Server({ server: httpServer });
    this.simulator = new OrderSimulator(100, 0.001, 100);
    this.clients = new Set();
    this.pressureInterval = null;
    this.orderBuffer = [];
    this.batchInterval = null;
    this.init();
  }

  init() {
    this.wss.on('connection', (ws) => {
      console.log('New client connected');
      this.clients.add(ws);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(ws, message);
        } catch (e) {
          console.error('Error parsing message:', e);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });

    this.simulator.start((order) => {
      this.orderBuffer.push(this.serializeOrder(order));
    });

    this.batchInterval = setInterval(() => {
      if (this.orderBuffer.length > 0) {
        this.broadcast({
          type: 'ordersBatch',
          data: this.orderBuffer
        });
        this.orderBuffer = [];
      }
    }, 100);

    this.pressureInterval = setInterval(() => {
      const pressure = this.simulator.getPressureData(1000);
      this.broadcast({
        type: 'pressure',
        data: pressure
      });
    }, 500);

    console.log('WebSocket server initialized');
  }

  serializeOrder(order) {
    return {
      ...order,
      timestamp: order.timestamp.toISOString()
    };
  }

  handleMessage(ws, message) {
    switch (message.type) {
      case 'getHistory':
        this.sendHistory(ws, message);
        break;
      case 'saveAnnotation':
        this.saveAnnotation(message.data);
        break;
      case 'getAnnotations':
            this.sendAnnotations(ws);
            break;
        case 'clearAnnotations':
            this.clearAnnotations();
            break;
        case 'getReplayData':
            this.sendReplayData(ws, message);
            break;
    }
  }

  sendReplayData(ws, message) {
    const { startTime, endTime } = message.data || {};
    const history = this.simulator.getOrderHistory(
      startTime ? new Date(startTime) : null,
      endTime ? new Date(endTime) : null
    );
    
    ws.send(JSON.stringify({
      type: 'replayData',
      data: history.map(this.serializeOrder)
    }));
  }

  sendHistory(ws, message) {
    const { startTime, endTime } = message.data || {};
    const history = this.simulator.getOrderHistory(
      startTime ? new Date(startTime) : null,
      endTime ? new Date(endTime) : null
    );
    
    ws.send(JSON.stringify({
      type: 'history',
      data: history.map(this.serializeOrder)
    }));
  }

  saveAnnotation(annotation) {
    const fs = require('fs');
    const path = require('path');
    const annotationsPath = path.join(__dirname, '..', 'data', 'annotations.json');
    
    let annotations = [];
    try {
      if (fs.existsSync(annotationsPath)) {
        const data = fs.readFileSync(annotationsPath, 'utf8');
        annotations = JSON.parse(data);
      }
    } catch (e) {
      console.error('Error reading annotations:', e);
    }
    
    annotation.id = Date.now() + Math.random().toString(36).substr(2, 9);
    annotation.createdAt = new Date().toISOString();
    annotations.push(annotation);
    
    fs.writeFileSync(annotationsPath, JSON.stringify(annotations, null, 2));
    
    this.broadcast({
      type: 'annotationSaved',
      data: annotation
    });
  }

  sendAnnotations(ws) {
    const fs = require('fs');
    const path = require('path');
    const annotationsPath = path.join(__dirname, '..', 'data', 'annotations.json');
    
    let annotations = [];
    try {
      if (fs.existsSync(annotationsPath)) {
        const data = fs.readFileSync(annotationsPath, 'utf8');
        annotations = JSON.parse(data);
      }
    } catch (e) {
      console.error('Error reading annotations:', e);
    }
    
    ws.send(JSON.stringify({
      type: 'annotations',
      data: annotations
    }));
  }

  clearAnnotations() {
    const fs = require('fs');
    const path = require('path');
    const annotationsPath = path.join(__dirname, '..', 'data', 'annotations.json');
    
    fs.writeFileSync(annotationsPath, '[]');
    
    this.broadcast({
      type: 'annotations',
      data: []
    });
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  close() {
    this.simulator.stop();
    if (this.pressureInterval) {
      clearInterval(this.pressureInterval);
    }
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
    }
    this.wss.close();
  }
}

module.exports = WSServer;