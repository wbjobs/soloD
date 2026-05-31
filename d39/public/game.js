class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.socket = null;
        this.player = null;
        this.otherPlayers = new Map();
        this.playerPositions = new Map();
        this.playerName = '';
        this.cursors = null;
        this.wasd = null;
        this.tabKey = null;
        this.targetPos = null;
        this.playerSpeed = 200;
        this.worldWidth = 2000;
        this.worldHeight = 2000;
        this.interpolationSpeed = 0.15;
        this.pendingPlayers = new Set();
        this.removingPlayers = new Map();
        this.shardId = null;
        this.shards = [];
        this.isGlobalChat = false;
    }

    preload() {
        this.load.crossOrigin = 'anonymous';
    }

    create() {
        this.physics.world.setBounds(0, 0, this.worldWidth, this.worldHeight);
        
        this.createMap();
        this.createMinimap();
        this.setupInput();
        this.setupSocket();
        this.setupChat();
        
        this.cameras.main.setBackgroundColor('#2d3436');
        this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
        
        this.time.addEvent({
            delay: 50,
            callback: this.sendPosition,
            callbackScope: this,
            loop: true
        });
    }

    createMap() {
        const gridSize = 100;
        const graphics = this.add.graphics();
        graphics.lineStyle(1, 0x444444, 0.3);
        
        for (let x = 0; x <= this.worldWidth; x += gridSize) {
            graphics.moveTo(x, 0);
            graphics.lineTo(x, this.worldHeight);
        }
        
        for (let y = 0; y <= this.worldHeight; y += gridSize) {
            graphics.moveTo(0, y);
            graphics.lineTo(this.worldWidth, y);
        }
        
        graphics.strokePath();
        
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * this.worldWidth;
            const y = Math.random() * this.worldHeight;
            const size = 20 + Math.random() * 40;
            
            const circle = this.add.circle(x, y, size, 0x555555);
            circle.setAlpha(0.3);
        }
    }

    createMinimap() {
        this.minimapCanvas = document.getElementById('minimap');
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        this.minimapCanvas.width = 150;
        this.minimapCanvas.height = 150;
    }

    updateMinimap() {
        const ctx = this.minimapCtx;
        const scale = 150 / this.worldWidth;
        
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, 150, 150);
        
        ctx.strokeStyle = '#4ECDC4';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(0, 0, 150, 150);
        
        this.otherPlayers.forEach((player, id) => {
            ctx.fillStyle = player.getData('color') || '#ff0000';
            ctx.beginPath();
            ctx.arc(player.x * scale, player.y * scale, 2, 0, Math.PI * 2);
            ctx.fill();
        });
        
        if (this.player) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(this.player.x * scale, this.player.y * scale, 3, 0, Math.PI * 2);
            ctx.fill();
            
            const viewRange = 350 * scale;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.player.x * scale, this.player.y * scale, viewRange, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    setupInput() {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });
        this.tabKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
        
        this.tabKey.on('down', () => {
            this.toggleChatMode();
        });
        
        this.input.on('pointerdown', (pointer) => {
            const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            this.targetPos = { x: worldPoint.x, y: worldPoint.y };
        });
    }

    setupSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.updateConnectionStatus(true);
            console.log('Connected to server');
        });
        
        this.socket.on('disconnect', () => {
            this.updateConnectionStatus(false);
            console.log('Disconnected from server');
        });
        
        this.socket.on('connected', (data) => {
            document.getElementById('player-id').textContent = data.playerId.slice(0, 8);
            if (data.shardId) {
                this.shardId = data.shardId;
                document.getElementById('current-shard').textContent = data.shardId;
            }
            this.socket.emit('joinRoom', { roomId: 'lobby' });
        });
        
        this.socket.on('roomJoined', (data) => {
            this.createPlayer(data.yourPlayer);
            
            data.players.forEach(playerData => {
                if (playerData.id !== data.yourPlayer.id) {
                    this.addOtherPlayer(playerData);
                }
            });
            
            this.addChatMessage('系统', `加入房间: ${data.roomName}`);
        });
        
        this.socket.on('playerJoined', (data) => {
            this.addOtherPlayer(data.player);
            this.addChatMessage('系统', `${data.player.name} 加入了游戏`);
        });
        
        this.socket.on('playerLeft', (data) => {
            this.removeOtherPlayer(data.playerId);
        });
        
        this.socket.on('playersEnteredView', (data) => {
            data.players.forEach(playerData => {
                if (!this.otherPlayers.has(playerData.id)) {
                    this.addOtherPlayer(playerData);
                }
            });
        });
        
        this.socket.on('playersLeftView', (data) => {
            data.playerIds.forEach(playerId => {
                this.scheduleRemovePlayer(playerId);
            });
        });
        
        this.socket.on('playerMoved', (data) => {
            if (!this.playerPositions.has(data.playerId)) {
                this.playerPositions.set(data.playerId, {
                    x: data.x,
                    y: data.y,
                    direction: data.direction,
                    targetX: data.x,
                    targetY: data.y
                });
            }
            
            const pos = this.playerPositions.get(data.playerId);
            pos.targetX = data.x;
            pos.targetY = data.y;
            pos.direction = data.direction;
        });
        
        this.socket.on('stateUpdate', (data) => {
            this.updateNearbyPlayers(data.players.length);
            
            const visibleIds = new Set(data.players.map(p => p.id));
            
            this.otherPlayers.forEach((player, id) => {
                if (!visibleIds.has(id)) {
                    this.scheduleRemovePlayer(id);
                }
            });
            
            data.players.forEach(playerData => {
                const pos = this.playerPositions.get(playerData.id);
                if (pos) {
                    pos.targetX = playerData.x;
                    pos.targetY = playerData.y;
                }
            });
        });
        
        this.socket.on('shardListUpdate', (data) => {
            this.shards = data.shards || [];
            this.updateShardListUI();
        });
        
        this.socket.on('globalChat', (data) => {
            this.addChatMessage(data.playerName, data.message, true, data.shardId);
        });
        
        this.socket.on('chat', (data) => {
            this.addChatMessage(data.playerName, data.message);
        });
        
        this.socket.on('error', (data) => {
            console.error('Server error:', data.message);
        });
    }

    setupChat() {
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');
        
        const sendMessage = () => {
            const message = chatInput.value.trim();
            if (message && this.socket) {
                this.socket.emit('chat', { message });
                chatInput.value = '';
            }
        };
        
        sendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    createPlayer(playerData) {
        this.player = this.physics.add.image(playerData.x, playerData.y, null);
        this.player.setCircle(15);
        this.player.setCollideWorldBounds(true);
        
        const graphics = this.make.graphics({ add: false });
        graphics.fillStyle(this.hexToNumber(playerData.color), 1);
        graphics.fillCircle(15, 15, 15);
        graphics.fillTriangle(15, 0, 30, 15, 15, 30);
        graphics.generateTexture('playerTexture', 30, 30);
        
        this.player.setTexture('playerTexture');
        this.player.setData('color', playerData.color);
        
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        
        this.updatePlayerPosition(playerData.x, playerData.y);
    }

    addOtherPlayer(playerData) {
        if (this.otherPlayers.has(playerData.id)) {
            return;
        }
        
        if (this.removingPlayers.has(playerData.id)) {
            this.removingPlayers.delete(playerData.id);
        }
        
        const otherPlayer = this.physics.add.image(playerData.x, playerData.y, null);
        otherPlayer.setCircle(15);
        
        const graphics = this.make.graphics({ add: false });
        graphics.fillStyle(this.hexToNumber(playerData.color), 1);
        graphics.fillCircle(15, 15, 15);
        graphics.fillTriangle(15, 0, 30, 15, 15, 30);
        graphics.generateTexture(`other_${playerData.id}`, 30, 30);
        
        otherPlayer.setTexture(`other_${playerData.id}`);
        otherPlayer.setData('color', playerData.color);
        
        const nameText = this.add.text(playerData.x, playerData.y - 25, playerData.name, {
            fontSize: '12px',
            fill: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.5)',
            padding: { x: 5, y: 2 }
        });
        nameText.setOrigin(0.5);
        otherPlayer.setData('nameText', nameText);
        
        this.playerPositions.set(playerData.id, {
            x: playerData.x,
            y: playerData.y,
            targetX: playerData.x,
            targetY: playerData.y,
            direction: playerData.direction || 0
        });
        
        this.otherPlayers.set(playerData.id, otherPlayer);
    }

    scheduleRemovePlayer(playerId) {
        if (this.removingPlayers.has(playerId)) {
            return;
        }
        
        this.removingPlayers.set(playerId, Date.now());
        
        this.time.delayedCall(1000, () => {
            if (this.removingPlayers.has(playerId)) {
                this.removeOtherPlayer(playerId);
                this.removingPlayers.delete(playerId);
            }
        });
    }

    cancelRemovePlayer(playerId) {
        this.removingPlayers.delete(playerId);
    }

    removeOtherPlayer(playerId) {
        const otherPlayer = this.otherPlayers.get(playerId);
        if (otherPlayer) {
            const nameText = otherPlayer.getData('nameText');
            if (nameText) nameText.destroy();
            otherPlayer.destroy();
            this.otherPlayers.delete(playerId);
            this.playerPositions.delete(playerId);
        }
    }

    sendPosition() {
        if (this.player && this.socket) {
            this.socket.emit('move', {
                x: this.player.x,
                y: this.player.y,
                direction: this.player.angle
            });
        }
    }

    update() {
        if (!this.player) return;
        
        const velocity = new Phaser.Math.Vector2(0, 0);
        
        if (this.cursors.left.isDown || this.wasd.left.isDown) {
            velocity.x = -1;
        }
        if (this.cursors.right.isDown || this.wasd.right.isDown) {
            velocity.x = 1;
        }
        if (this.cursors.up.isDown || this.wasd.up.isDown) {
            velocity.y = -1;
        }
        if (this.cursors.down.isDown || this.wasd.down.isDown) {
            velocity.y = 1;
        }
        
        if (velocity.length() > 0) {
            velocity.normalize().scale(this.playerSpeed);
            this.targetPos = null;
        } else if (this.targetPos) {
            const dx = this.targetPos.x - this.player.x;
            const dy = this.targetPos.y - this.player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 5) {
                velocity.x = (dx / dist) * this.playerSpeed;
                velocity.y = (dy / dist) * this.playerSpeed;
            } else {
                this.targetPos = null;
            }
        }
        
        this.player.setVelocity(velocity.x, velocity.y);
        
        if (velocity.length() > 0) {
            this.player.angle = Math.atan2(velocity.y, velocity.x) * (180 / Math.PI);
        }
        
        this.updatePlayerPositions();
        this.updatePlayerPosition(this.player.x, this.player.y);
        this.updateOtherPlayerNames();
        this.updateMinimap();
    }

    updatePlayerPositions() {
        this.otherPlayers.forEach((player, id) => {
            const pos = this.playerPositions.get(id);
            if (!pos) return;
            
            const dx = pos.targetX - pos.x;
            const dy = pos.targetY - pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 1) {
                pos.x += dx * this.interpolationSpeed;
                pos.y += dy * this.interpolationSpeed;
            } else {
                pos.x = pos.targetX;
                pos.y = pos.targetY;
            }
            
            player.setPosition(pos.x, pos.y);
            player.angle = pos.direction;
        });
    }

    updatePlayerPosition(x, y) {
        document.getElementById('player-x').textContent = Math.round(x);
        document.getElementById('player-y').textContent = Math.round(y);
    }

    updateNearbyPlayers(count) {
        document.getElementById('nearby-players').textContent = count;
    }

    updateOtherPlayerNames() {
        this.otherPlayers.forEach((player) => {
            const nameText = player.getData('nameText');
            if (nameText) {
                nameText.setPosition(player.x, player.y - 25);
            }
        });
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (connected) {
            statusEl.textContent = '已连接';
            statusEl.className = 'connected';
        } else {
            statusEl.textContent = '连接断开';
            statusEl.className = 'disconnected';
        }
    }

    addChatMessage(playerName, message) {
        const chatMessages = document.getElementById('chat-messages');
        const messageEl = document.createElement('div');
        messageEl.className = 'chat-message';
        messageEl.innerHTML = `<span class="chat-player">${playerName}:</span> ${message}`;
        chatMessages.appendChild(messageEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    hexToNumber(hex) {
        return parseInt(hex.replace('#', ''), 16);
    }
}

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    scene: [GameScene],
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};

const game = new Phaser.Game(config);

window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
});
