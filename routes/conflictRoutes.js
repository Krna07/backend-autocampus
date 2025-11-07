const express = require('express');
const router = express.Router();
const conflictController = require('../controllers/conflictController');
const { authenticate, authorize } = require('../utils/auth');

// Conflict management endpoints (Admin only)
router.get('/', authenticate, authorize('admin'), conflictController.getAllConflicts);
router.get('/:id', authenticate, authorize('admin'), conflictController.getConflictById);
router.post('/detect', authenticate, authorize('admin'), conflictController.detectConflicts);
router.put('/:id/dismiss', authenticate, authorize('admin'), conflictController.dismissConflict);

// Auto-regeneration endpoints (Admin only)
router.post('/:id/auto-regenerate', authenticate, authorize('admin'), conflictController.autoRegenerate);
router.get('/:id/regeneration-status', authenticate, authorize('admin'), conflictController.getRegenerationStatus);
router.get('/:id/regeneration-report', authenticate, authorize('admin'), conflictController.getRegenerationReport);

// Manual adjustment endpoints (Admin only)
router.get('/:id/suggestions', authenticate, authorize('admin'), conflictController.getRoomSuggestions);
router.post('/:id/manual-adjust', authenticate, authorize('admin'), conflictController.manualAdjust);

// Validation endpoints (Admin only)
router.post('/validate-room', authenticate, authorize('admin'), conflictController.validateRoomAssignment);
router.post('/force-update', authenticate, authorize('admin'), conflictController.forceUpdate);

// Audit log endpoints (Admin only)
router.get('/audit-logs/list', authenticate, authorize('admin'), conflictController.getAuditLogs);
router.get('/audit-logs/entry/:entryId', authenticate, authorize('admin'), conflictController.getEntryHistory);
router.get('/audit-logs/report', authenticate, authorize('admin'), conflictController.generateAuditReport);

module.exports = router;