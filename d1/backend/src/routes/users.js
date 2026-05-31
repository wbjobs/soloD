const express = require('express');
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  assignRoles
} = require('../controllers/userController');
const { authMiddleware, permissionMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/', permissionMiddleware('user:view'), getUsers);
router.get('/:id', permissionMiddleware('user:view'), getUserById);
router.post('/', permissionMiddleware('user:create'), createUser);
router.put('/:id', permissionMiddleware('user:edit'), updateUser);
router.delete('/:id', permissionMiddleware('user:delete'), deleteUser);
router.post('/:userId/roles', permissionMiddleware('role:assign'), assignRoles);

module.exports = router;
