const Room = require('../models/Room');
const Timetable = require('../models/Timetable');
const Subject = require('../models/Subject');
const Section = require('../models/Section');

class ValidationService {
  /**
   * Comprehensive validation of room assignment
   * Returns validation result with errors and warnings
   */
  async validateRoomAssignment(entryDetails, newRoomId) {
    try {
      const { timetableId, day, period, subjectId, sectionId } = entryDetails;
      
      const validationChecks = {
        roomStatus: await this.validateRoomStatus(newRoomId),
        capacity: await this.validateCapacity(newRoomId, sectionId),
        equipment: await this.validateEquipment(newRoomId, subjectId),
        availability: await this.validateTimeSlotAvailability(newRoomId, day, period, timetableId),
        roomType: await this.validateRoomType(newRoomId, subjectId)
      };
      
      return this.generateValidationResult(validationChecks);
    } catch (error) {
      console.error('[Validation] Error in validateRoomAssignment:', error);
      return {
        isValid: false,
        canForceUpdate: false,
        errors: [{
          type: 'validation_error',
          message: `Validation failed: ${error.message}`,
          severity: 'error'
        }],
        warnings: []
      };
    }
  }
  
  /**
   * Validate room status is available
   */
  async validateRoomStatus(roomId) {
    try {
      const room = await Room.findById(roomId);
      
      if (!room) {
        return {
          passed: false,
          severity: 'error',
          type: 'room_not_found',
          message: 'Room not found',
          canOverride: false
        };
      }
      
      if (room.status !== 'active') {
        return {
          passed: false,
          severity: 'error',
          type: 'room_unavailable',
          message: `Room is currently ${room.status.replace('_', ' ')}`,
          canOverride: false,
          data: { status: room.status }
        };
      }
      
      return {
        passed: true,
        message: 'Room is available'
      };
    } catch (error) {
      return {
        passed: false,
        severity: 'error',
        type: 'validation_error',
        message: error.message,
        canOverride: false
      };
    }
  }
  
  /**
   * Validate room capacity is sufficient
   */
  async validateCapacity(roomId, sectionId) {
    try {
      const [room, section] = await Promise.all([
        Room.findById(roomId),
        Section.findById(sectionId)
      ]);
      
      if (!room || !section) {
        return {
          passed: false,
          severity: 'error',
          type: 'data_not_found',
          message: 'Room or section not found',
          canOverride: false
        };
      }
      
      const sectionStrength = section.strength || 30;
      
      if (room.capacity < sectionStrength) {
        return {
          passed: false,
          severity: 'error',
          type: 'capacity_insufficient',
          message: `Room capacity (${room.capacity}) is less than section size (${sectionStrength})`,
          canOverride: true,
          data: {
            roomCapacity: room.capacity,
            sectionStrength: sectionStrength,
            deficit: sectionStrength - room.capacity
          }
        };
      }
      
      // Warning if room is much larger than needed
      if (room.capacity > sectionStrength * 2) {
        return {
          passed: true,
          severity: 'warning',
          type: 'capacity_oversized',
          message: `Room capacity (${room.capacity}) is significantly larger than section size (${sectionStrength})`,
          canOverride: true,
          data: {
            roomCapacity: room.capacity,
            sectionStrength: sectionStrength
          }
        };
      }
      
      return {
        passed: true,
        message: 'Room capacity is appropriate'
      };
    } catch (error) {
      return {
        passed: false,
        severity: 'error',
        type: 'validation_error',
        message: error.message,
        canOverride: false
      };
    }
  }
  
  /**
   * Validate room has required equipment
   */
  async validateEquipment(roomId, subjectId) {
    try {
      const [room, subject] = await Promise.all([
        Room.findById(roomId),
        Subject.findById(subjectId)
      ]);
      
      if (!room || !subject) {
        return {
          passed: false,
          severity: 'error',
          type: 'data_not_found',
          message: 'Room or subject not found',
          canOverride: false
        };
      }
      
      // If no equipment required, pass
      if (!subject.requiredEquipment || subject.requiredEquipment.length === 0) {
        return {
          passed: true,
          message: 'No special equipment required'
        };
      }
      
      const roomEquipment = room.equipment || [];
      const missingEquipment = subject.requiredEquipment.filter(
        eq => !roomEquipment.includes(eq)
      );
      
      if (missingEquipment.length > 0) {
        return {
          passed: false,
          severity: 'warning',
          type: 'equipment_missing',
          message: `Room is missing required equipment: ${missingEquipment.join(', ')}`,
          canOverride: true,
          data: {
            required: subject.requiredEquipment,
            available: roomEquipment,
            missing: missingEquipment
          }
        };
      }
      
      return {
        passed: true,
        message: 'All required equipment available'
      };
    } catch (error) {
      return {
        passed: false,
        severity: 'error',
        type: 'validation_error',
        message: error.message,
        canOverride: false
      };
    }
  }
  
  /**
   * Validate time slot availability (no conflicts)
   */
  async validateTimeSlotAvailability(roomId, day, period, excludeTimetableId = null) {
    try {
      const query = {
        'schedule.roomRef': roomId,
        'schedule.day': day,
        'schedule.period': period,
        isPublished: true
      };
      
      if (excludeTimetableId) {
        query._id = { $ne: excludeTimetableId };
      }
      
      const conflictingTimetable = await Timetable.findOne(query)
        .populate('sectionRef', 'name')
        .populate({
          path: 'schedule.subjectRef',
          select: 'name'
        })
        .populate({
          path: 'schedule.facultyRef',
          select: 'name'
        });
      
      if (conflictingTimetable) {
        // Find the specific conflicting schedule item
        const conflictingItem = conflictingTimetable.schedule.find(
          item => item.roomRef && 
                  item.roomRef.toString() === roomId.toString() &&
                  item.day === day && 
                  item.period === period
        );
        
        return {
          passed: false,
          severity: 'error',
          type: 'room_occupied',
          message: `Room is already occupied during this time slot`,
          canOverride: true,
          data: {
            conflictingClass: {
              subject: conflictingItem?.subjectRef?.name || 'Unknown',
              section: conflictingTimetable.sectionRef?.name || 'Unknown',
              faculty: conflictingItem?.facultyRef?.name || 'Unknown',
              day: day,
              period: period,
              time: conflictingItem ? `${conflictingItem.startTime}-${conflictingItem.endTime}` : 'Unknown'
            }
          }
        };
      }
      
      return {
        passed: true,
        message: 'Time slot is available'
      };
    } catch (error) {
      return {
        passed: false,
        severity: 'error',
        type: 'validation_error',
        message: error.message,
        canOverride: false
      };
    }
  }
  
  /**
   * Validate room type matches subject requirements
   */
  async validateRoomType(roomId, subjectId) {
    try {
      const [room, subject] = await Promise.all([
        Room.findById(roomId),
        Subject.findById(subjectId)
      ]);
      
      if (!room || !subject) {
        return {
          passed: false,
          severity: 'error',
          type: 'data_not_found',
          message: 'Room or subject not found',
          canOverride: false
        };
      }
      
      const requiredType = subject.type === 'Lab' || subject.requiresLab ? 'Lab' : 'Classroom';
      
      if (room.type !== requiredType) {
        return {
          passed: false,
          severity: 'warning',
          type: 'type_mismatch',
          message: `Selected room is a ${room.type}, but the subject requires a ${requiredType}. Proceed anyway?`,
          canOverride: true,
          data: {
            roomType: room.type,
            requiredType: requiredType
          }
        };
      }
      
      return {
        passed: true,
        message: 'Room type matches requirements'
      };
    } catch (error) {
      return {
        passed: false,
        severity: 'error',
        type: 'validation_error',
        message: error.message,
        canOverride: false
      };
    }
  }
  
  /**
   * Generate comprehensive validation result
   */
  generateValidationResult(checks) {
    const errors = [];
    const warnings = [];
    let canForceUpdate = true;
    
    // Process each validation check
    for (const [checkName, result] of Object.entries(checks)) {
      if (!result.passed) {
        if (result.severity === 'error') {
          errors.push({
            type: result.type,
            message: result.message,
            severity: result.severity,
            data: result.data,
            checkName: checkName
          });
          
          // If error cannot be overridden, force update is not allowed
          if (!result.canOverride) {
            canForceUpdate = false;
          }
        } else if (result.severity === 'warning') {
          warnings.push({
            type: result.type,
            message: result.message,
            severity: result.severity,
            data: result.data,
            checkName: checkName
          });
        }
      }
    }
    
    const isValid = errors.length === 0 && warnings.length === 0;
    
    return {
      isValid,
      canForceUpdate: canForceUpdate && (errors.length > 0 || warnings.length > 0),
      errors,
      warnings,
      checks: Object.keys(checks).map(key => ({
        name: key,
        passed: checks[key].passed,
        message: checks[key].message
      }))
    };
  }
  
  /**
   * Quick validation for API endpoints
   * Returns simple boolean result
   */
  async quickValidate(roomId, day, period, subjectId, sectionId) {
    try {
      const result = await this.validateRoomAssignment(
        { day, period, subjectId, sectionId },
        roomId
      );
      
      return {
        isValid: result.isValid,
        hasWarnings: result.warnings.length > 0,
        hasErrors: result.errors.length > 0,
        canForceUpdate: result.canForceUpdate
      };
    } catch (error) {
      return {
        isValid: false,
        hasWarnings: false,
        hasErrors: true,
        canForceUpdate: false,
        error: error.message
      };
    }
  }
}

module.exports = new ValidationService();