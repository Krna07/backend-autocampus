const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');
const { authenticate, authorize } = require('../utils/auth');

router.get('/', authenticate, subjectController.getAllSubjects);
router.post('/', authenticate, authorize('admin'), subjectController.createSubject);
router.put('/:id', authenticate, authorize('admin'), subjectController.updateSubject);
router.delete('/:id', authenticate, authorize('admin'), subjectController.deleteSubject);

module.exports = router;

