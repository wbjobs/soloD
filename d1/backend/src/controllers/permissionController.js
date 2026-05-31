const { pool } = require('../config/database');

const getPermissions = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const result = await pool.query(
      `SELECT * FROM ${tenantSchema}.permissions ORDER BY id`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

const getPermissionById = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT * FROM ${tenantSchema}.permissions WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '权限不存在' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

module.exports = {
  getPermissions,
  getPermissionById
};
