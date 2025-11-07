const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../utils/auth');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);

module.exports = router;

