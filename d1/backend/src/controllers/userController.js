const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { logOperation } = require('../middleware/actionLog');
const { permissionCache } = require('../middleware/permissionCache');

const getUsers = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.full_name, u.is_active, u.created_at,
              json_agg(json_build_object('id', r.id, 'name', r.name)) as roles
       FROM ${tenantSchema}.users u
       LEFT JOIN ${tenantSchema}.user_roles ur ON u.id = ur.user_id
       LEFT JOIN ${tenantSchema}.roles r ON ur.role_id = r.id
       GROUP BY u.id
       ORDER BY u.id`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

const getUserById = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.full_name, u.is_active,
              json_agg(json_build_object('id', r.id, 'name', r.name)) as roles
       FROM ${tenantSchema}.users u
       LEFT JOIN ${tenantSchema}.user_roles ur ON u.id = ur.user_id
       LEFT JOIN ${tenantSchema}.roles r ON ur.role_id = r.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

const createUser = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const { username, email, password, fullName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: '请填写必填字段' });
    }

    const existingUser = await pool.query(
      `SELECT id FROM ${tenantSchema}.users WHERE username = $1 OR email = $2`,
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: '用户名或邮箱已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO ${tenantSchema}.users (username, email, password, full_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, full_name, is_active`,
      [username, email, hashedPassword, fullName]
    );

    logOperation(req, 'user:create', `创建用户: ${username}`);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const { id } = req.params;
    const { email, fullName, isActive } = req.body;

    const result = await pool.query(
      `UPDATE ${tenantSchema}.users 
       SET email = $1, full_name = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, username, email, full_name, is_active`,
      [email, fullName, isActive, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    logOperation(req, 'user:update', `更新用户ID: ${id}`);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const { id } = req.params;

    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ message: '不能删除自己的账户' });
    }

    const userResult = await pool.query(
      `SELECT username FROM ${tenantSchema}.users WHERE id = $1`,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const username = userResult.rows[0].username;

    await pool.query(
      `DELETE FROM ${tenantSchema}.users WHERE id = $1`,
      [id]
    );

    logOperation(req, 'user:delete', `删除用户: ${username}`);

    res.json({ message: '用户已删除' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

const assignRoles = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const { userId } = req.params;
    const { roleIds } = req.body;

    await pool.query(`BEGIN`);

    await pool.query(
      `DELETE FROM ${tenantSchema}.user_roles WHERE user_id = $1`,
      [userId]
    );

    if (roleIds && roleIds.length > 0) {
      for (const roleId of roleIds) {
        await pool.query(
          `INSERT INTO ${tenantSchema}.user_roles (user_id, role_id) VALUES ($1, $2)`,
          [userId, roleId]
        );
      }
    }

    await pool.query(`COMMIT`);
    
    permissionCache.invalidateUser(tenantSchema, userId);
    logOperation(req, 'role:assign', `分配角色给用户ID: ${userId}, 角色ID: [${roleIds.join(',')}]`);

    res.json({ message: '角色分配成功' });
  } catch (error) {
    await pool.query(`ROLLBACK`);
    res.status(500).json({ message: '服务器错误' });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  assignRoles
};
