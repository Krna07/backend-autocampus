const Room = require('../models/Room');
const Timetable = require('../models/Timetable');
const Subject = require('../models/Subject');
const Section = require('../models/Section');

class SmartSuggestionService {
  /**
   * Generate ranked list of room suggestions for manual adjustment
   * Returns top 5 most suitable rooms with detailed information
   */
  async generateSuggestions(entryDetails, maxSuggestions = 5) {
    try {
      const { subjectId, sectionId, day, period, excludedRoomIds = [] } = entryDetails;
      
      // Get subject and section details
      const [subject, section] = await Promise.all([
        Subject.findById(subjectId),
        Section.findById(sectionId)
      ]);
      
      if (!subject || !section) {
        return [];
      }
      
      // Query all active rooms
      const allRooms = await Room.find({
        _id: { $nin: excludedRoomIds },
        status: 'active'
      });
      
      // Score and filter rooms
      const scoredRooms = [];
      
      for (const room of allRooms) {
        // Check availability
        const isAvailable = await this.isRoomAvailable(room._id, day, period);
        
        // Calculate suitability score
        const score = await this.calculateSuitabilityScore(room, subject, section);
        
        // Get room utilization
        const utilization = await this.getRoomUtilization(room._id);
        
        scoredRooms.push({
          room: {
            _id: room._id,
            code: room.code,
            name: room.name,
            type: room.type,
            capacity: room.capacity,
            equipment: room.equipment || [],
            building: room.building,
            floor: room.floor,
            status: room.status
          },
          score: score.total,
          scoreBreakdown: score.breakdown,
          isAvailable,
          utilization,
          warnings: score.warnings,
          matchQuality: this.getMatchQuality(score.total)
        });
      }
      
      // Sort by score (descending) and availability
      scoredRooms.sort((a, b) => {
        // Prioritize available rooms
        if (a.isAvailable && !b.isAvailable) return -1;
        if (!a.isAvailable && b.isAvailable) return 1;
        
        // Then sort by score
        return b.score - a.score;
      });
      
      // Return top suggestions
      return scoredRooms.slice(0, maxSuggestions);
    } catch (error) {
      console.error('[SmartSuggestion] Error generating suggestions:', error);
      return [];
    }
  }
  
  /**
   * Calculate comprehensive suitability score for a room
   * Returns score breakdown and warnings
   */
  async calculateSuitabilityScore(room, subject, section) {
    const breakdown = {
      typeMatch: 0,
      capacityMatch: 0,
      equipmentMatch: 0,
      utilization: 0,
      buildingProximity: 0
    };
    
    const warnings = [];
    
    // 1. Type Match (50 points max)
    const requiredType = subject.type === 'Lab' || subject.requiresLab ? 'Lab' : 'Classroom';
    
    if (room.type === requiredType) {
      breakdown.typeMatch = 50;
    } else if (requiredType === 'Lab' && room.type !== 'Lab') {
      breakdown.typeMatch = 10;
      warnings.push({
        type: 'type_mismatch',
        severity: 'warning',
        message: `Subject requires a ${requiredType}, but this is a ${room.type}`
      });
    } else {
      breakdown.typeMatch = 25;
    }
    
    // 2. Capacity Match (30 points max)
    const sectionStrength = section.strength || 30;
    const capacityRatio = room.capacity / sectionStrength;
    
    if (capacityRatio >= 1.0 && capacityRatio <= 1.2) {
      breakdown.capacityMatch = 30; // Perfect fit
    } else if (capacityRatio > 1.2 && capacityRatio <= 1.5) {
      breakdown.capacityMatch = 20; // Acceptable
    } else if (capacityRatio > 1.5 && capacityRatio <= 2.0) {
      breakdown.capacityMatch = 10; // Too large
      warnings.push({
        type: 'capacity_oversized',
        severity: 'info',
        message: `Room capacity (${room.capacity}) is much larger than section size (${sectionStrength})`
      });
    } else if (capacityRatio > 2.0) {
      breakdown.capacityMatch = 5; // Way too large
      warnings.push({
        type: 'capacity_oversized',
        severity: 'info',
        message: `Room capacity (${room.capacity}) is significantly larger than needed`
      });
    } else {
      breakdown.capacityMatch = 0; // Too small
      warnings.push({
        type: 'capacity_insufficient',
        severity: 'error',
        message: `Room capacity (${room.capacity}) is less than section size (${sectionStrength})`
      });
    }
    
    // 3. Equipment Match (20 points max)
    if (subject.requiredEquipment && subject.requiredEquipment.length > 0) {
      const roomEquipment = room.equipment || [];
      const matchedEquipment = subject.requiredEquipment.filter(eq => 
        roomEquipment.includes(eq)
      );
      
      const equipmentMatchRatio = matchedEquipment.length / subject.requiredEquipment.length;
      breakdown.equipmentMatch = Math.round(20 * equipmentMatchRatio);
      
      if (equipmentMatchRatio < 1.0) {
        const missingEquipment = subject.requiredEquipment.filter(eq => 
          !roomEquipment.includes(eq)
        );
        warnings.push({
          type: 'equipment_missing',
          severity: 'warning',
          message: `Missing equipment: ${missingEquipment.join(', ')}`
        });
      }
    } else {
      breakdown.equipmentMatch = 10; // No special equipment required
    }
    
    // 4. Utilization Score (10 points max)
    const utilization = await this.getRoomUtilization(room._id);
    breakdown.utilization = Math.max(0, Math.round(10 - (utilization / 10)));
    
    // 5. Building Proximity (15 points max)
    if (section.preferredBuildings && section.preferredBuildings.length > 0) {
      if (section.preferredBuildings.includes(room.building)) {
        breakdown.buildingProximity = 15;
      } else {
        breakdown.buildingProximity = 5;
        warnings.push({
          type: 'building_not_preferred',
          severity: 'info',
          message: `Room is in ${room.building}, preferred buildings are: ${section.preferredBuildings.join(', ')}`
        });
      }
    } else {
      breakdown.buildingProximity = 7; // Neutral
    }
    
    const total = Object.values(breakdown).reduce((sum, val) => sum + val, 0);
    
    return {
      total: Math.round(total),
      breakdown,
      warnings
    };
  }
  
  /**
   * Get room utilization percentage
   */
  async getRoomUtilization(roomId) {
    try {
      const timetables = await Timetable.find({
        'schedule.roomRef': roomId,
        isPublished: true
      });
      
      let usedPeriods = 0;
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const periodsPerDay = 6;
      
      for (const timetable of timetables) {
        usedPeriods += timetable.schedule.filter(
          item => item.roomRef && item.roomRef.toString() === roomId.toString()
        ).length;
      }
      
      const totalPossiblePeriods = days.length * periodsPerDay;
      const utilization = (usedPeriods / totalPossiblePeriods) * 100;
      
      return Math.round(utilization);
    } catch (error) {
      console.error('[SmartSuggestion] Error calculating utilization:', error);
      return 50;
    }
  }
  
  /**
   * Check if room is available during specific time slot
   */
  async isRoomAvailable(roomId, day, period) {
    try {
      const conflictingTimetable = await Timetable.findOne({
        'schedule.roomRef': roomId,
        'schedule.day': day,
        'schedule.period': period,
        isPublished: true
      });
      
      return !conflictingTimetable;
    } catch (error) {
      console.error('[SmartSuggestion] Error checking availability:', error);
      return false;
    }
  }
  
  /**
   * Calculate distance between rooms (if location data available)
   * Returns distance in arbitrary units or null if not calculable
   */
  calculateRoomDistance(room1, room2) {
    try {
      // Simple distance calculation based on building and floor
      if (room1.building === room2.building) {
        // Same building - distance is floor difference
        return Math.abs(room1.floor - room2.floor);
      } else {
        // Different buildings - arbitrary distance
        return 10 + Math.abs(room1.floor - room2.floor);
      }
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Find alternative time slots if no rooms available
   */
  async findAlternativeTimeSlots(entryDetails) {
    try {
      const { subjectId, sectionId, day, excludedRoomIds = [] } = entryDetails;
      
      const [subject, section] = await Promise.all([
        Subject.findById(subjectId),
        Section.findById(sectionId)
      ]);
      
      if (!subject || !section) {
        return [];
      }
      
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const periods = [1, 2, 4, 6, 7, 8]; // Skip break periods
      
      const alternatives = [];
      
      // Check other time slots on the same day first
      for (const period of periods) {
        if (period === entryDetails.period) continue;
        
        const suggestions = await this.generateSuggestions({
          ...entryDetails,
          period
        }, 3);
        
        if (suggestions.length > 0 && suggestions[0].isAvailable) {
          alternatives.push({
            day,
            period,
            availableRooms: suggestions.length,
            bestRoom: suggestions[0].room
          });
        }
      }
      
      // If no alternatives on same day, check other days
      if (alternatives.length === 0) {
        for (const altDay of days) {
          if (altDay === day) continue;
          
          for (const period of periods) {
            const suggestions = await this.generateSuggestions({
              ...entryDetails,
              day: altDay,
              period
            }, 3);
            
            if (suggestions.length > 0 && suggestions[0].isAvailable) {
              alternatives.push({
                day: altDay,
                period,
                availableRooms: suggestions.length,
                bestRoom: suggestions[0].room
              });
              
              if (alternatives.length >= 5) break;
            }
          }
          
          if (alternatives.length >= 5) break;
        }
      }
      
      return alternatives.slice(0, 5);
    } catch (error) {
      console.error('[SmartSuggestion] Error finding alternative time slots:', error);
      return [];
    }
  }
  
  /**
   * Get match quality label based on score
   */
  getMatchQuality(score) {
    if (score >= 100) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 60) return 'Fair';
    if (score >= 40) return 'Poor';
    return 'Not Recommended';
  }
  
  /**
   * Get detailed room information for display
   */
  async getRoomDetails(roomId) {
    try {
      const room = await Room.findById(roomId);
      
      if (!room) {
        return null;
      }
      
      const utilization = await this.getRoomUtilization(roomId);
      
      // Get current week schedule
      const timetables = await Timetable.find({
        'schedule.roomRef': roomId,
        isPublished: true
      })
        .populate('sectionRef', 'name')
        .populate('schedule.subjectRef', 'name');
      
      const schedule = [];
      for (const timetable of timetables) {
        for (const item of timetable.schedule) {
          if (item.roomRef && item.roomRef.toString() === roomId.toString()) {
            schedule.push({
              day: item.day,
              period: item.period,
              startTime: item.startTime,
              endTime: item.endTime,
              subject: item.subjectRef?.name || 'Unknown',
              section: timetable.sectionRef?.name || 'Unknown'
            });
          }
        }
      }
      
      return {
        room: {
          _id: room._id,
          code: room.code,
          name: room.name,
          type: room.type,
          capacity: room.capacity,
          equipment: room.equipment || [],
          building: room.building,
          floor: room.floor,
          status: room.status
        },
        utilization,
        schedule: schedule.sort((a, b) => {
          const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const dayDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
          return dayDiff !== 0 ? dayDiff : a.period - b.period;
        })
      };
    } catch (error) {
      console.error('[SmartSuggestion] Error getting room details:', error);
      return null;
    }
  }
}

module.exports = new SmartSuggestionService();