const { pool } = require('../config/database');

async function logOperation(req, actionType, description) {
  try {
    const { id: userId, username, tenantId, tenantSchema } = req.user || {};
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';

    if (!tenantSchema) return;

    await pool.query(
      `INSERT INTO ${tenantSchema}.operation_logs 
       (user_id, username, tenant_id, action_type, description, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, username, tenantId, actionType, description, ipAddress, userAgent]
    );
  } catch (error) {
    console.error('记录操作日志失败:', error);
  }
}

const actionLogMiddleware = (actionType, getDescription) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const description = typeof getDescription === 'function' 
          ? getDescription(req, data) 
          : getDescription;
        logOperation(req, actionType, description);
      }
      originalSend.call(this, data);
    };
    
    next();
  };
};

module.exports = { logOperation, actionLogMiddleware };
