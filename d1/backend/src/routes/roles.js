const express = require('express');
const {
  getRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  assignPermissions
} = require('../controllers/roleController');
const { authMiddleware, permissionMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/', permissionMiddleware('role:view'), getRoles);
router.get('/:id', permissionMiddleware('role:view'), getRoleById);
router.post('/', permissionMiddleware('role:create'), createRole);
router.put('/:id', permissionMiddleware('role:edit'), updateRole);
router.delete('/:id', permissionMiddleware('role:delete'), deleteRole);
router.post('/:roleId/permissions', permissionMiddleware('permission:assign'), assignPermissions);

module.exports = router;
