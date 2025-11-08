const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { authenticate, authorize } = require('../utils/auth');

// Admin routes - Get all students
router.get('/', authenticate, authorize('admin'), studentController.getAllStudents);

// Student dashboard and profile routes
router.get('/dashboard', authenticate, authorize('student'), studentController.getStudentDashboard);
router.get('/timetable', authenticate, authorize('student'), studentController.getStudentTimetable);
router.get('/profile', authenticate, authorize('student'), studentController.getStudentProfile);
router.put('/profile', authenticate, authorize('student'), studentController.updateStudentProfile);
router.get('/attendance', authenticate, authorize('student'), studentController.getAttendanceSummary);

module.exports = router;