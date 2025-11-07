const express = require('express');
const router = express.Router();
const upcomingClassesController = require('../controllers/upcomingClassesController');
const { authenticate, authorize } = require('../utils/auth');

// Routes for students
router.get('/student/upcoming', authenticate, authorize('student'), upcomingClassesController.getStudentUpcomingClasses);

// Routes for faculty
router.get('/faculty/upcoming', authenticate, authorize('faculty'), upcomingClassesController.getFacultyUpcomingClasses);

// Common routes for both students and faculty
router.get('/next-class', authenticate, upcomingClassesController.getNextClass);
router.get('/today-remaining', authenticate, upcomingClassesController.getTodayRemainingClasses);
router.get('/this-week', authenticate, upcomingClassesController.getThisWeekClasses);

module.exports = router;