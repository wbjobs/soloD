const { v4: uuidv4 } = require('uuid');

class Player {
  constructor(socket, name) {
    this.id = socket.id;
    this.socket = socket;
    this.name = name || `Player_${socket.id.slice(0, 6)}`;
    this.x = Math.random() * 1000;
    this.y = Math.random() * 1000;
    this.roomId = null;
    this.color = this.getRandomColor();
    this.direction = 0;
    this.speed = 5;
    this.lastUpdate = Date.now();
  }

  getRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  setPosition(x, y) {
    this.x = Math.max(0, Math.min(2000, x));
    this.y = Math.max(0, Math.min(2000, y));
    this.lastUpdate = Date.now();
  }

  getState() {
    return {
      id: this.id,
      name: this.name,
      x: this.x,
      y: this.y,
      color: this.color,
      direction: this.direction
    };
  }
}

module.exports = Player;
