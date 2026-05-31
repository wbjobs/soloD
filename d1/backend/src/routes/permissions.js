const express = require('express');
const {
  getPermissions,
  getPermissionById
} = require('../controllers/permissionController');
const { authMiddleware, permissionMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/', permissionMiddleware('permission:view'), getPermissions);
router.get('/:id', permissionMiddleware('permission:view'), getPermissionById);

module.exports = router;
