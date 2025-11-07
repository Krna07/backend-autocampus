const Conflict = require('../models/Conflict');
const Timetable = require('../models/Timetable');
const Room = require('../models/Room');
const notificationService = require('./notificationService');

class ConflictDetectionService {
  /**
   * Monitor room status changes using Mongoose middleware
   * This is called from the Room model's post-save hook
   */
  async monitorRoomStatusChanges(room, oldStatus) {
    try {
      console.log(`[ConflictDetection] Room ${room.code} status changed from ${oldStatus} to ${room.status}`);
      
      // Only process if status changed to unavailable
      const unavailableStatuses = ['in_maintenance', 'reserved', 'closed', 'offline'];
      
      if (unavailableStatuses.includes(room.status) && oldStatus !== room.status) {
        console.log(`[ConflictDetection] Room ${room.code} is now unavailable. Checking for conflicts...`);
        
        // Identify affected entries
        const affectedEntries = await this.identifyAffectedEntries(room._id, room.status);
        
        if (affectedEntries.length > 0) {
          console.log(`[ConflictDetection] Found ${affectedEntries.length} affected entries`);
          
          // Mark entries as affected
          await this.markEntriesAsAffected(affectedEntries, room._id, oldStatus, room.status);
          
          // Create conflict record
          const conflict = await this.createConflictRecord(room, affectedEntries, oldStatus);
          
          console.log(`[ConflictDetection] Conflict created with ID: ${conflict._id}`);
          
          return conflict;
        } else {
          console.log(`[ConflictDetection] No affected entries found for room ${room.code}`);
        }
      } else if (room.status === 'active' && unavailableStatuses.includes(oldStatus)) {
        // Room is back to available - clear affected flags
        console.log(`[ConflictDetection] Room ${room.code} is now available. Clearing affected flags...`);
        await this.clearAffectedFlags(room._id);
      }
      
      return null;
    } catch (error) {
      console.error('[ConflictDetection] Error monitoring room status changes:', error);
      throw new Error(`Conflict detection failed: ${error.message}`);
    }
  }

  /**
   * Identify all timetable entries affected by room status change
   */
  async identifyAffectedEntries(roomId, newStatus) {
    try {
      // Find all timetables with this room in their schedule
      const timetables = await Timetable.find({
        'schedule.roomRef': roomId,
        isPublished: true // Only consider published timetables
      })
        .populate('sectionRef')
        .populate({
          path: 'schedule.subjectRef',
          select: 'name code type'
        })
        .populate({
          path: 'schedule.facultyRef',
          select: 'name email'
        })
        .populate({
          path: 'schedule.roomRef',
          select: 'code name type capacity'
        });

      const affectedEntries = [];

      // Extract affected schedule items
      for (const timetable of timetables) {
        for (let i = 0; i < timetable.schedule.length; i++) {
          const scheduleItem = timetable.schedule[i];
          
          if (scheduleItem.roomRef && scheduleItem.roomRef._id.toString() === roomId.toString()) {
            affectedEntries.push({
              timetableId: timetable._id,
              timetableEntryIndex: i,
              scheduleItem: scheduleItem,
              section: timetable.sectionRef
            });
          }
        }
      }

      return affectedEntries;
    } catch (error) {
      console.error('[ConflictDetection] Error identifying affected entries:', error);
      throw error;
    }
  }

  /**
   * Mark timetable entries as affected
   */
  async markEntriesAsAffected(affectedEntries, roomId, originalStatus, newStatus) {
    try {
      const updatePromises = affectedEntries.map(async (entry) => {
        const timetable = await Timetable.findById(entry.timetableId);
        
        if (timetable && timetable.schedule[entry.timetableEntryIndex]) {
          const scheduleItem = timetable.schedule[entry.timetableEntryIndex];
          
          // Mark as affected
          scheduleItem.isAffected = true;
          scheduleItem.originalRoomId = roomId;
          scheduleItem.affectedReason = `Room status changed from ${originalStatus} to ${newStatus}`;
          scheduleItem.affectedAt = new Date();
          
          // Save the timetable
          await timetable.save();
          
          console.log(`[ConflictDetection] Marked entry as affected: ${entry.scheduleItem.subjectRef?.name} on ${entry.scheduleItem.day} Period ${entry.scheduleItem.period}`);
        }
      });

      await Promise.all(updatePromises);
      
      return affectedEntries.length;
    } catch (error) {
      console.error('[ConflictDetection] Error marking entries as affected:', error);
      throw error;
    }
  }

  /**
   * Create conflict record in database
   */
  async createConflictRecord(room, affectedEntries, originalStatus) {
    try {
      // Prepare affected entries data
      const affectedEntriesData = affectedEntries.map(entry => ({
        timetableEntryId: entry.timetableId,
        subjectId: entry.scheduleItem.subjectRef?._id,
        subjectName: entry.scheduleItem.subjectRef?.name || 'Unknown Subject',
        facultyId: entry.scheduleItem.facultyRef?._id,
        facultyName: entry.scheduleItem.facultyRef?.name || 'Unknown Faculty',
        sectionId: entry.section?._id,
        sectionName: entry.section?.name || 'Unknown Section',
        day: entry.scheduleItem.day,
        period: entry.scheduleItem.period,
        startTime: entry.scheduleItem.startTime,
        endTime: entry.scheduleItem.endTime,
        status: 'pending'
      }));

      // Create conflict record
      const conflict = await Conflict.create({
        roomId: room._id,
        roomCode: room.code,
        roomName: room.name,
        originalStatus: originalStatus,
        newStatus: room.status,
        affectedEntries: affectedEntriesData,
        status: 'active',
        resolutionSummary: {
          totalAffected: affectedEntriesData.length,
          autoResolved: 0,
          manuallyResolved: 0,
          unresolved: affectedEntriesData.length
        }
      });

      // Update timetable entries with conflict ID
      const updatePromises = affectedEntries.map(async (entry) => {
        const timetable = await Timetable.findById(entry.timetableId);
        if (timetable && timetable.schedule[entry.timetableEntryIndex]) {
          timetable.schedule[entry.timetableEntryIndex].conflictId = conflict._id;
          await timetable.save();
        }
      });

      await Promise.all(updatePromises);

      // Send notifications to admins
      try {
        await notificationService.notifyRoomConflict(conflict, room);
      } catch (notifError) {
        console.error('[ConflictDetection] Error sending notifications:', notifError);
        // Don't fail conflict creation if notification fails
      }

      return conflict;
    } catch (error) {
      console.error('[ConflictDetection] Error creating conflict record:', error);
      throw error;
    }
  }

  /**
   * Check if room has scheduled classes in date range
   */
  async checkScheduledClasses(roomId, startDate, endDate) {
    try {
      const timetables = await Timetable.find({
        'schedule.roomRef': roomId,
        isPublished: true
      })
        .populate('sectionRef')
        .populate({
          path: 'schedule.subjectRef',
          select: 'name'
        })
        .populate({
          path: 'schedule.facultyRef',
          select: 'name'
        });

      const scheduledClasses = [];

      for (const timetable of timetables) {
        for (const scheduleItem of timetable.schedule) {
          if (scheduleItem.roomRef && scheduleItem.roomRef.toString() === roomId.toString()) {
            scheduledClasses.push({
              subject: scheduleItem.subjectRef?.name || 'Unknown',
              faculty: scheduleItem.facultyRef?.name || 'Unknown',
              section: timetable.sectionRef?.name || 'Unknown',
              day: scheduleItem.day,
              period: scheduleItem.period,
              startTime: scheduleItem.startTime,
              endTime: scheduleItem.endTime
            });
          }
        }
      }

      return {
        hasScheduledClasses: scheduledClasses.length > 0,
        count: scheduledClasses.length,
        classes: scheduledClasses
      };
    } catch (error) {
      console.error('[ConflictDetection] Error checking scheduled classes:', error);
      throw error;
    }
  }

  /**
   * Clear affected flags when room becomes available again
   */
  async clearAffectedFlags(roomId) {
    try {
      const timetables = await Timetable.find({
        'schedule.originalRoomId': roomId,
        'schedule.isAffected': true
      });

      let clearedCount = 0;

      for (const timetable of timetables) {
        let modified = false;
        
        for (const scheduleItem of timetable.schedule) {
          if (scheduleItem.originalRoomId && 
              scheduleItem.originalRoomId.toString() === roomId.toString() &&
              scheduleItem.isAffected) {
            
            // Clear affected flags
            scheduleItem.isAffected = false;
            scheduleItem.conflictId = null;
            scheduleItem.originalRoomId = null;
            scheduleItem.affectedReason = null;
            scheduleItem.affectedAt = null;
            scheduleItem.requiresManualAssignment = false;
            
            modified = true;
            clearedCount++;
          }
        }
        
        if (modified) {
          await timetable.save();
        }
      }

      console.log(`[ConflictDetection] Cleared affected flags for ${clearedCount} entries`);
      
      return clearedCount;
    } catch (error) {
      console.error('[ConflictDetection] Error clearing affected flags:', error);
      throw error;
    }
  }

  /**
   * Get all active conflicts
   */
  async getActiveConflicts() {
    try {
      return await Conflict.getActiveConflicts();
    } catch (error) {
      console.error('[ConflictDetection] Error getting active conflicts:', error);
      throw error;
    }
  }

  /**
   * Get conflict by ID
   */
  async getConflictById(conflictId) {
    try {
      return await Conflict.findById(conflictId)
        .populate('roomId')
        .populate('resolvedBy', 'name email');
    } catch (error) {
      console.error('[ConflictDetection] Error getting conflict by ID:', error);
      throw error;
    }
  }
}

module.exports = new ConflictDetectionService();