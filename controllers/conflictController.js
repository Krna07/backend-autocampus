const conflictDetectionService = require('../services/conflictDetectionService');
const autoRegenerationService = require('../services/autoRegenerationService');
const smartSuggestionService = require('../services/smartSuggestionService');
const validationService = require('../services/validationService');
const notificationService = require('../services/notificationService');
const Conflict = require('../models/Conflict');
const Timetable = require('../models/Timetable');
const Room = require('../models/Room');
const AuditLog = require('../models/AuditLog');

// Get all active conflicts
exports.getAllConflicts = async (req, res) => {
  try {
    const conflicts = await conflictDetectionService.getActiveConflicts();
    res.json(conflicts);
  } catch (error) {
    console.error('Error getting conflicts:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get conflict by ID
exports.getConflictById = async (req, res) => {
  try {
    const { id } = req.params;
    const conflict = await conflictDetectionService.getConflictById(id);
    
    if (!conflict) {
      return res.status(404).json({ error: 'Conflict not found' });
    }
    
    res.json(conflict);
  } catch (error) {
    console.error('Error getting conflict:', error);
    res.status(500).json({ error: error.message });
  }
};

// Manual conflict detection (for testing or manual trigger)
exports.detectConflicts = async (req, res) => {
  try {
    const { roomId } = req.body;
    
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Manually trigger conflict detection
    const conflict = await conflictDetectionService.monitorRoomStatusChanges(room, 'active');
    
    if (conflict) {
      res.json({
        message: 'Conflict detected and created',
        conflict
      });
    } else {
      res.json({
        message: 'No conflicts detected',
        conflict: null
      });
    }
  } catch (error) {
    console.error('Error detecting conflicts:', error);
    res.status(500).json({ error: error.message });
  }
};

// Dismiss conflict
exports.dismissConflict = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;
    
    const conflict = await Conflict.findById(id);
    if (!conflict) {
      return res.status(404).json({ error: 'Conflict not found' });
    }
    
    conflict.status = 'dismissed';
    conflict.resolvedAt = new Date();
    conflict.resolvedBy = adminId;
    conflict.resolutionMethod = 'dismissed';
    
    await conflict.save();
    
    res.json({
      message: 'Conflict dismissed successfully',
      conflict
    });
  } catch (error) {
    console.error('Error dismissing conflict:', error);
    res.status(500).json({ error: error.message });
  }
};

// Auto-regenerate timetable for conflict
exports.autoRegenerate = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;
    
    const conflict = await Conflict.findById(id);
    if (!conflict) {
      return res.status(404).json({ error: 'Conflict not found' });
    }
    
    if (conflict.status !== 'active') {
      return res.status(400).json({ error: 'Conflict is not active' });
    }
    
    // Trigger auto-regeneration
    const report = await autoRegenerationService.regenerateAffectedEntries(id, adminId);
    
    res.json({
      message: 'Auto-regeneration completed',
      report
    });
  } catch (error) {
    console.error('Error in auto-regeneration:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get regeneration status
exports.getRegenerationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const conflict = await Conflict.findById(id);
    if (!conflict) {
      return res.status(404).json({ error: 'Conflict not found' });
    }
    
    res.json({
      conflictId: conflict._id,
      status: conflict.status,
      resolutionMethod: conflict.resolutionMethod,
      resolutionSummary: conflict.resolutionSummary,
      resolvedAt: conflict.resolvedAt
    });
  } catch (error) {
    console.error('Error getting regeneration status:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get regeneration report
exports.getRegenerationReport = async (req, res) => {
  try {
    const { id } = req.params;
    
    const conflict = await Conflict.findById(id)
      .populate('roomId')
      .populate('resolvedBy', 'name email');
    
    if (!conflict) {
      return res.status(404).json({ error: 'Conflict not found' });
    }
    
    const report = {
      conflictId: conflict._id,
      roomCode: conflict.roomCode,
      roomName: conflict.roomName,
      status: conflict.newStatus,
      resolutionMethod: conflict.resolutionMethod,
      resolutionSummary: conflict.resolutionSummary,
      resolvedBy: conflict.resolvedBy,
      resolvedAt: conflict.resolvedAt,
      affectedEntries: conflict.affectedEntries
    };
    
    res.json(report);
  } catch (error) {
    console.error('Error getting regeneration report:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get room suggestions for manual adjustment
exports.getRoomSuggestions = async (req, res) => {
  try {
    const { id } = req.params;
    const { entryIndex } = req.query;
    
    const conflict = await Conflict.findById(id);
    if (!conflict) {
      return res.status(404).json({ error: 'Conflict not found' });
    }
    
    const affectedEntry = conflict.affectedEntries[entryIndex];
    if (!affectedEntry) {
      return res.status(404).json({ error: 'Affected entry not found' });
    }
    
    const entryDetails = {
      subjectId: affectedEntry.subjectId,
      sectionId: affectedEntry.sectionId,
      day: affectedEntry.day,
      period: affectedEntry.period,
      excludedRoomIds: [conflict.roomId]
    };
    
    const suggestions = await smartSuggestionService.generateSuggestions(entryDetails, 5);
    
    res.json({
      entryIndex,
      affectedEntry: {
        subject: affectedEntry.subjectName,
        section: affectedEntry.sectionName,
        day: affectedEntry.day,
        period: affectedEntry.period,
        time: `${affectedEntry.startTime}-${affectedEntry.endTime}`
      },
      suggestions
    });
  } catch (error) {
    console.error('Error getting room suggestions:', error);
    res.status(500).json({ error: error.message });
  }
};

// Manual adjustment - apply room assignments
exports.manualAdjust = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignments, force = false } = req.body;
    const adminId = req.user._id;
    
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'Assignments array is required' });
    }
    
    const conflict = await Conflict.findById(id);
    if (!conflict) {
      return res.status(404).json({ error: 'Conflict not found' });
    }
    
    const results = {
      total: assignments.length,
      successful: 0,
      failed: 0,
      validationErrors: []
    };
    
    // Process each assignment
    for (const assignment of assignments) {
      const { entryIndex, newRoomId } = assignment;
      const affectedEntry = conflict.affectedEntries[entryIndex];
      
      if (!affectedEntry) {
        results.failed++;
        results.validationErrors.push({
          entryIndex,
          error: 'Entry not found'
        });
        continue;
      }
      
      // Validate assignment
      const validation = await validationService.validateRoomAssignment(
        {
          timetableId: affectedEntry.timetableEntryId,
          day: affectedEntry.day,
          period: affectedEntry.period,
          subjectId: affectedEntry.subjectId,
          sectionId: affectedEntry.sectionId
        },
        newRoomId
      );
      
      // Check if force update is needed
      if (!validation.isValid && !force) {
        results.failed++;
        results.validationErrors.push({
          entryIndex,
          validation
        });
        continue;
      }
      
      // Apply the assignment
      try {
        const timetable = await Timetable.findById(affectedEntry.timetableEntryId);
        const scheduleItem = timetable.schedule.find(s => 
          s.day === affectedEntry.day && 
          s.period === affectedEntry.period &&
          s.isAffected === true
        );
        
        if (scheduleItem) {
          const oldRoomId = scheduleItem.originalRoomId || scheduleItem.roomRef;
          
          // Update room
          scheduleItem.roomRef = newRoomId;
          scheduleItem.isAffected = false;
          scheduleItem.conflictId = null;
          scheduleItem.requiresManualAssignment = false;
          
          await timetable.save();
          
          // Update conflict entry
          affectedEntry.status = 'resolved';
          affectedEntry.resolvedAt = new Date();
          affectedEntry.resolvedBy = adminId;
          affectedEntry.newRoomId = newRoomId;
          
          // Log to audit
          const [oldRoom, newRoom] = await Promise.all([
            Room.findById(oldRoomId),
            Room.findById(newRoomId)
          ]);
          
          await AuditLog.logChange({
            adminId: adminId,
            adminName: req.user.name || req.user.email,
            timetableEntryId: timetable._id,
            changeType: force ? 'forced_update' : 'manual_adjustment',
            oldRoomId: oldRoom._id,
            oldRoomCode: oldRoom.code,
            oldRoomName: oldRoom.name,
            newRoomId: newRoom._id,
            newRoomCode: newRoom.code,
            newRoomName: newRoom.name,
            reason: 'Manual room assignment due to conflict',
            validationWarningsOverridden: force ? validation.warnings.map(w => w.message) : [],
            metadata: {
              conflictId: conflict._id,
              day: affectedEntry.day,
              period: affectedEntry.period
            }
          });
          
          // Send notifications
          await notificationService.notifyRoomChange(oldRoom, newRoom, affectedEntry, req.io);
          
          results.successful++;
        }
      } catch (updateError) {
        console.error('Error updating entry:', updateError);
        results.failed++;
        results.validationErrors.push({
          entryIndex,
          error: updateError.message
        });
      }
    }
    
    // Update conflict summary
    await conflict.updateResolutionSummary();
    
    if (conflict.affectedEntries.every(e => e.status !== 'pending')) {
      await conflict.markAsResolved(adminId, 'manual_adjustment');
    }
    
    await conflict.save();
    
    res.json({
      message: 'Manual adjustment completed',
      results
    });
  } catch (error) {
    console.error('Error in manual adjustment:', error);
    res.status(500).json({ error: error.message });
  }
};

// Validate room assignment
exports.validateRoomAssignment = async (req, res) => {
  try {
    const { timetableId, day, period, subjectId, sectionId, newRoomId } = req.body;
    
    const validation = await validationService.validateRoomAssignment(
      { timetableId, day, period, subjectId, sectionId },
      newRoomId
    );
    
    res.json(validation);
  } catch (error) {
    console.error('Error validating room assignment:', error);
    res.status(500).json({ error: error.message });
  }
};

// Force update room assignment
exports.forceUpdate = async (req, res) => {
  try {
    const { timetableId, scheduleIndex, newRoomId, reason } = req.body;
    const adminId = req.user._id;
    
    const timetable = await Timetable.findById(timetableId);
    if (!timetable) {
      return res.status(404).json({ error: 'Timetable not found' });
    }
    
    const scheduleItem = timetable.schedule[scheduleIndex];
    if (!scheduleItem) {
      return res.status(404).json({ error: 'Schedule item not found' });
    }
    
    const oldRoomId = scheduleItem.roomRef;
    
    // Update room
    scheduleItem.roomRef = newRoomId;
    await timetable.save();
    
    // Log force update
    const [oldRoom, newRoom] = await Promise.all([
      Room.findById(oldRoomId),
      Room.findById(newRoomId)
    ]);
    
    await AuditLog.logChange({
      adminId: adminId,
      adminName: req.user.name || req.user.email,
      timetableEntryId: timetable._id,
      changeType: 'forced_update',
      oldRoomId: oldRoom._id,
      oldRoomCode: oldRoom.code,
      oldRoomName: oldRoom.name,
      newRoomId: newRoom._id,
      newRoomCode: newRoom.code,
      newRoomName: newRoom.name,
      reason: reason || 'Force update by admin',
      validationWarningsOverridden: ['Force update - validation bypassed'],
      metadata: {
        day: scheduleItem.day,
        period: scheduleItem.period
      }
    });
    
    res.json({
      message: 'Force update completed',
      timetable
    });
  } catch (error) {
    console.error('Error in force update:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get audit logs
exports.getAuditLogs = async (req, res) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      adminId: req.query.adminId,
      changeType: req.query.changeType,
      roomId: req.query.roomId,
      conflictId: req.query.conflictId
    };
    
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50
    };
    
    const result = await AuditLog.queryLogs(filters, options);
    
    res.json(result);
  } catch (error) {
    console.error('Error getting audit logs:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get entry history
exports.getEntryHistory = async (req, res) => {
  try {
    const { entryId } = req.params;
    
    const history = await AuditLog.getEntryHistory(entryId);
    
    res.json(history);
  } catch (error) {
    console.error('Error getting entry history:', error);
    res.status(500).json({ error: error.message });
  }
};

// Generate audit report
exports.generateAuditReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    const report = await AuditLog.generateAuditReport(startDate, endDate);
    
    res.json(report);
  } catch (error) {
    console.error('Error generating audit report:', error);
    res.status(500).json({ error: error.message });
  }
};