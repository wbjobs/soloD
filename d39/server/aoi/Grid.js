class Grid {
  constructor(cellSize = 100) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  getCellKey(x, y) {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    return `${cellX},${cellY}`;
  }

  addEntity(entity) {
    const key = this.getCellKey(entity.x, entity.y);
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set());
    }
    this.cells.get(key).add(entity.id);
    entity.cellKey = key;
  }

  removeEntity(entity) {
    if (entity.cellKey && this.cells.has(entity.cellKey)) {
      this.cells.get(entity.cellKey).delete(entity.id);
      if (this.cells.get(entity.cellKey).size === 0) {
        this.cells.delete(entity.cellKey);
      }
    }
  }

  updateEntity(entity, oldX, oldY) {
    const oldKey = this.getCellKey(oldX, oldY);
    const newKey = this.getCellKey(entity.x, entity.y);
    
    if (oldKey !== newKey) {
      if (this.cells.has(oldKey)) {
        this.cells.get(oldKey).delete(entity.id);
        if (this.cells.get(oldKey).size === 0) {
          this.cells.delete(oldKey);
        }
      }
      this.addEntity(entity);
    }
  }

  getEntitiesInRange(x, y, range, entityMap) {
    const entities = [];
    const rangeCells = Math.ceil(range / this.cellSize);
    const centerCellX = Math.floor(x / this.cellSize);
    const centerCellY = Math.floor(y / this.cellSize);

    for (let dx = -rangeCells; dx <= rangeCells; dx++) {
      for (let dy = -rangeCells; dy <= rangeCells; dy++) {
        const key = `${centerCellX + dx},${centerCellY + dy}`;
        if (this.cells.has(key)) {
          for (const entityId of this.cells.get(key)) {
            const entity = entityMap.get(entityId);
            if (entity) {
              const dist = Math.sqrt(
                Math.pow(entity.x - x, 2) + Math.pow(entity.y - y, 2)
              );
              if (dist <= range) {
                entities.push(entity);
              }
            }
          }
        }
      }
    }
    return entities;
  }
}

module.exports = Grid;
