const Room = require('../models/Room');
const Subject = require('../models/Subject');
const Faculty = require('../models/Faculty');
const Mapping = require('../models/Mapping');
const Timetable = require('../models/Timetable');
const Section = require('../models/Section');
const PeriodConfig = require('../models/PeriodConfig');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIODS_PER_DAY = 8;
const BREAK_PERIOD = 3;
const LUNCH_PERIOD = 5;
const MAX_CONSECUTIVE_PERIODS = 3; // Max consecutive periods for same faculty

let TIME_SLOTS = {
  1: { start: '08:00', end: '08:50' },
  2: { start: '09:00', end: '09:50' },
  3: { start: '10:10', end: '10:30' },
  4: { start: '10:30', end: '11:20' },
  5: { start: '12:40', end: '13:40' },
  6: { start: '13:40', end: '14:30' },
  7: { start: '14:30', end: '15:20' },
  8: { start: '15:30', end: '16:20' }
};

class EnhancedSchedulerService {
  constructor() {
    this.globalConstraints = {
      facultySchedule: {}, // facultyId -> { day -> [periods] }
      roomSchedule: {},    // roomId -> { day -> [periods] }
      sectionSchedule: {}  // sectionId -> { day -> [periods] }
    };
  }

  async generateAllTimetables(adminId = null) {
    try {
      // Load period times
      await this.loadPeriodTimes();

      // Fetch all sections
      const sections = await Section.find();
      const results = {
        success: [],
        failed: [],
        summary: {
          totalSections: sections.length,
          generated: 0,
          conflicts: 0
        }
      };

      // Reset global constraints
      this.globalConstraints = {
        facultySchedule: {},
        roomSchedule: {},
        sectionSchedule: {}
      };

      // Load existing published timetables to avoid conflicts
      const existingTimetables = await Timetable.find({ isPublished: true })
        .populate('schedule.facultyRef')
        .populate('schedule.roomRef')
        .populate('schedule.subjectRef');

      this.buildGlobalConstraints(existingTimetables);

      // Generate for each section
      for (const section of sections) {
        try {
          const result = await this.generateTimetableForSection(section._id, adminId);
          results.success.push({
            sectionId: section._id,
            sectionName: section.name,
            ...result
          });
          results.summary.generated++;
        } catch (error) {
          results.failed.push({
            sectionId: section._id,
            sectionName: section.name,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Bulk generation failed: ${error.message}`);
    }
  }

  async loadPeriodTimes() {
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
  }

  buildGlobalConstraints(existingTimetables) {
    existingTimetables.forEach(timetable => {
      timetable.schedule.forEach(session => {
        const facultyId = session.facultyRef?._id?.toString();
        const roomId = session.roomRef?._id?.toString();
        const sectionId = timetable.sectionRef?.toString();

        if (facultyId) {
          if (!this.globalConstraints.facultySchedule[facultyId]) {
            this.globalConstraints.facultySchedule[facultyId] = {};
          }
          if (!this.globalConstraints.facultySchedule[facultyId][session.day]) {
            this.globalConstraints.facultySchedule[facultyId][session.day] = [];
          }
          this.globalConstraints.facultySchedule[facultyId][session.day].push(session.period);
        }

        if (roomId) {
          if (!this.globalConstraints.roomSchedule[roomId]) {
            this.globalConstraints.roomSchedule[roomId] = {};
          }
          if (!this.globalConstraints.roomSchedule[roomId][session.day]) {
            this.globalConstraints.roomSchedule[roomId][session.day] = [];
          }
          this.globalConstraints.roomSchedule[roomId][session.day].push(session.period);
        }

        if (sectionId) {
          if (!this.globalConstraints.sectionSchedule[sectionId]) {
            this.globalConstraints.sectionSchedule[sectionId] = {};
          }
          if (!this.globalConstraints.sectionSchedule[sectionId][session.day]) {
            this.globalConstraints.sectionSchedule[sectionId][session.day] = [];
          }
          this.globalConstraints.sectionSchedule[sectionId][session.day].push(session.period);
        }
      });
    });
  }

  async generateTimetableForSection(sectionId, adminId = null) {
    const mappings = await Mapping.find({ sectionRef: sectionId })
      .populate('subjectRef')
      .populate('facultyRef')
      .populate('sectionRef');

    // If no mappings found, generate demo timetable
    if (mappings.length === 0) {
      return await this.generateDemoTimetable(sectionId, adminId);
    }

    const section = mappings[0].sectionRef;
    const rooms = await Room.find({ status: 'active' });
    const grid = this.initializeGrid();
    const conflicts = [];
    const placedSessions = [];
    const facultyLoad = {}; // Track faculty daily load

    // Sort mappings by priority: Labs first, then by weekly periods (descending)
    const sortedMappings = [...mappings].sort((a, b) => {
      if (a.subjectRef.type === 'Lab' && b.subjectRef.type !== 'Lab') return -1;
      if (a.subjectRef.type !== 'Lab' && b.subjectRef.type === 'Lab') return 1;
      return b.subjectRef.weeklyPeriods - a.subjectRef.weeklyPeriods;
    });

    // Process each mapping
    for (const mapping of sortedMappings) {
      const { subjectRef, facultyRef } = mapping;
      const periodsNeeded = subjectRef.type === 'Lab' ? 2 : 1;
      const totalPeriods = subjectRef.weeklyPeriods;

      let placedCount = 0;
      const attempts = [];

      // Initialize faculty load tracking
      if (!facultyLoad[facultyRef._id.toString()]) {
        facultyLoad[facultyRef._id.toString()] = {};
        DAYS.forEach(day => {
          facultyLoad[facultyRef._id.toString()][day] = [];
        });
      }

      // Try to place all required periods with balanced distribution
      const periodsPerDay = Math.ceil(totalPeriods / DAYS.length);
      let daysUsed = new Set();

      for (let p = 0; p < totalPeriods && placedCount < totalPeriods; p += periodsNeeded) {
        let placed = false;
        
        // Try days in round-robin fashion for balanced distribution
        const dayOrder = this.getBalancedDayOrder(daysUsed, facultyLoad[facultyRef._id.toString()]);
        
        for (const day of dayOrder) {
          if (placed) break;
          
          // Check faculty availability
          if (!this.isFacultyAvailable(facultyRef, day)) {
            continue;
          }

          // Check consecutive periods constraint
          if (this.hasTooManyConsecutivePeriods(facultyLoad[facultyRef._id.toString()][day], periodsNeeded)) {
            continue;
          }

          // Try each period
          for (let period = 1; period <= PERIODS_PER_DAY; period++) {
            if (placed) break;
            
            if (period === BREAK_PERIOD || period === LUNCH_PERIOD) {
              continue;
            }

            if (periodsNeeded === 2 && period === PERIODS_PER_DAY) {
              continue;
            }

            // Check if slot is free in grid
            if (!this.isSlotFree(grid, day, period, periodsNeeded)) {
              continue;
            }

            // Check global constraints
            if (!this.checkGlobalConstraints(facultyRef._id.toString(), sectionId, day, period, periodsNeeded)) {
              continue;
            }

            // Find suitable room with capacity check
            const room = this.findOptimalRoom(
              rooms,
              subjectRef,
              section,
              day,
              period,
              periodsNeeded
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

              // Update global constraints
              this.updateGlobalConstraints(facultyRef._id.toString(), room._id.toString(), sectionId, day, period, periodsNeeded);

              // Update faculty load
              for (let i = 0; i < periodsNeeded; i++) {
                facultyLoad[facultyRef._id.toString()][day].push(period + i);
              }

              placed = true;
              placedCount += periodsNeeded;
              daysUsed.add(day);
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

      if (placedCount < totalPeriods) {
        conflicts.push({
          subject: subjectRef.name,
          faculty: facultyRef.name,
          required: totalPeriods,
          placed: placedCount,
          suggestions: this.generateSmartSuggestions(subjectRef, facultyRef, rooms, section, grid)
        });
      }
    }

    // Convert grid to timetable format
    const schedule = this.gridToSchedule(grid);

    // Create or update timetable
    let timetable = await Timetable.findOne({ sectionRef: sectionId }).sort({ generatedAt: -1 });
    
    if (!timetable) {
      timetable = new Timetable({
        sectionRef: sectionId,
        generatedBy: adminId || null,
        version: '1.0',
        schedule,
        isPublished: false
      });
    } else {
      const oldVersion = timetable.version || '1.0';
      const newVersion = (parseFloat(oldVersion) + 0.1).toFixed(1);
      
      if (!timetable.revisionHistory) {
        timetable.revisionHistory = [];
      }
      timetable.revisionHistory.push({
        version: oldVersion,
        generatedAt: timetable.generatedAt,
        generatedBy: timetable.generatedBy,
        changes: `Auto-generated with ${schedule.length} sessions`
      });

      timetable.schedule = schedule;
      timetable.generatedBy = adminId || null;
      timetable.version = newVersion;
      timetable.generatedAt = new Date();
      timetable.isPublished = false;
    }

    await timetable.save();

    return {
      timetable,
      conflicts,
      placedSessions,
      summary: {
        totalSubjects: mappings.length,
        totalPeriodsPlaced: placedSessions.reduce((sum, s) => sum + s.periods, 0),
        conflictsCount: conflicts.length,
        utilizationRate: this.calculateUtilizationRate(schedule, DAYS.length * PERIODS_PER_DAY)
      }
    };
  }

  getBalancedDayOrder(daysUsed, facultyDayLoad) {
    // Sort days by current load (ascending) to balance distribution
    const dayLoads = DAYS.map(day => ({
      day,
      load: facultyDayLoad[day]?.length || 0,
      used: daysUsed.has(day)
    }));

    return dayLoads
      .sort((a, b) => {
        if (a.used && !b.used) return 1;
        if (!a.used && b.used) return -1;
        return a.load - b.load;
      })
      .map(d => d.day);
  }

  hasTooManyConsecutivePeriods(periods, periodsNeeded) {
    if (periods.length === 0) return false;
    
    const sorted = [...periods].sort((a, b) => a - b);
    let consecutive = 1;
    
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) {
        consecutive++;
        if (consecutive + periodsNeeded > MAX_CONSECUTIVE_PERIODS) {
          return true;
        }
      } else {
        consecutive = 1;
      }
    }
    
    return false;
  }

  checkGlobalConstraints(facultyId, sectionId, day, period, periodsNeeded) {
    // Check faculty constraint
    if (this.globalConstraints.facultySchedule[facultyId]?.[day]) {
      for (let p = 0; p < periodsNeeded; p++) {
        if (this.globalConstraints.facultySchedule[facultyId][day].includes(period + p)) {
          return false;
        }
      }
    }

    // Check section constraint
    if (this.globalConstraints.sectionSchedule[sectionId]?.[day]) {
      for (let p = 0; p < periodsNeeded; p++) {
        if (this.globalConstraints.sectionSchedule[sectionId][day].includes(period + p)) {
          return false;
        }
      }
    }

    return true;
  }

  updateGlobalConstraints(facultyId, roomId, sectionId, day, period, periodsNeeded) {
    // Update faculty schedule
    if (!this.globalConstraints.facultySchedule[facultyId]) {
      this.globalConstraints.facultySchedule[facultyId] = {};
    }
    if (!this.globalConstraints.facultySchedule[facultyId][day]) {
      this.globalConstraints.facultySchedule[facultyId][day] = [];
    }
    for (let p = 0; p < periodsNeeded; p++) {
      this.globalConstraints.facultySchedule[facultyId][day].push(period + p);
    }

    // Update room schedule
    if (!this.globalConstraints.roomSchedule[roomId]) {
      this.globalConstraints.roomSchedule[roomId] = {};
    }
    if (!this.globalConstraints.roomSchedule[roomId][day]) {
      this.globalConstraints.roomSchedule[roomId][day] = [];
    }
    for (let p = 0; p < periodsNeeded; p++) {
      this.globalConstraints.roomSchedule[roomId][day].push(period + p);
    }

    // Update section schedule
    if (!this.globalConstraints.sectionSchedule[sectionId]) {
      this.globalConstraints.sectionSchedule[sectionId] = {};
    }
    if (!this.globalConstraints.sectionSchedule[sectionId][day]) {
      this.globalConstraints.sectionSchedule[sectionId][day] = [];
    }
    for (let p = 0; p < periodsNeeded; p++) {
      this.globalConstraints.sectionSchedule[sectionId][day].push(period + p);
    }
  }

  findOptimalRoom(rooms, subject, section, day, period, periodsNeeded) {
    // Filter by type compatibility
    let candidateRooms = rooms.filter(room => {
      if (subject.type === 'Lab') {
        return room.type === 'Lab' || room.allowLabClass;
      } else {
        return room.type === 'Classroom' || (room.type === 'Lab' && room.allowTheoryClass);
      }
    });

    // Filter by capacity
    const minCapacity = section.strength || 0;
    candidateRooms = candidateRooms.filter(room => room.capacity >= minCapacity);

    // Filter by availability
    candidateRooms = candidateRooms.filter(room => {
      if (this.globalConstraints.roomSchedule[room._id.toString()]?.[day]) {
        for (let p = 0; p < periodsNeeded; p++) {
          if (this.globalConstraints.roomSchedule[room._id.toString()][day].includes(period + p)) {
            return false;
          }
        }
      }
      return true;
    });

    if (candidateRooms.length === 0) return null;

    // Sort by optimization criteria:
    // 1. Prefer rooms in preferred buildings
    // 2. Prefer rooms with capacity closest to section strength (minimize waste)
    // 3. Prefer same building for better proximity
    candidateRooms.sort((a, b) => {
      // Preferred building priority
      const aInPreferred = section.preferredBuildings?.includes(a.building) ? 0 : 1;
      const bInPreferred = section.preferredBuildings?.includes(b.building) ? 0 : 1;
      if (aInPreferred !== bInPreferred) return aInPreferred - bInPreferred;

      // Capacity optimization (prefer room with capacity closest to section strength)
      const aCapacityDiff = Math.abs(a.capacity - minCapacity);
      const bCapacityDiff = Math.abs(b.capacity - minCapacity);
      if (aCapacityDiff !== bCapacityDiff) return aCapacityDiff - bCapacityDiff;

      // Prefer smaller room if same difference
      return a.capacity - b.capacity;
    });

    return candidateRooms[0];
  }

  generateSmartSuggestions(subject, faculty, rooms, section, grid) {
    const suggestions = {
      alternativeRooms: [],
      alternativeTeachers: [],
      alternativeTimeSlots: []
    };

    // Find alternative rooms
    const suitableRooms = rooms.filter(room => {
      if (subject.type === 'Lab') {
        return (room.type === 'Lab' || room.allowLabClass) && room.capacity >= (section.strength || 0);
      } else {
        return (room.type === 'Classroom' || (room.type === 'Lab' && room.allowTheoryClass)) && room.capacity >= (section.strength || 0);
      }
    });

    suggestions.alternativeRooms = suitableRooms
      .sort((a, b) => Math.abs(a.capacity - (section.strength || 0)) - Math.abs(b.capacity - (section.strength || 0)))
      .slice(0, 5)
      .map(r => ({
        id: r._id,
        code: r.code,
        name: r.name,
        capacity: r.capacity,
        building: r.building
      }));

    // Find alternative teachers (who teach same subject)
    // This would require additional query - simplified for now
    suggestions.alternativeTeachers = [];

    // Find free time slots
    const freeSlots = [];
    DAYS.forEach(day => {
      for (let period = 1; period <= PERIODS_PER_DAY; period++) {
        if (period !== BREAK_PERIOD && period !== LUNCH_PERIOD && grid[day][period] === null) {
          freeSlots.push({ day, period });
        }
      }
    });
    suggestions.alternativeTimeSlots = freeSlots.slice(0, 10);

    return suggestions;
  }

  calculateUtilizationRate(schedule, totalSlots) {
    return ((schedule.length / totalSlots) * 100).toFixed(2);
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
      return true;
    }
    const dayIndex = DAYS.indexOf(day);
    return faculty.availability.dayOfWeek.includes(dayIndex);
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

  async generateDemoTimetable(sectionId, adminId = null) {
    try {
      // Fetch section
      const section = await Section.findById(sectionId);
      if (!section) {
        throw new Error('Section not found');
      }

      // Get available subjects, faculty, and rooms
      const subjects = await Subject.find().limit(5);
      const faculty = await Faculty.find().limit(5);
      const rooms = await Room.find({ status: 'active' }).limit(5);

      // If ALL data is missing, create minimal demo data
      if (subjects.length === 0 && faculty.length === 0 && rooms.length === 0) {
        // Create demo schedule with placeholder data
        const schedule = [];
        const demoSubjects = ['Mathematics', 'Physics', 'Chemistry', 'English', 'Computer Science'];
        const demoFaculty = ['Dr. Smith', 'Dr. Johnson', 'Dr. Williams', 'Dr. Brown', 'Dr. Davis'];
        const demoRooms = ['101', '102', '103', 'Lab-1', 'Lab-2'];

        // Create a simple demo timetable (3 subjects, 3 days, 3 periods per day)
        const demoDays = ['Monday', 'Tuesday', 'Wednesday'];
        const demoPeriods = [1, 2, 4]; // Skip break and lunch

        for (let i = 0; i < Math.min(9, demoDays.length * demoPeriods.length); i++) {
          const day = demoDays[i % demoDays.length];
          const period = demoPeriods[Math.floor(i / demoDays.length) % demoPeriods.length];
          const subjectIdx = i % demoSubjects.length;
          const facultyIdx = i % demoFaculty.length;
          const roomIdx = i % demoRooms.length;

          schedule.push({
            day,
            period,
            startTime: TIME_SLOTS[period]?.start || '08:00',
            endTime: TIME_SLOTS[period]?.end || '08:50',
            subjectRef: null, // Will be handled as demo
            facultyRef: null,
            roomRef: null,
            note: `Demo: ${demoSubjects[subjectIdx]} by ${demoFaculty[facultyIdx]} in Room ${demoRooms[roomIdx]}`
          });
        }

        const timetable = new Timetable({
          sectionRef: sectionId,
          generatedBy: adminId || null,
          version: '1.0',
          schedule,
          isPublished: false,
          isDemo: true
        });

        await timetable.save();

        return {
          timetable,
          conflicts: [],
          placedSessions: schedule.map((s, idx) => ({
            day: s.day,
            period: s.period,
            periods: 1,
            subject: `Demo Subject ${idx + 1}`,
            faculty: `Demo Faculty ${idx + 1}`,
            room: `Demo Room ${idx + 1}`
          })),
          summary: {
            totalSubjects: schedule.length,
            totalPeriodsPlaced: schedule.length,
            conflictsCount: 0,
            utilizationRate: '0.00',
            isDemo: true
          }
        };
      }

      // Generate timetable with available data (at least one type has data)
      const schedule = [];
      let subjectIdx = 0;
      let facultyIdx = 0;
      let roomIdx = 0;
      let sessionCount = 0;
      const maxSessions = Math.min(18, DAYS.length * 6); // Max 18 sessions (6 days * 3 periods)

      // Place subjects across the week
      for (const day of DAYS) {
        for (let period = 1; period <= PERIODS_PER_DAY; period++) {
          if (period === BREAK_PERIOD || period === LUNCH_PERIOD) {
            continue;
          }

          if (sessionCount >= maxSessions) {
            break;
          }

          // Use available data, or null if not available
          const subject = subjects.length > 0 ? subjects[subjectIdx % subjects.length] : null;
          const teacher = faculty.length > 0 ? faculty[facultyIdx % faculty.length] : null;
          const room = rooms.length > 0 ? rooms[roomIdx % rooms.length] : null;

          // Only create session if we have at least subject or teacher
          if (subject || teacher) {
            schedule.push({
              day,
              period,
              startTime: TIME_SLOTS[period]?.start || '08:00',
              endTime: TIME_SLOTS[period]?.end || '08:50',
              subjectRef: subject?._id || null,
              facultyRef: teacher?._id || null,
              roomRef: room?._id || null,
              note: subject || teacher || room ? '' : 'Demo session'
            });

            sessionCount++;
            if (subjects.length > 0) subjectIdx++;
            if (faculty.length > 0) facultyIdx++;
            if (rooms.length > 0) roomIdx++;
          }
        }
        if (sessionCount >= maxSessions) break;
      }

      const timetable = new Timetable({
        sectionRef: sectionId,
        generatedBy: adminId || null,
        version: '1.0',
        schedule,
        isPublished: false,
        isDemo: true
      });

      await timetable.save();

      return {
        timetable,
        conflicts: [],
        placedSessions: schedule.map(s => ({
          day: s.day,
          period: s.period,
          periods: 1,
          subject: s.subjectRef ? (subjects.find(sub => sub._id.toString() === s.subjectRef?.toString())?.name || 'Unknown') : 'Demo Subject',
          faculty: s.facultyRef ? (faculty.find(f => f._id.toString() === s.facultyRef?.toString())?.name || 'Unknown') : 'Demo Faculty',
          room: s.roomRef ? (rooms.find(r => r._id.toString() === s.roomRef?.toString())?.code || 'Unknown') : 'Demo Room'
        })),
        summary: {
          totalSubjects: subjects.length || schedule.length,
          totalPeriodsPlaced: schedule.length,
          conflictsCount: 0,
          utilizationRate: schedule.length > 0 ? ((schedule.length / (DAYS.length * PERIODS_PER_DAY)) * 100).toFixed(2) : '0.00',
          isDemo: true
        }
      };
    } catch (error) {
      throw new Error(`Demo timetable generation failed: ${error.message}`);
    }
  }
}

module.exports = new EnhancedSchedulerService();

