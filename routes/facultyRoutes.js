const express = require('express');
const router = express.Router();
const facultyController = require('../controllers/facultyController');
const { authenticate, authorize } = require('../utils/auth');

router.get('/', authenticate, facultyController.getAllFaculty);
router.post('/', authenticate, authorize('admin'), facultyController.createFaculty);
router.put('/:id', authenticate, authorize('admin'), facultyController.updateFaculty);

module.exports = router;

