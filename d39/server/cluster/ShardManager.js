const cluster = require('cluster');
const EventEmitter = require('events');

class ShardManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.shards = new Map();
        this.shardIdCounter = 1;
        this.maxPlayersPerShard = options.maxPlayersPerShard || 50;
        this.maxShards = options.maxShards || 10;
        this.basePort = options.basePort || 3000;
        this.globalState = {
            totalPlayers: 0,
            shards: []
        };
    }

    start() {
        if (cluster.isPrimary) {
            console.log('=== Shard Manager Started ===');
            console.log(`Primary process PID: ${process.pid}`);
            
            this.setupPrimaryProcess();
            this.createShard();
            
            setInterval(() => this.monitorAndBalance(), 5000);
        }
    }

    setupPrimaryProcess() {
        cluster.on('fork', (worker) => {
            console.log(`Shard ${worker.process.pid} forked`);
        });

        cluster.on('online', (worker) => {
            console.log(`Shard ${worker.process.pid} is online`);
        });

        cluster.on('exit', (worker, code, signal) => {
            console.log(`Shard ${worker.process.pid} exited. Code: ${code}, Signal: ${signal}`);
            const shardId = this.getShardIdByWorker(worker);
            if (shardId) {
                this.shards.delete(shardId);
                this.restartShard(shardId);
            }
        });

        cluster.on('message', (worker, message) => {
            this.handleShardMessage(worker, message);
        });
    }

    createShard() {
        if (this.shards.size >= this.maxShards) {
            console.warn('Max shards limit reached');
            return null;
        }

        const shardId = `shard-${this.shardIdCounter++}`;
        const port = this.basePort + this.shards.size;

        const worker = cluster.fork({
            SHARD_ID: shardId,
            PORT: port,
            MAX_PLAYERS: this.maxPlayersPerShard
        });

        const shardInfo = {
            id: shardId,
            port: port,
            worker: worker,
            playerCount: 0,
            maxPlayers: this.maxPlayersPerShard,
            status: 'starting',
            createdAt: Date.now()
        };

        this.shards.set(shardId, shardInfo);
        
        return shardId;
    }

    restartShard(oldShardId) {
        console.log(`Restarting shard: ${oldShardId}`);
        this.createShard();
    }

    handleShardMessage(worker, message) {
        switch (message.type) {
            case 'shardReady':
                this.onShardReady(worker, message);
                break;
            case 'playerJoined':
                this.onPlayerJoined(worker, message);
                break;
            case 'playerLeft':
                this.onPlayerLeft(worker, message);
                break;
            case 'globalBroadcast':
                this.handleGlobalBroadcast(worker, message);
                break;
            case 'getShardList':
                this.sendShardList(worker);
                break;
        }
    }

    onShardReady(worker, message) {
        const shardId = this.getShardIdByWorker(worker);
        if (shardId) {
            const shard = this.shards.get(shardId);
            shard.status = 'ready';
            console.log(`Shard ${shardId} ready on port ${shard.port}`);
            this.updateGlobalState();
        }
    }

    onPlayerJoined(worker, message) {
        const shardId = this.getShardIdByWorker(worker);
        if (shardId) {
            const shard = this.shards.get(shardId);
            shard.playerCount = message.playerCount;
            this.globalState.totalPlayers++;
            this.updateGlobalState();
        }
    }

    onPlayerLeft(worker, message) {
        const shardId = this.getShardIdByWorker(worker);
        if (shardId) {
            const shard = this.shards.get(shardId);
            shard.playerCount = message.playerCount;
            this.globalState.totalPlayers = Math.max(0, this.globalState.totalPlayers - 1);
            this.updateGlobalState();
        }
    }

    handleGlobalBroadcast(worker, message) {
        this.shards.forEach((shard) => {
            if (shard.worker !== worker && shard.status === 'ready') {
                shard.worker.send({
                    type: 'globalMessage',
                    data: message.data
                });
            }
        });
    }

    monitorAndBalance() {
        let needsNewShard = true;
        let totalPlayers = 0;

        this.shards.forEach((shard) => {
            totalPlayers += shard.playerCount;
            const load = shard.playerCount / shard.maxPlayers;
            if (load < 0.8 && shard.status === 'ready') {
                needsNewShard = false;
            }
        });

        if (needsNewShard && this.shards.size < this.maxShards && totalPlayers > 0) {
            console.log('=== Auto-scaling: Creating new shard ===');
            this.createShard();
        }

        this.cleanupEmptyShards();
    }

    cleanupEmptyShards() {
        if (this.shards.size <= 1) return;

        this.shards.forEach((shard, shardId) => {
            if (shard.playerCount === 0 && shard.status === 'ready' && this.shards.size > 1) {
                console.log(`Cleaning up empty shard: ${shardId}`);
                shard.worker.kill();
                this.shards.delete(shardId);
            }
        });
    }

    getBestShardForNewPlayer() {
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

        if (!bestShard && this.shards.size < this.maxShards) {
            const newShardId = this.createShard();
            bestShard = this.shards.get(newShardId);
        }

        return bestShard;
    }

    sendShardList(worker) {
        const shardList = Array.from(this.shards.values()).map(shard => ({
            id: shard.id,
            port: shard.port,
            playerCount: shard.playerCount,
            maxPlayers: shard.maxPlayers,
            status: shard.status
        }));

        worker.send({
            type: 'shardList',
            shards: shardList
        });
    }

    getShardIdByWorker(worker) {
        for (const [shardId, shard] of this.shards.entries()) {
            if (shard.worker === worker) {
                return shardId;
            }
        }
        return null;
    }

    updateGlobalState() {
        this.globalState.shards = Array.from(this.shards.values()).map(s => ({
            id: s.id,
            port: s.port,
            playerCount: s.playerCount,
            maxPlayers: s.maxPlayers,
            status: s.status
        }));
    }
}

module.exports = ShardManager;
