const express = require('express');
const router = express.Router();
const sectionController = require('../controllers/sectionController');
const { authenticate, authorize } = require('../utils/auth');

router.get('/', authenticate, sectionController.getAllSections);
router.get('/:id', authenticate, sectionController.getSectionById);
router.post('/', authenticate, authorize('admin'), sectionController.createSection);
router.put('/:id', authenticate, authorize('admin'), sectionController.updateSection);

module.exports = router;

