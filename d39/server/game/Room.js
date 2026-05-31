const AOIManager = require('../aoi/AOIManager');

class Room {
  constructor(id, name, options = {}) {
    this.id = id;
    this.name = name;
    this.players = new Map();
    this.aoi = new AOIManager({
      cellSize: 100,
      viewRange: 350,
      bufferRange: 50
    });
    this.maxPlayers = options.maxPlayers || 100;
    this.createdAt = Date.now();
    this.pendingEvents = new Map();
  }

  addPlayer(player) {
    if (this.players.size >= this.maxPlayers) {
      return false;
    }
    
    this.players.set(player.id, player);
    player.roomId = this.id;
    
    this.aoi.addEntity({
      id: player.id,
      x: player.x,
      y: player.y
    });
    
    this.pendingEvents.set(player.id, { entered: [], left: [] });
    
    return true;
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      this.players.delete(playerId);
      this.aoi.removeEntity(playerId);
      this.pendingEvents.delete(playerId);
      player.roomId = null;
      return true;
    }
    return false;
  }

  updatePlayerPosition(playerId, x, y) {
    const player = this.players.get(playerId);
    if (player) {
      player.setPosition(x, y);
      this.aoi.updateEntityPosition(playerId, x, y);
      return true;
    }
    return false;
  }

  calculateAndGetVisibilityChanges(playerId) {
    const changes = this.aoi.calculateVisibilityChanges(playerId);
    const pending = this.pendingEvents.get(playerId);
    
    if (pending) {
      changes.entered = [...new Set([...pending.entered, ...changes.entered])];
      changes.left = [...new Set([...pending.left, ...changes.left])];
      
      changes.left = changes.left.filter(id => !changes.entered.includes(id));
      
      this.pendingEvents.set(playerId, { entered: [], left: [] });
    }
    
    return changes;
  }

  getVisiblePlayers(playerId) {
    const visibleEntities = this.aoi.getVisibleEntities(playerId);
    return visibleEntities.map(entity => {
      const player = this.players.get(entity.id);
      return player ? player.getState() : null;
    }).filter(Boolean);
  }

  getPlayerStates(playerIds) {
    return playerIds.map(id => {
      const player = this.players.get(id);
      return player ? player.getState() : null;
    }).filter(Boolean);
  }

  getPlayerCount() {
    return this.players.size;
  }

  getAllPlayersState() {
    return Array.from(this.players.values()).map(p => p.getState());
  }

  broadcast(event, data, excludePlayerId = null) {
    this.players.forEach((player, playerId) => {
      if (playerId !== excludePlayerId) {
        player.socket.emit(event, data);
      }
    });
  }

  broadcastToVisible(playerId, event, data) {
    const visiblePlayers = this.getVisiblePlayers(playerId);
    visiblePlayers.forEach(visiblePlayer => {
      const player = this.players.get(visiblePlayer.id);
      if (player) {
        player.socket.emit(event, data);
      }
    });
  }
}

module.exports = Room;
