const jwt = require('jsonwebtoken');
const { pool, getTenantSchema } = require('../config/database');
const { permissionCache } = require('./permissionCache');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: '未提供认证令牌' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const tenantSchema = await getTenantSchema(decoded.tenantId);
    if (!tenantSchema) {
      return res.status(401).json({ message: '无效的租户信息' });
    }

    const userResult = await pool.query(
      `SELECT id, username, email, full_name, is_active 
       FROM ${tenantSchema}.users 
       WHERE id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: '用户不存在' });
    }

    if (!userResult.rows[0].is_active) {
      return res.status(401).json({ message: '用户已被禁用' });
    }

    req.user = {
      ...userResult.rows[0],
      tenantId: decoded.tenantId,
      tenantSchema
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: '无效的令牌' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: '令牌已过期' });
    }
    res.status(500).json({ message: '服务器错误' });
  }
};

const permissionMiddleware = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const { tenantSchema, id: userId } = req.user;

      const permissions = await permissionCache.getPermissions(tenantSchema, userId);
      
      if (!permissions.includes(requiredPermission)) {
        return res.status(403).json({ message: '权限不足' });
      }

      req.user.permissions = permissions;
      next();
    } catch (error) {
      res.status(500).json({ message: '服务器错误' });
    }
  };
};

module.exports = { authMiddleware, permissionMiddleware };
