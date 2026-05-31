const cluster = require('cluster');
const ShardManager = require('./cluster/ShardManager');
const GatewayServer = require('./cluster/GatewayServer');
const GameShard = require('./cluster/GameShard');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const MODE = process.env.MODE || 'cluster';
const GATEWAY_PORT = parseInt(process.env.PORT) || 3000;
const BASE_SHARD_PORT = 3001;
const MAX_PLAYERS_PER_SHARD = 10;
const MAX_SHARDS = 5;

if (MODE === 'cluster' && cluster.isPrimary) {
    console.log('=== MMO Game Cluster Mode ===');
    
    const shardManager = new ShardManager({
        maxPlayersPerShard: MAX_PLAYERS_PER_SHARD,
        maxShards: MAX_SHARDS,
        basePort: BASE_SHARD_PORT
    });
    shardManager.start();
    
    console.log('=== Starting Gateway Server ===');
    const gatewayWorker = cluster.fork({
        MODE: 'gateway',
        PORT: GATEWAY_PORT,
        SHARD_ID: 'gateway'
    });
    
    console.log('Primary process ready!');
} else if (process.env.MODE === 'gateway') {
    const gateway = new GatewayServer({
        port: GATEWAY_PORT
    });
    gateway.start();
} else if (cluster.isWorker && process.env.SHARD_ID && process.env.SHARD_ID !== 'gateway') {
    console.log(`Starting Shard Worker: ${process.env.SHARD_ID}`);
    
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    
    const publicPath = path.join(__dirname, '../public');
    app.use(express.static(publicPath));
    app.get('/', (req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });
    
    const shard = new GameShard();
    shard.start(io, app);
    
    const port = parseInt(process.env.PORT) || BASE_SHARD_PORT;
    server.listen(port, () => {
        console.log(`[${process.env.SHARD_ID}] Shard server running on port ${port}`);
    });
} else {
    console.log('Starting in single server mode...');
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    
    const publicPath = path.join(__dirname, '../public');
    app.use(express.static(publicPath));
    app.get('/', (req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });
    
    const GameServer = require('./game/GameServer');
    const gameServer = new GameServer(io);
    gameServer.start();
    
    server.listen(GATEWAY_PORT, () => {
        console.log(`Single server running on http://localhost:${GATEWAY_PORT}`);
    });
}
