const express = require('express');
const router = express.Router();
const adminTimetableController = require('../controllers/adminTimetableController');
const { authenticate, authorize } = require('../utils/auth');

// Admin Timetable Editor routes
router.get('/admin', authenticate, authorize('admin'), adminTimetableController.getAdminTimetable);
router.post('/', authenticate, authorize('admin'), adminTimetableController.saveAdminTimetable);
router.post('/section', authenticate, authorize('admin'), adminTimetableController.saveSectionTimetable);
router.get('/check', authenticate, authorize('admin'), adminTimetableController.checkConflict);
router.get('/suggestions', authenticate, authorize('admin'), adminTimetableController.getSmartSuggestions);
router.get('/available-rooms', authenticate, authorize('admin'), adminTimetableController.getAvailableRooms);
router.get('/room-suggestions', authenticate, authorize('admin'), adminTimetableController.getRoomSuggestions);
// Period times configuration
router.get('/period-times', authenticate, authorize('admin'), adminTimetableController.getPeriodTimes);
router.post('/period-times', authenticate, authorize('admin'), adminTimetableController.savePeriodTimes);

module.exports = router;