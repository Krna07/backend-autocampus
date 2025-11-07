const Room = require('../models/Room');
const Subject = require('../models/Subject');
const Faculty = require('../models/Faculty');
const Mapping = require('../models/Mapping');
const Timetable = require('../models/Timetable');
const Log = require('../models/Log');
const PeriodConfig = require('../models/PeriodConfig');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIODS_PER_DAY = 8;
const BREAK_PERIOD = 3; // Period 3 is break (10:10-10:30)
const LUNCH_PERIOD = 5; // Period 5 is lunch (12:40-1:40)

let TIME_SLOTS = {
  1: { start: '08:00', end: '08:50' },
  2: { start: '09:00', end: '09:50' },
  3: { start: '10:10', end: '10:30' }, // Break
  4: { start: '10:30', end: '11:20' },
  5: { start: '12:40', end: '13:40' }, // Lunch
  6: { start: '13:40', end: '14:30' },
  7: { start: '14:30', end: '15:20' },
  8: { start: '15:30', end: '16:20' }
};

class SchedulerService {
  constructor() {
    this.grids = {}; // sectionId -> grid
    this.conflicts = [];
    this.adminOverrides = [];
  }

  async generateTimetable(sectionId, adminId = null) {
    try {
      // Load period time configuration if present
      try {
        const cfg = await PeriodConfig.findOne({ isActive: true });
        if (cfg && cfg.periods && cfg.periods.size > 0) {
          const nextSlots = {};
          for (const [key, val] of cfg.periods) {
            nextSlots[Number(key)] = { start: val.start, end: val.end };
          }
          TIME_SLOTS = { ...TIME_SLOTS, ...nextSlots };
        }
      } catch (_) {}

      // Fetch all required data
      const mappings = await Mapping.find({ sectionRef: sectionId })
        .populate('subjectRef')
        .populate('facultyRef')
        .populate('sectionRef');

      // If no mappings found, use enhanced scheduler to generate demo
      if (mappings.length === 0) {
        const enhancedScheduler = require('./enhancedSchedulerService');
        return await enhancedScheduler.generateDemoTimetable(sectionId, adminId);
      }

      const section = mappings[0].sectionRef;
      const rooms = await Room.find({ status: 'active' });
      const allTimetables = await Timetable.find({ isPublished: true })
        .populate('schedule.roomRef')
        .populate('schedule.facultyRef')
        .populate('schedule.subjectRef');

      // Initialize grid: 6 days x 8 periods
      const grid = this.initializeGrid();
      const conflicts = [];
      const placedSessions = [];

      // Sort mappings by priority (Lab subjects need 2 periods, Theory needs 1)
      const sortedMappings = [...mappings].sort((a, b) => {
        if (a.subjectRef.type === 'Lab' && b.subjectRef.type !== 'Lab') return -1;
        if (a.subjectRef.type !== 'Lab' && b.subjectRef.type === 'Lab') return 1;
        return 0;
      });

      // Process each mapping
      for (const mapping of sortedMappings) {
        const { subjectRef, facultyRef } = mapping;
        const periodsNeeded = subjectRef.type === 'Lab' ? 2 : 1;
        const totalPeriods = subjectRef.weeklyPeriods;

        let placedCount = 0;
        const attempts = [];

        // Try to place all required periods
        for (let p = 0; p < totalPeriods && placedCount < totalPeriods; p += periodsNeeded) {
          let placed = false;
          
          // Try each day
          for (const day of DAYS) {
            if (placed) break;
            
            // Check faculty availability
            if (!this.isFacultyAvailable(facultyRef, day)) {
              continue;
            }

            // Try each period
            for (let period = 1; period <= PERIODS_PER_DAY; period++) {
              if (placed) break;
              
              // Skip break and lunch periods
              if (period === BREAK_PERIOD || period === LUNCH_PERIOD) {
                continue;
              }

              // For lab, check if we can place 2 contiguous periods
              if (periodsNeeded === 2 && period === PERIODS_PER_DAY) {
                continue; // Can't place 2 periods if last period
              }

              // Check if slot is free in grid
              if (!this.isSlotFree(grid, day, period, periodsNeeded)) {
                continue;
              }

              // Find suitable room
              const room = this.findSuitableRoom(
                rooms,
                subjectRef,
                section,
                grid,
                day,
                period,
                periodsNeeded,
                allTimetables
              );

              if (room) {
                // Place the session
                this.placeSession(
                  grid,
                  day,
                  period,
                  periodsNeeded,
                  subjectRef,
                  facultyRef,
                  room,
                  mapping
                );
                placed = true;
                placedCount += periodsNeeded;
                placedSessions.push({
                  day,
                  period,
                  periods: periodsNeeded,
                  subject: subjectRef.name,
                  faculty: facultyRef.name,
                  room: room.code
                });
              }
            }
          }

          if (!placed) {
            attempts.push({
              subject: subjectRef.name,
              faculty: facultyRef.name,
              requiredPeriods: periodsNeeded
            });
          }
        }

        // If not all periods placed, add to conflicts
        if (placedCount < totalPeriods) {
          conflicts.push({
            subject: subjectRef.name,
            faculty: facultyRef.name,
            required: totalPeriods,
            placed: placedCount,
            suggestions: this.generateSuggestions(subjectRef, facultyRef, rooms, grid)
          });
        }
      }

      // Convert grid to timetable format
      const schedule = this.gridToSchedule(grid);

      // Create timetable document
      const timetable = new Timetable({
        sectionRef: sectionId,
        generatedBy: adminId || null,
        version: '1.0',
        generatedAt: new Date(),
        schedule,
        isPublished: false
      });

      await timetable.save();

      // Log admin override if any
      if (adminId && this.adminOverrides.length > 0) {
        for (const override of this.adminOverrides) {
          await Log.create({
            actor: adminId,
            action: 'ADMIN_OVERRIDE',
            details: override,
            timestamp: new Date()
          });
        }
      }

      return {
        timetable,
        conflicts,
        placedSessions,
        summary: {
          totalSubjects: mappings.length,
          totalPeriodsPlaced: placedSessions.reduce((sum, s) => sum + s.periods, 0),
          conflictsCount: conflicts.length
        }
      };
    } catch (error) {
      throw new Error(`Timetable generation failed: ${error.message}`);
    }
  }

  initializeGrid() {
    const grid = {};
    DAYS.forEach(day => {
      grid[day] = {};
      for (let period = 1; period <= PERIODS_PER_DAY; period++) {
        grid[day][period] = null;
      }
    });
    return grid;
  }

  isSlotFree(grid, day, period, periodsNeeded) {
    for (let p = 0; p < periodsNeeded; p++) {
      if (grid[day][period + p] !== null) {
        return false;
      }
    }
    return true;
  }

  isFacultyAvailable(faculty, day) {
    if (!faculty.availability || !faculty.availability.dayOfWeek) {
      return true; // Available all days if not specified
    }
    const dayIndex = DAYS.indexOf(day);
    return faculty.availability.dayOfWeek.includes(dayIndex);
  }

  findSuitableRoom(rooms, subject, section, grid, day, period, periodsNeeded, allTimetables) {
    // Filter rooms by type
    let candidateRooms = rooms.filter(room => {
      if (subject.type === 'Theory') {
        return room.type === 'Classroom' || (room.type === 'Lab' && room.allowTheoryClass);
      } else if (subject.type === 'Lab') {
        return room.type === 'Lab' || (room.allowLabClass);
      }
      return true;
    });

    // Prefer rooms in preferred buildings
    if (section.preferredBuildings && section.preferredBuildings.length > 0) {
      candidateRooms.sort((a, b) => {
        const aInPreferred = section.preferredBuildings.includes(a.building);
        const bInPreferred = section.preferredBuildings.includes(b.building);
        if (aInPreferred && !bInPreferred) return -1;
        if (!aInPreferred && bInPreferred) return 1;
        return 0;
      });
    }

    // Check room availability (not occupied in other timetables)
    for (const room of candidateRooms) {
      if (this.isRoomAvailable(room._id, day, period, periodsNeeded, allTimetables)) {
        return room;
      }
    }

    return candidateRooms[0]; // Return first candidate if all busy
  }

  isRoomAvailable(roomId, day, period, periodsNeeded, allTimetables) {
    for (const timetable of allTimetables) {
      for (const session of timetable.schedule) {
        if (session.roomRef._id.toString() === roomId.toString() &&
            session.day === day) {
          for (let p = 0; p < periodsNeeded; p++) {
            if (session.period === period + p) {
              return false;
            }
          }
        }
      }
    }
    return true;
  }

  placeSession(grid, day, period, periodsNeeded, subject, faculty, room, mapping) {
    const timeSlot = TIME_SLOTS[period];
    
    for (let p = 0; p < periodsNeeded; p++) {
      const endPeriod = period + periodsNeeded - 1;
      const endTime = TIME_SLOTS[endPeriod]?.end || timeSlot.end;
      
      grid[day][period + p] = {
        day,
        period: period + p,
        startTime: timeSlot.start,
        endTime: endTime,
        subjectRef: subject._id,
        facultyRef: faculty._id,
        roomRef: room._id,
        note: ''
      };
    }
  }

  gridToSchedule(grid) {
    const schedule = [];
    DAYS.forEach(day => {
      for (let period = 1; period <= PERIODS_PER_DAY; period++) {
        if (grid[day][period]) {
          schedule.push(grid[day][period]);
        }
      }
    });
    return schedule;
  }

  generateSuggestions(subject, faculty, rooms, grid) {
    const suggestions = [];
    
    // Suggest alternative rooms
    const altRooms = rooms.filter(r => 
      (subject.type === 'Theory' && (r.type === 'Classroom' || r.allowTheoryClass)) ||
      (subject.type === 'Lab' && r.type === 'Lab')
    );
    
    suggestions.push({
      type: 'alternative_rooms',
      rooms: altRooms.slice(0, 3).map(r => r.code)
    });

    // Suggest alternative time slots
    const freeSlots = [];
    DAYS.forEach(day => {
      for (let period = 1; period <= PERIODS_PER_DAY; period++) {
        if (period !== BREAK_PERIOD && period !== LUNCH_PERIOD && grid[day][period] === null) {
          freeSlots.push(`${day} Period ${period}`);
        }
      }
    });
    
    suggestions.push({
      type: 'free_slots',
      slots: freeSlots.slice(0, 5)
    });

    return suggestions;
  }
}

module.exports = new SchedulerService();

