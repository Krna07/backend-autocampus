const express = require('express');
const router = express.Router();
const roomBookingController = require('../controllers/roomBookingController');
const { authenticate, authorize } = require('../utils/auth');

// All routes require authentication
router.use(authenticate);

// Get available rooms for booking
router.get('/available', roomBookingController.getAvailableRooms);

// Suggest replacement rooms for force booking
router.post('/suggest-replacements', authorize('admin'), roomBookingController.suggestReplacementRooms);

// Apply replacement rooms
router.post('/apply-replacements', authorize('admin'), roomBookingController.applyReplacements);

// Get my bookings
router.get('/my-bookings', roomBookingController.getMyBookings);

// CRUD operations
router.post('/', authorize('admin', 'faculty'), roomBookingController.createBooking);
router.get('/', roomBookingController.getAllBookings);
router.get('/:id', roomBookingController.getBookingById);
router.put('/:id', roomBookingController.updateBooking);
router.delete('/:id', authorize('admin'), roomBookingController.deleteBooking);

// Cancel booking
router.patch('/:id/cancel', roomBookingController.cancelBooking);

module.exports = router;
