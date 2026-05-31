const express = require('express');
const { login, getCurrentUser } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.get('/me', authMiddleware, getCurrentUser);

module.exports = router;
