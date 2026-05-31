const { pool } = require('../config/database');

class PermissionCache {
  constructor() {
    this.cache = new Map();
    this.TTL = 5 * 60 * 1000;
  }

  generateKey(tenantSchema, userId) {
    return `${tenantSchema}:${userId}`;
  }

  async getPermissions(tenantSchema, userId) {
    const key = this.generateKey(tenantSchema, userId);
    const cached = this.cache.get(key);

    if (cached && Date.now() < cached.expires) {
      return cached.permissions;
    }

    const result = await pool.query(
      `SELECT DISTINCT p.code 
       FROM ${tenantSchema}.user_roles ur
       JOIN ${tenantSchema}.role_permissions rp ON ur.role_id = rp.role_id
       JOIN ${tenantSchema}.permissions p ON rp.permission_id = p.id
       WHERE ur.user_id = $1`,
      [userId]
    );

    const permissions = result.rows.map(row => row.code);
    this.cache.set(key, {
      permissions,
      expires: Date.now() + this.TTL
    });

    return permissions;
  }

  invalidateUser(tenantSchema, userId) {
    const key = this.generateKey(tenantSchema, userId);
    this.cache.delete(key);
  }

  invalidateTenant(tenantSchema) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${tenantSchema}:`)) {
        this.cache.delete(key);
      }
    }
  }

  invalidateAll() {
    this.cache.clear();
  }

  cleanExpired() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now >= value.expires) {
        this.cache.delete(key);
      }
    }
  }
}

const permissionCache = new PermissionCache();

setInterval(() => {
  permissionCache.cleanExpired();
}, 60 * 1000);

module.exports = { permissionCache };
