const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../utils/auth');

router.get('/', authenticate, analyticsController.getAnalytics);
router.get('/predictive', authenticate, authorize('admin'), analyticsController.getPredictiveAnalytics);
router.get('/attendance', authenticate, authorize('admin'), analyticsController.getAttendanceAnalytics);
router.get('/room/:roomId/history', authenticate, analyticsController.getRoomHistory);

module.exports = router;

