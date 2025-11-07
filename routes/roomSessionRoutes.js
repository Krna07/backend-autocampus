const express = require('express');
const router = express.Router();
const roomSessionController = require('../controllers/roomSessionController');
const { authenticate, authorize } = require('../utils/auth');

// Faculty room session management routes
router.post('/start-session', authenticate, authorize('faculty'), roomSessionController.startClassSession);
router.post('/end-session', authenticate, authorize('faculty'), roomSessionController.endClassSession);
router.get('/my-sessions', authenticate, authorize('faculty'), roomSessionController.getFacultySessions);
router.get('/my-schedule', authenticate, authorize('faculty'), roomSessionController.getFacultySchedule);
router.get('/:roomId/status', authenticate, roomSessionController.getRoomStatus);

module.exports = router;