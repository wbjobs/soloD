const Player = require('./Player');
const RoomManager = require('./RoomManager');
const EventEmitter = require('events');

class GameServer extends EventEmitter {
    constructor(io) {
        super();
        this.io = io;
        this.players = new Map();
        this.roomManager = new RoomManager();
        this.syncInterval = null;
        this.syncRate = 50;
        this.moveThreshold = 3;
        this.lastPositions = new Map();
        this.shardId = process.env.SHARD_ID || 'default';
    }

    start() {
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });

        this.startStateSync();
        console.log(`[${this.shardId}] Game Server started successfully`);
    }

    handleConnection(socket) {
        console.log(`[${this.shardId}] Player connected: ${socket.id}`);

        const player = new Player(socket);
        this.players.set(socket.id, player);
        this.lastPositions.set(socket.id, { x: player.x, y: player.y });

        socket.emit('connected', {
            playerId: player.id,
            player: player.getState(),
            rooms: this.roomManager.getAllRoomsInfo(),
            shardId: this.shardId
        });

        this.emit('playerJoined', player);

        socket.on('joinRoom', (data) => {
            this.handleJoinRoom(player, data.roomId);
        });

        socket.on('move', (data) => {
            this.handlePlayerMove(player, data.x, data.y, data.direction);
        });

        socket.on('chat', (data) => {
            this.handleChat(player, data.message);
        });

        socket.on('globalChat', (data) => {
            this.handleGlobalChat(player, data.message);
        });

        socket.on('disconnect', () => {
            this.handleDisconnect(player);
        });
    }

    handleJoinRoom(player, roomId) {
        const result = this.roomManager.joinRoom(player, roomId);
        
        if (result.success) {
            player.socket.emit('roomJoined', {
                roomId: roomId,
                roomName: result.room.name,
                players: result.players,
                yourPlayer: player.getState()
            });

            result.room.broadcast('playerJoined', {
                player: player.getState()
            }, player.id);
        } else {
            player.socket.emit('error', { message: result.message });
        }
    }

    handlePlayerMove(player, x, y, direction) {
        if (!player.roomId) return;

        const room = this.roomManager.getRoom(player.roomId);
        if (!room) return;

        const lastPos = this.lastPositions.get(player.id);
        const dist = Math.sqrt(Math.pow(x - lastPos.x, 2) + Math.pow(y - lastPos.y, 2));
        
        if (dist < this.moveThreshold) {
            return;
        }

        player.direction = direction || 0;
        room.updatePlayerPosition(player.id, x, y);
        this.lastPositions.set(player.id, { x: player.x, y: player.y });

        const moveData = {
            playerId: player.id,
            x: player.x,
            y: player.y,
            direction: player.direction,
            timestamp: Date.now()
        };

        room.broadcastToVisible(player.id, 'playerMoved', moveData);
    }

    handleChat(player, message) {
        if (!player.roomId) return;

        const room = this.roomManager.getRoom(player.roomId);
        if (!room) return;

        const chatData = {
            playerId: player.id,
            playerName: player.name,
            message: message,
            timestamp: Date.now()
        };

        room.broadcastToVisible(player.id, 'chat', chatData);
        player.socket.emit('chat', chatData);
    }

    handleGlobalChat(player, message) {
        this.emit('globalChat', {
            playerName: player.name,
            message: message,
            shardId: this.shardId
        });
    }

    handleDisconnect(player) {
        console.log(`[${this.shardId}] Player disconnected: ${player.id}`);
        
        if (player.roomId) {
            const room = this.roomManager.getRoom(player.roomId);
            if (room) {
                room.broadcast('playerLeft', { playerId: player.id });
            }
        }
        
        this.roomManager.leaveRoom(player);
        this.players.delete(player.id);
        this.lastPositions.delete(player.id);
        this.emit('playerLeft', player);
    }

    startStateSync() {
        this.syncInterval = setInterval(() => {
            this.syncPlayerStates();
        }, this.syncRate);
    }

    syncPlayerStates() {
        this.players.forEach((player) => {
            if (!player.roomId) return;

            const room = this.roomManager.getRoom(player.roomId);
            if (!room) return;

            const visibilityChanges = room.calculateAndGetVisibilityChanges(player.id);

            if (visibilityChanges.entered.length > 0) {
                const enteredPlayers = room.getPlayerStates(visibilityChanges.entered);
                if (enteredPlayers.length > 0) {
                    player.socket.emit('playersEnteredView', {
                        players: enteredPlayers,
                        timestamp: Date.now()
                    });
                }
            }

            if (visibilityChanges.left.length > 0) {
                player.socket.emit('playersLeftView', {
                    playerIds: visibilityChanges.left,
                    timestamp: Date.now()
                });
            }

            const visiblePlayers = room.getVisiblePlayers(player.id);
            player.socket.emit('stateUpdate', {
                players: visiblePlayers,
                timestamp: Date.now()
            });
        });
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
    }
}

module.exports = GameServer;
