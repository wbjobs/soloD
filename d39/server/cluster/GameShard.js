const GameServer = require('../game/GameServer');
const EventEmitter = require('events');

class GameShard extends EventEmitter {
    constructor() {
        super();
        this.shardId = process.env.SHARD_ID || 'shard-1';
        this.maxPlayers = parseInt(process.env.MAX_PLAYERS) || 50;
        this.io = null;
        this.gameServer = null;
        this.globalMessageHandlers = new Map();
    }

    start(io, expressApp) {
        this.io = io;
        this.gameServer = new GameServer(io);
        this.gameServer.roomManager.maxPlayersPerRoom = this.maxPlayers;
        
        this.setupShardCommunication();
        this.setupGlobalMessageHandlers();
        this.notifyShardReady();
        
        console.log(`[${this.shardId}] Game Shard started with max ${this.maxPlayers} players`);
    }

    setupShardCommunication() {
        if (process.send) {
            process.on('message', (message) => {
                this.handleMasterMessage(message);
            });
        }

        this.gameServer.on('playerJoined', () => {
            this.reportPlayerCount();
        });

        this.gameServer.on('playerLeft', () => {
            this.reportPlayerCount();
        });

        this.gameServer.on('globalChat', (data) => {
            this.sendGlobalChat(data.playerName, data.message);
        });
    }

    setupGlobalMessageHandlers() {
        this.globalMessageHandlers.set('globalChat', (data) => {
            this.io.emit('globalChat', data);
        });

        this.globalMessageHandlers.set('serverAnnouncement', (data) => {
            this.io.emit('serverAnnouncement', data);
        });

        this.globalMessageHandlers.set('shardListUpdate', (data) => {
            this.io.emit('shardListUpdate', data);
        });
    }

    handleMasterMessage(message) {
        switch (message.type) {
            case 'globalMessage':
                this.handleGlobalMessage(message.data);
                break;
            case 'shardList':
                this.handleShardList(message.shards);
                break;
        }
    }

    handleGlobalMessage(data) {
        const handler = this.globalMessageHandlers.get(data.type);
        if (handler) {
            handler(data);
        }
    }

    handleShardList(shards) {
        this.io.emit('shardListUpdate', { shards });
    }

    notifyShardReady() {
        if (process.send) {
            process.send({
                type: 'shardReady',
                shardId: this.shardId
            });
        }
    }

    reportPlayerCount() {
        if (process.send) {
            const playerCount = this.gameServer.players.size;
            process.send({
                type: 'playerJoined',
                playerCount: playerCount
            });
        }
    }

    broadcastToAllShards(data) {
        if (process.send) {
            process.send({
                type: 'globalBroadcast',
                data: data
            });
        }
    }

    sendGlobalChat(playerName, message) {
        this.broadcastToAllShards({
            type: 'globalChat',
            playerName: playerName,
            message: message,
            timestamp: Date.now(),
            shardId: this.shardId
        });
    }

    sendServerAnnouncement(title, content, level = 'info') {
        this.broadcastToAllShards({
            type: 'serverAnnouncement',
            title: title,
            content: content,
            level: level,
            timestamp: Date.now()
        });
    }

    getShardId() {
        return this.shardId;
    }

    getPlayerCount() {
        return this.gameServer.players.size;
    }

    getMaxPlayers() {
        return this.maxPlayers;
    }
}

module.exports = GameShard;
