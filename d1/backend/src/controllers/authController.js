const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { logOperation } = require('../middleware/actionLog');

const login = async (req, res) => {
  try {
    const { tenantId, username, password } = req.body;

    if (!tenantId || !username || !password) {
      return res.status(400).json({ message: '请填写所有必填字段' });
    }

    const tenantResult = await pool.query(
      'SELECT id, schema_name FROM public.tenants WHERE id = $1',
      [tenantId]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(401).json({ message: '无效的租户ID' });
    }

    const tenant = tenantResult.rows[0];
    const schemaName = tenant.schema_name;

    const userResult = await pool.query(
      `SELECT id, username, email, password, full_name, is_active 
       FROM ${schemaName}.users 
       WHERE username = $1`,
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(401).json({ message: '用户已被禁用' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { userId: user.id, tenantId: tenant.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const permissionsResult = await pool.query(
      `SELECT DISTINCT p.code 
       FROM ${schemaName}.user_roles ur
       JOIN ${schemaName}.role_permissions rp ON ur.role_id = rp.role_id
       JOIN ${schemaName}.permissions p ON rp.permission_id = p.id
       WHERE ur.user_id = $1`,
      [user.id]
    );

    const rolesResult = await pool.query(
      `SELECT r.id, r.name 
       FROM ${schemaName}.user_roles ur
       JOIN ${schemaName}.roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [user.id]
    );

    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    await pool.query(
      `INSERT INTO ${schemaName}.operation_logs 
       (user_id, username, tenant_id, action_type, description, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user.id, user.username, tenant.id, 'login', '用户登录系统', ipAddress, userAgent]
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        tenantId: tenant.id
      },
      permissions: permissionsResult.rows.map(p => p.code),
      roles: rolesResult.rows
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: '服务器错误' });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const { tenantSchema, id: userId } = req.user;

    const permissionsResult = await pool.query(
      `SELECT DISTINCT p.code 
       FROM ${tenantSchema}.user_roles ur
       JOIN ${tenantSchema}.role_permissions rp ON ur.role_id = rp.role_id
       JOIN ${tenantSchema}.permissions p ON rp.permission_id = p.id
       WHERE ur.user_id = $1`,
      [userId]
    );

    const rolesResult = await pool.query(
      `SELECT r.id, r.name 
       FROM ${tenantSchema}.user_roles ur
       JOIN ${tenantSchema}.roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [userId]
    );

    res.json({
      user: req.user,
      permissions: permissionsResult.rows.map(p => p.code),
      roles: rolesResult.rows
    });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

module.exports = { login, getCurrentUser };
