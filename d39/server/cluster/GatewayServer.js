const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const EventEmitter = require('events');

class GatewayServer extends EventEmitter {
    constructor(options = {}) {
        super();
        this.port = options.port || 3000;
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        this.shards = new Map();
        this.gatewayId = 'gateway-main';
    }

    start() {
        this.setupStaticFiles();
        this.setupSocketHandlers();
        this.setupMasterCommunication();
        
        this.server.listen(this.port, () => {
            console.log(`[Gateway] Gateway Server started on port ${this.port}`);
        });

        setInterval(() => this.requestShardList(), 5000);
    }

    setupStaticFiles() {
        const publicPath = path.join(__dirname, '../../public');
        this.app.use(express.static(publicPath));
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(publicPath, 'index.html'));
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            this.handleGatewayConnection(socket);
        });
    }

    handleGatewayConnection(socket) {
        console.log(`[Gateway] Client connected: ${socket.id}`);
        
        const bestShard = this.getBestShard();
        if (bestShard) {
            socket.emit('assignedShard', {
                shard: bestShard,
                gatewayPort: this.port
            });
        } else {
            socket.emit('error', { message: 'No available servers' });
        }

        socket.on('getShardList', () => {
            socket.emit('shardList', {
                shards: Array.from(this.shards.values())
            });
        });

        socket.on('disconnect', () => {
            console.log(`[Gateway] Client disconnected: ${socket.id}`);
        });
    }

    getBestShard() {
        let bestShard = null;
        let lowestLoad = Infinity;

        this.shards.forEach((shard) => {
            if (shard.status === 'ready' && shard.playerCount < shard.maxPlayers) {
                const load = shard.playerCount / shard.maxPlayers;
                if (load < lowestLoad) {
                    lowestLoad = load;
                    bestShard = shard;
                }
            }
        });

        return bestShard;
    }

    setupMasterCommunication() {
        if (process.send) {
            process.on('message', (message) => {
                this.handleMasterMessage(message);
            });
            this.requestShardList();
        }
    }

    handleMasterMessage(message) {
        switch (message.type) {
            case 'shardList':
                this.updateShardList(message.shards);
                break;
            case 'globalMessage':
                this.handleGlobalMessage(message.data);
                break;
        }
    }

    updateShardList(shards) {
        this.shards.clear();
        shards.forEach(shard => {
            this.shards.set(shard.id, shard);
        });
        this.io.emit('shardListUpdate', {
            shards: Array.from(this.shards.values())
        });
    }

    handleGlobalMessage(data) {
        this.io.emit(data.type, data);
    }

    requestShardList() {
        if (process.send) {
            process.send({ type: 'getShardList' });
        }
    }

    broadcastGlobal(data) {
        if (process.send) {
            process.send({
                type: 'globalBroadcast',
                data: data
            });
        }
    }
}

module.exports = GatewayServer;
