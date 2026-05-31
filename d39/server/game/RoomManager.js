const Room = require('./Room');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.defaultRoomId = 'lobby';
    this.createRoom(this.defaultRoomId, 'Main Lobby', { maxPlayers: 200 });
  }

  createRoom(roomId, name, options = {}) {
    if (this.rooms.has(roomId)) {
      return null;
    }
    
    const room = new Room(roomId, name, options);
    this.rooms.set(roomId, room);
    return room;
  }

  removeRoom(roomId) {
    if (roomId === this.defaultRoomId) {
      return false;
    }
    
    const room = this.rooms.get(roomId);
    if (room) {
      room.players.forEach(player => {
        this.joinRoom(player, this.defaultRoomId);
      });
      this.rooms.delete(roomId);
      return true;
    }
    return false;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  joinRoom(player, roomId) {
    const targetRoom = this.rooms.get(roomId);
    if (!targetRoom) {
      return { success: false, message: 'Room not found' };
    }

    if (player.roomId) {
      const currentRoom = this.rooms.get(player.roomId);
      if (currentRoom) {
        currentRoom.removePlayer(player.id);
        currentRoom.broadcast('playerLeft', { playerId: player.id });
      }
    }

    const success = targetRoom.addPlayer(player);
    if (!success) {
      return { success: false, message: 'Room is full' };
    }

    return {
      success: true,
      room: targetRoom,
      players: targetRoom.getAllPlayersState()
    };
  }

  leaveRoom(player) {
    if (player.roomId) {
      const room = this.rooms.get(player.roomId);
      if (room) {
        room.removePlayer(player.id);
        room.broadcast('playerLeft', { playerId: player.id });
      }
      player.roomId = null;
    }
  }

  getAllRoomsInfo() {
    const rooms = [];
    this.rooms.forEach((room, roomId) => {
      rooms.push({
        id: roomId,
        name: room.name,
        playerCount: room.getPlayerCount(),
        maxPlayers: room.maxPlayers
      });
    });
    return rooms;
  }

  getDefaultRoom() {
    return this.rooms.get(this.defaultRoomId);
  }
}

module.exports = RoomManager;
