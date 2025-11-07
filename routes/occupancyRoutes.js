const express = require('express');
const router = express.Router();
const occupancyController = require('../controllers/occupancyController');
const { authenticate } = require('../utils/auth');

router.get('/', authenticate, occupancyController.getOccupancy);
router.get('/room/:roomId', authenticate, occupancyController.getOccupancy);
router.post('/', authenticate, occupancyController.createOccupancy);
router.post('/simulate', authenticate, occupancyController.simulateOccupancy);

module.exports = router;

