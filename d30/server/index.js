const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

const BlendshapeModel = require('./model');

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, '../public')));

const PORT = process.env.PORT || 8080;

const wss = new WebSocket.Server({ server });

const clients = new Map();

class RequestQueue {
    constructor(workerId) {
        this.queue = [];
        this.processing = false;
        this.workerId = workerId;
        this.maxQueueSize = 50;
    }

    enqueue(request, ws) {
        if (this.queue.length >= this.maxQueueSize) {
            console.warn(`Queue full for worker ${this.workerId}, dropping oldest request`);
            this.queue.shift();
        }
        
        this.queue.push({ request, ws, timestamp: Date.now() });
        
        if (!this.processing) {
            this.processNext();
        }
    }

    async processNext() {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }

        this.processing = true;
        const { request, ws } = this.queue.shift();

        try {
            const startTime = Date.now();
            const blendshapes = await BlendshapeModel.infer(request.mfcc, request.emotion);
            const inferenceTime = Date.now() - startTime;

            if (inferenceTime > 50) {
                console.warn(`Slow inference: ${inferenceTime}ms for sequence ${request.sequence}`);
            }

            const response = {
                type: 'blendshapes',
                sequence: request.sequence,
                blendshapes: blendshapes,
                timestamp: request.timestamp,
                inferenceTime: inferenceTime,
                emotion: request.emotion
            };

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(response));
            }
        } catch (error) {
            console.error('Error processing request:', error);
        }

        setImmediate(() => this.processNext());
    }
}

const workerPools = new Map();
const numWorkers = 2;

for (let i = 0; i < numWorkers; i++) {
    workerPools.set(i, new RequestQueue(i));
}

let nextWorker = 0;

function getWorkerForClient(clientId) {
    const workerId = nextWorker;
    nextWorker = (nextWorker + 1) % numWorkers;
    return workerPools.get(workerId);
}

wss.on('connection', (ws) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    const worker = getWorkerForClient(clientId);
    
    clients.set(clientId, { ws, worker });
    
    console.log(`Client ${clientId} connected, assigned to worker ${Array.from(workerPools.keys()).find(k => workerPools.get(k) === worker)}`);

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: message.timestamp }));
                return;
            }

            if (message.type === 'audio_features') {
                worker.enqueue(message, ws);
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });

    ws.on('close', () => {
        console.log(`Client ${clientId} disconnected`);
        clients.delete(clientId);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
    });
});

async function initModel() {
    try {
        await BlendshapeModel.init();
        console.log('Blendshape model initialized successfully');
    } catch (error) {
        console.error('Failed to initialize model:', error);
    }
}

server.on('listening', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`WebSocket server ready`);
    console.log(`Using ${numWorkers} worker queues`);
});

initModel().then(() => {
    server.listen(PORT);
});

process.on('SIGINT', () => {
    console.log('Shutting down...');
    server.close();
    process.exit(0);
});
