const Grid = require('./Grid');

class AOIManager {
  constructor(options = {}) {
    this.grid = new Grid(options.cellSize || 100);
    this.viewRange = options.viewRange || 300;
    this.bufferRange = options.bufferRange || 50;
    this.entities = new Map();
    this.visibleCache = new Map();
  }

  addEntity(entity) {
    this.entities.set(entity.id, entity);
    this.grid.addEntity(entity);
    this.visibleCache.set(entity.id, new Set());
  }

  removeEntity(entityId) {
    const entity = this.entities.get(entityId);
    if (entity) {
      this.grid.removeEntity(entity);
      this.entities.delete(entityId);
      this.visibleCache.delete(entityId);
    }
  }

  updateEntityPosition(entityId, x, y) {
    const entity = this.entities.get(entityId);
    if (!entity) return;

    const oldX = entity.x;
    const oldY = entity.y;
    
    entity.x = x;
    entity.y = y;
    
    this.grid.updateEntity(entity, oldX, oldY);
  }

  getVisibleEntities(entityId) {
    const entity = this.entities.get(entityId);
    if (!entity) return [];
    
    return this.grid.getEntitiesInRange(
      entity.x, 
      entity.y, 
      this.viewRange, 
      this.entities
    ).filter(e => e.id !== entityId);
  }

  calculateVisibilityChanges(entityId) {
    const entity = this.entities.get(entityId);
    if (!entity) return { entered: [], left: [] };

    const currentVisible = new Set(
      this.grid.getEntitiesInRange(entity.x, entity.y, this.viewRange, this.entities)
        .map(e => e.id)
        .filter(id => id !== entityId)
    );

    const previousVisible = this.visibleCache.get(entityId) || new Set();
    const entered = [];
    const left = [];

    currentVisible.forEach(id => {
      if (!previousVisible.has(id)) {
        entered.push(id);
      }
    });

    previousVisible.forEach(id => {
      if (!currentVisible.has(id)) {
        const otherEntity = this.entities.get(id);
        if (otherEntity) {
          const dist = Math.sqrt(
            Math.pow(entity.x - otherEntity.x, 2) + 
            Math.pow(entity.y - otherEntity.y, 2)
          );
          if (dist > this.viewRange + this.bufferRange) {
            left.push(id);
          }
        }
      }
    });

    this.visibleCache.set(entityId, currentVisible);

    return { entered, left };
  }

  getEntity(entityId) {
    return this.entities.get(entityId);
  }

  getAllEntities() {
    return Array.from(this.entities.values());
  }
}

module.exports = AOIManager;
