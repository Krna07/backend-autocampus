const Conflict = require('../models/Conflict');
const Timetable = require('../models/Timetable');
const Room = require('../models/Room');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const notificationService = require('./notificationService');
const AuditLog = require('../models/AuditLog');

class AutoRegenerationService {
  /**
   * Main entry point for auto-regeneration
   * Automatically reassigns affected timetable entries to suitable alternative rooms
   */
  async regenerateAffectedEntries(conflictId, adminId) {
    try {
      console.log(`[AutoRegeneration] Starting auto-regeneration for conflict ${conflictId}`);
      
      const startTime = Date.now();
      
      // Get conflict details
      const conflict = await Conflict.findById(conflictId)
        .populate('roomId');
      
      if (!conflict) {
        throw new Error('Conflict not found');
      }
      
      if (conflict.status !== 'active') {
        throw new Error('Conflict is not active');
      }
      
      const excludedRoomIds = [conflict.roomId._id];
      const results = {
        total: conflict.affectedEntries.length,
        resolved: 0,
        failed: 0,
        failedEntries: [],
        assignments: []
      };
      
      // Process each affected entry
      for (const affectedEntry of conflict.affectedEntries) {
        if (affectedEntry.status !== 'pending') {
          continue; // Skip already resolved entries
        }
        
        try {
          // Get full timetable entry details
          const timetable = await Timetable.findById(affectedEntry.timetableEntryId)
            .populate('sectionRef')
            .populate({
              path: 'schedule.subjectRef',
              select: 'name code type requiresLab requiredEquipment'
            })
            .populate({
              path: 'schedule.roomRef',
              select: 'code name type capacity equipment building floor'
            });
          
          if (!timetable) {
            console.log(`[AutoRegeneration] Timetable not found for entry ${affectedEntry.timetableEntryId}`);
            results.failed++;
            results.failedEntries.push({
              ...affectedEntry.toObject(),
              reason: 'Timetable not found'
            });
            continue;
          }
          
          // Find the specific schedule item
          const scheduleItem = timetable.schedule.find(item => 
            item.day === affectedEntry.day && 
            item.period === affectedEntry.period &&
            item.isAffected === true
          );
          
          if (!scheduleItem) {
            console.log(`[AutoRegeneration] Schedule item not found`);
            results.failed++;
            results.failedEntries.push({
              ...affectedEntry.toObject(),
              reason: 'Schedule item not found'
            });
            continue;
          }
          
          // Prepare entry details for room finding
          const entryDetails = {
            timetableId: timetable._id,
            scheduleItem: scheduleItem,
            section: timetable.sectionRef,
            day: affectedEntry.day,
            period: affectedEntry.period,
            subjectId: affectedEntry.subjectId,
            subjectName: affectedEntry.subjectName
          };
          
          // Find replacement room
          const replacementRoom = await this.findReplacementRoom(entryDetails, excludedRoomIds);
          
          if (replacementRoom) {
            // Update timetable entry
            await this.updateTimetableEntry(
              timetable._id,
              scheduleItem,
              replacementRoom._id,
              conflict._id,
              adminId
            );
            
            // Update conflict entry status
            affectedEntry.status = 'resolved';
            affectedEntry.resolvedAt = new Date();
            affectedEntry.resolvedBy = adminId;
            affectedEntry.newRoomId = replacementRoom._id;
            affectedEntry.newRoomCode = replacementRoom.code;
            
            results.resolved++;
            results.assignments.push({
              subject: affectedEntry.subjectName,
              section: affectedEntry.sectionName,
              day: affectedEntry.day,
              period: affectedEntry.period,
              oldRoom: conflict.roomCode,
              newRoom: replacementRoom.code
            });
            
            console.log(`[AutoRegeneration] Successfully reassigned ${affectedEntry.subjectName} to ${replacementRoom.code}`);
            
            // Send notification to affected users
            try {
              await notificationService.notifyRoomChange(
                conflict.roomId,
                replacementRoom,
                affectedEntry
              );
            } catch (notifError) {
              console.error('[AutoRegeneration] Error sending room change notification:', notifError);
            }
          } else {
            // No suitable room found
            scheduleItem.requiresManualAssignment = true;
            await timetable.save();
            
            affectedEntry.status = 'requires_manual';
            
            results.failed++;
            results.failedEntries.push({
              ...affectedEntry.toObject(),
              reason: 'No suitable room available'
            });
            
            console.log(`[AutoRegeneration] No suitable room found for ${affectedEntry.subjectName}`);
          }
        } catch (entryError) {
          console.error(`[AutoRegeneration] Error processing entry:`, entryError);
          results.failed++;
          results.failedEntries.push({
            ...affectedEntry.toObject(),
            reason: entryError.message
          });
        }
      }
      
      // Update conflict status and summary
      await conflict.updateResolutionSummary();
      
      if (results.failed === 0) {
        await conflict.markAsResolved(adminId, 'auto_regeneration');
      }
      
      await conflict.save();
      
      const duration = Date.now() - startTime;
      
      // Generate summary report
      const report = await this.generateSummaryReport(conflict, results, duration);
      
      console.log(`[AutoRegeneration] Completed in ${duration}ms. Resolved: ${results.resolved}, Failed: ${results.failed}`);
      
      // Send summary to admin
      try {
        await notificationService.sendResolutionSummary(adminId, conflict, {
          method: 'Auto-Regeneration',
          total: results.total,
          resolved: results.resolved,
          failed: results.failed,
          failedEntries: results.failedEntries
        });
      } catch (notifError) {
        console.error('[AutoRegeneration] Error sending resolution summary:', notifError);
      }
      
      return report;
    } catch (error) {
      console.error('[AutoRegeneration] Error in regenerateAffectedEntries:', error);
      throw error;
    }
  }
  
  /**
   * Find suitable replacement room for a timetable entry
   * Uses intelligent scoring algorithm to select best match
   */
  async findReplacementRoom(entry, excludedRoomIds = []) {
    try {
      // Get subject details
      const subject = await Subject.findById(entry.subjectId);
      const section = entry.section;
      
      if (!subject || !section) {
        return null;
      }
      
      // Query available rooms
      const availableRooms = await Room.find({
        _id: { $nin: excludedRoomIds },
        status: 'active',
        capacity: { $gte: section.strength || 30 }
      });
      
      if (availableRooms.length === 0) {
        return null;
      }
      
      // Filter out rooms that are already occupied during this time slot
      const candidateRooms = [];
      
      for (const room of availableRooms) {
        const isAvailable = await this.isRoomAvailable(
          room._id,
          entry.day,
          entry.period,
          entry.timetableId
        );
        
        if (isAvailable) {
          // Validate room suitability
          const suitability = await this.validateRoomSuitability(room, subject, section);
          
          if (suitability.isValid) {
            candidateRooms.push({
              room,
              score: suitability.score
            });
          }
        }
      }
      
      if (candidateRooms.length === 0) {
        return null;
      }
      
      // Sort by score (descending) and return best match
      candidateRooms.sort((a, b) => b.score - a.score);
      
      return candidateRooms[0].room;
    } catch (error) {
      console.error('[AutoRegeneration] Error finding replacement room:', error);
      return null;
    }
  }
  
  /**
   * Check if room is available during specific time slot
   */
  async isRoomAvailable(roomId, day, period, excludeEntryId = null) {
    try {
      const query = {
        'schedule.roomRef': roomId,
        'schedule.day': day,
        'schedule.period': period,
        isPublished: true
      };
      
      if (excludeEntryId) {
        query._id = { $ne: excludeEntryId };
      }
      
      const conflictingTimetable = await Timetable.findOne(query);
      
      return !conflictingTimetable;
    } catch (error) {
      console.error('[AutoRegeneration] Error checking room availability:', error);
      return false;
    }
  }
  
  /**
   * Validate room suitability and calculate score
   * Higher score = better match
   */
  async validateRoomSuitability(room, subject, section) {
    try {
      let score = 0;
      let isValid = true;
      
      // Type match (highest priority) - 50 points
      const requiredType = subject.type === 'Lab' || subject.requiresLab ? 'Lab' : 'Classroom';
      
      if (room.type === requiredType) {
        score += 50;
      } else if (requiredType === 'Lab' && room.type !== 'Lab') {
        // Lab required but room is not a lab - still valid but low score
        score += 10;
      } else {
        score += 25; // Partial match
      }
      
      // Capacity match - 30 points
      const sectionStrength = section.strength || 30;
      const capacityRatio = room.capacity / sectionStrength;
      
      if (capacityRatio >= 1.0 && capacityRatio <= 1.2) {
        score += 30; // Perfect fit
      } else if (capacityRatio > 1.2 && capacityRatio <= 1.5) {
        score += 20; // Acceptable
      } else if (capacityRatio > 1.5) {
        score += 10; // Too large but usable
      } else {
        // Room too small
        isValid = false;
      }
      
      // Equipment match - 20 points
      if (subject.requiredEquipment && subject.requiredEquipment.length > 0) {
        const hasAllEquipment = subject.requiredEquipment.every(
          eq => room.equipment && room.equipment.includes(eq)
        );
        
        if (hasAllEquipment) {
          score += 20;
        } else {
          score += 5; // Partial equipment match
        }
      } else {
        score += 10; // No special equipment required
      }
      
      // Room utilization (prefer less utilized rooms) - 10 points
      const utilization = await this.getRoomUtilization(room._id);
      score += Math.max(0, 10 - (utilization / 10)); // 0-10 points based on utilization
      
      // Building preference (if section has preferred buildings) - 15 points
      if (section.preferredBuildings && section.preferredBuildings.length > 0) {
        if (section.preferredBuildings.includes(room.building)) {
          score += 15;
        }
      } else {
        score += 7; // Neutral if no preference
      }
      
      return {
        isValid,
        score: Math.round(score)
      };
    } catch (error) {
      console.error('[AutoRegeneration] Error validating room suitability:', error);
      return { isValid: false, score: 0 };
    }
  }
  
  /**
   * Get room utilization percentage
   */
  async getRoomUtilization(roomId) {
    try {
      // Count how many periods this room is used per week
      const timetables = await Timetable.find({
        'schedule.roomRef': roomId,
        isPublished: true
      });
      
      let usedPeriods = 0;
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const periodsPerDay = 6; // Assuming 6 teaching periods per day
      
      for (const timetable of timetables) {
        usedPeriods += timetable.schedule.filter(
          item => item.roomRef && item.roomRef.toString() === roomId.toString()
        ).length;
      }
      
      const totalPossiblePeriods = days.length * periodsPerDay;
      const utilization = (usedPeriods / totalPossiblePeriods) * 100;
      
      return Math.round(utilization);
    } catch (error) {
      console.error('[AutoRegeneration] Error calculating room utilization:', error);
      return 50; // Default to 50% if calculation fails
    }
  }
  
  /**
   * Update timetable entry with new room assignment
   */
  async updateTimetableEntry(timetableId, scheduleItem, newRoomId, conflictId, adminId) {
    try {
      const timetable = await Timetable.findById(timetableId);
      
      if (!timetable) {
        throw new Error('Timetable not found');
      }
      
      // Find the schedule item and update it
      const item = timetable.schedule.find(s => 
        s.day === scheduleItem.day && 
        s.period === scheduleItem.period &&
        s.isAffected === true
      );
      
      if (!item) {
        throw new Error('Schedule item not found');
      }
      
      const oldRoomId = item.originalRoomId || item.roomRef;
      
      // Update room reference
      item.roomRef = newRoomId;
      item.isAffected = false;
      item.conflictId = null;
      item.requiresManualAssignment = false;
      
      await timetable.save();
      
      // Log to audit
      const [oldRoom, newRoom] = await Promise.all([
        Room.findById(oldRoomId),
        Room.findById(newRoomId)
      ]);
      
      if (oldRoom && newRoom) {
        await AuditLog.logChange({
          adminId: adminId,
          adminName: 'System (Auto-Regeneration)',
          timetableEntryId: timetableId,
          changeType: 'auto_regeneration',
          oldRoomId: oldRoom._id,
          oldRoomCode: oldRoom.code,
          oldRoomName: oldRoom.name,
          newRoomId: newRoom._id,
          newRoomCode: newRoom.code,
          newRoomName: newRoom.name,
          reason: 'Automatic room reassignment due to room status change',
          metadata: {
            conflictId: conflictId,
            day: scheduleItem.day,
            period: scheduleItem.period,
            startTime: scheduleItem.startTime,
            endTime: scheduleItem.endTime
          }
        });
      }
      
      return true;
    } catch (error) {
      console.error('[AutoRegeneration] Error updating timetable entry:', error);
      throw error;
    }
  }
  
  /**
   * Generate regeneration summary report
   */
  async generateSummaryReport(conflict, results, duration) {
    try {
      const report = {
        conflictId: conflict._id,
        roomCode: conflict.roomCode,
        roomName: conflict.roomName,
        status: conflict.newStatus,
        totalAffected: results.total,
        successfullyResolved: results.resolved,
        requiresManualAssignment: results.failed,
        successRate: results.total > 0 ? ((results.resolved / results.total) * 100).toFixed(1) : 0,
        duration: `${duration}ms`,
        assignments: results.assignments,
        failedEntries: results.failedEntries.map(entry => ({
          subject: entry.subjectName,
          section: entry.sectionName,
          faculty: entry.facultyName,
          day: entry.day,
          period: entry.period,
          time: `${entry.startTime}-${entry.endTime}`,
          reason: entry.reason
        })),
        timestamp: new Date()
      };
      
      return report;
    } catch (error) {
      console.error('[AutoRegeneration] Error generating summary report:', error);
      return {
        error: error.message,
        conflictId: conflict._id
      };
    }
  }
}

module.exports = new AutoRegenerationService();