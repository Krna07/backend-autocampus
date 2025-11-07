const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const { authenticate, authorize } = require('../utils/auth');

router.get('/', authenticate, roomController.getAllRooms);
router.get('/:id', authenticate, roomController.getRoomById);
router.post('/', authenticate, authorize('admin'), roomController.createRoom);
router.put('/:id', authenticate, authorize('admin'), roomController.updateRoom);
router.delete('/:id', authenticate, authorize('admin'), roomController.deleteRoom);

module.exports = router;

