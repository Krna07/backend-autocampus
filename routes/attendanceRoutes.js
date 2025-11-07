const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../utils/auth');

// Faculty routes
router.post('/generate-qr', authenticate, authorize('faculty'), attendanceController.generateSessionQR);
router.get('/session/:sessionId', authenticate, authorize('faculty'), attendanceController.getSessionAttendance);
router.post('/mark', authenticate, authorize('faculty'), attendanceController.markAttendance);

// Student routes
router.post('/checkin', authenticate, authorize('student'), attendanceController.checkInStudent);
router.get('/my-attendance', authenticate, authorize('student'), attendanceController.getStudentAttendance);

// Admin routes (can access all attendance data)
router.get('/session/:sessionId/admin', authenticate, authorize('admin'), attendanceController.getSessionAttendance);

module.exports = router;