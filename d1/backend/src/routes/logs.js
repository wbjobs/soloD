const express = require('express');
const { getLogs } = require('../controllers/logController');
const { authMiddleware, permissionMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);
router.get('/', permissionMiddleware('log:view'), getLogs);

module.exports = router;
