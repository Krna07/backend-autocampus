const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate, authorize } = require('../utils/auth');

// User notification routes
router.get('/', authenticate, notificationController.getUserNotifications);
router.get('/unread-count', authenticate, notificationController.getUnreadCount);

// Mark as read routes
router.put('/mark-multiple-read', authenticate, notificationController.markMultipleAsRead);
router.put('/mark-all-read', authenticate, notificationController.markAllAsRead);
router.put('/:id/read', authenticate, notificationController.markAsRead);

// Delete routes - specific routes MUST come before /:id route
router.delete('/delete-multiple', 
  (req, res, next) => {
    console.log('[Route Debug] DELETE /delete-multiple hit');
    console.log('[Route Debug] Body:', req.body);
    console.log('[Route Debug] Headers:', req.headers);
    next();
  },
  authenticate, 
  notificationController.deleteMultipleNotifications
);
router.delete('/delete-all-read', authenticate, notificationController.deleteAllRead);
router.delete('/:id', authenticate, notificationController.deleteNotification);

// Admin notification routes
router.post('/create', authenticate, authorize('admin'), notificationController.createNotification);
router.get('/stats', authenticate, authorize('admin'), notificationController.getNotificationStats);

module.exports = router;