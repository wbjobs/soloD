const { pool } = require('../config/database');
const { logOperation } = require('../middleware/actionLog');
const { permissionCache } = require('../middleware/permissionCache');

const getRoles = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const result = await pool.query(
      `SELECT r.*, 
              json_agg(json_build_object('id', p.id, 'name', p.name, 'code', p.code)) as permissions
       FROM ${tenantSchema}.roles r
       LEFT JOIN ${tenantSchema}.role_permissions rp ON r.id = rp.role_id
       LEFT JOIN ${tenantSchema}.permissions p ON rp.permission_id = p.id
       GROUP BY r.id
       ORDER BY r.id`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

const getRoleById = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT r.*,
              json_agg(json_build_object('id', p.id, 'name', p.name, 'code', p.code)) as permissions
       FROM ${tenantSchema}.roles r
       LEFT JOIN ${tenantSchema}.role_permissions rp ON r.id = rp.role_id
       LEFT JOIN ${tenantSchema}.permissions p ON rp.permission_id = p.id
       WHERE r.id = $1
       GROUP BY r.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '角色不存在' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

const createRole = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: '角色名称必填' });
    }

    const existingRole = await pool.query(
      `SELECT id FROM ${tenantSchema}.roles WHERE name = $1`,
      [name]
    );

    if (existingRole.rows.length > 0) {
      return res.status(400).json({ message: '角色名称已存在' });
    }

    const result = await pool.query(
      `INSERT INTO ${tenantSchema}.roles (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description`,
      [name, description]
    );

    logOperation(req, 'role:create', `创建角色: ${name}`);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

const updateRole = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const { id } = req.params;
    const { name, description } = req.body;

    const result = await pool.query(
      `UPDATE ${tenantSchema}.roles 
       SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, name, description`,
      [name, description, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: '角色不存在' });
    }

    logOperation(req, 'role:update', `更新角色ID: ${id}`);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

const deleteRole = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const { id } = req.params;

    const userCount = await pool.query(
      `SELECT COUNT(*) FROM ${tenantSchema}.user_roles WHERE role_id = $1`,
      [id]
    );

    if (parseInt(userCount.rows[0].count) > 0) {
      return res.status(400).json({ message: '该角色下还有用户，不能删除' });
    }

    const roleResult = await pool.query(
      `SELECT name FROM ${tenantSchema}.roles WHERE id = $1`,
      [id]
    );

    if (roleResult.rows.length === 0) {
      return res.status(404).json({ message: '角色不存在' });
    }

    const roleName = roleResult.rows[0].name;

    await pool.query(
      `DELETE FROM ${tenantSchema}.roles WHERE id = $1`,
      [id]
    );

    permissionCache.invalidateTenant(tenantSchema);
    logOperation(req, 'role:delete', `删除角色: ${roleName}`);

    res.json({ message: '角色已删除' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误' });
  }
};

const assignPermissions = async (req, res) => {
  try {
    const { tenantSchema } = req.user;
    const { roleId } = req.params;
    const { permissionIds } = req.body;

    await pool.query(`BEGIN`);

    await pool.query(
      `DELETE FROM ${tenantSchema}.role_permissions WHERE role_id = $1`,
      [roleId]
    );

    if (permissionIds && permissionIds.length > 0) {
      for (const permissionId of permissionIds) {
        await pool.query(
          `INSERT INTO ${tenantSchema}.role_permissions (role_id, permission_id) VALUES ($1, $2)`,
          [roleId, permissionId]
        );
      }
    }

    await pool.query(`COMMIT`);

    permissionCache.invalidateTenant(tenantSchema);
    logOperation(req, 'permission:assign', `分配权限给角色ID: ${roleId}, 权限ID: [${permissionIds.join(',')}]`);

    res.json({ message: '权限分配成功' });
  } catch (error) {
    await pool.query(`ROLLBACK`);
    res.status(500).json({ message: '服务器错误' });
  }
};

module.exports = {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  assignPermissions
};
