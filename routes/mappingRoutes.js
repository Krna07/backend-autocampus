const express = require('express');
const router = express.Router();
const mappingController = require('../controllers/mappingController');
const { authenticate, authorize } = require('../utils/auth');

router.get('/', authenticate, mappingController.getAllMappings);
router.post('/', authenticate, authorize('admin'), mappingController.createMapping);
router.delete('/:id', authenticate, authorize('admin'), mappingController.deleteMapping);

module.exports = router;

