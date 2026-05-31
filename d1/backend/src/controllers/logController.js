const { pool } = require('../config/database');

const getLogs = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const { actionType, username, startDate, endDate } = req.query;

    let query = `SELECT * FROM ${tenantSchema}.operation_logs WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (actionType) {
      query += ` AND action_type = $${paramIndex}`;
      params.push(actionType);
      paramIndex++;
    }

    if (username) {
      query += ` AND username ILIKE $${paramIndex}`;
      params.push(`%${username}%`);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('获取日志失败:', error);
    res.status(500).json({ message: '服务器错误' });
  }
};

module.exports = { getLogs };
