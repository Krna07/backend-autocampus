const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetableController');
const { authenticate, authorize } = require('../utils/auth');

router.get('/check-data/:sectionId', authenticate, authorize('admin'), timetableController.checkDataSufficiency);
router.post('/generate', authenticate, authorize('admin'), timetableController.generateTimetable);
router.post('/generate-all', authenticate, authorize('admin'), timetableController.generateAllTimetables);
router.get('/', authenticate, timetableController.getAllTimetables);
router.get('/generated-by/me', authenticate, authorize('admin'), timetableController.getMyGeneratedTimetables);
router.get('/section/:sectionId', authenticate, timetableController.getTimetable);
router.get('/section/:sectionId/history', authenticate, authorize('admin'), timetableController.getTimetableHistory);
router.get('/faculty/my', authenticate, timetableController.getFacultyTimetable);
router.get('/student/my', authenticate, timetableController.getStudentTimetable);
router.get('/:id', authenticate, timetableController.getTimetableById);
router.put('/:id', authenticate, authorize('admin'), timetableController.updateTimetable);
router.post('/:id/publish', authenticate, authorize('admin'), timetableController.publishTimetable);
router.delete('/:id', authenticate, authorize('admin'), timetableController.deleteTimetable);
router.post('/delete-multiple', authenticate, authorize('admin'), timetableController.deleteTimetables);

module.exports = router;

