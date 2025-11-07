const AdminTimetable = require('../models/AdminTimetable');
const Subject = require('../models/Subject');
const Faculty = require('../models/Faculty');
const Room = require('../models/Room');
const mongoose = require('mongoose');
const PeriodConfig = require('../models/PeriodConfig');

// Get admin timetable data
exports.getAdminTimetable = async (req, res) => {
  try {
    let adminTimetable = await AdminTimetable.findOne({ isActive: true })
      .populate('timetableData.$.subject')
      .populate('timetableData.$.teacher')
      .populate('timetableData.$.classroom');

    if (!adminTimetable) {
      // Create empty timetable if none exists
      adminTimetable = new AdminTimetable({
        createdBy: req.user._id,
        timetableData: new Map()
      });
      await adminTimetable.save();
    }

    // Convert Map to plain object for JSON response
    const timetableData = {};
    for (const [key, value] of adminTimetable.timetableData) {
      timetableData[key] = {
        subject: value.subject || '',
        teacher: value.teacher || '',
        classroom: value.classroom || ''
      };
    }

    res.json(timetableData);
  } catch (error) {
    console.error('Error fetching admin timetable:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get period times configuration
exports.getPeriodTimes = async (req, res) => {
  try {
    let config = await PeriodConfig.findOne({ isActive: true });
    if (!config) {
      config = new PeriodConfig({ periods: new Map() });
      await config.save();
    }

    const periods = {};
    for (const [key, value] of config.periods) {
      periods[key] = value;
    }
    res.json(periods);
  } catch (error) {
    console.error('Error fetching period times:', error);
    res.status(500).json({ error: error.message });
  }
};

// Save/update period times configuration
exports.savePeriodTimes = async (req, res) => {
  try {
    const { periods } = req.body;
    if (!periods || typeof periods !== 'object') {
      return res.status(400).json({ error: 'Invalid periods payload' });
    }

    // Basic format validation HH:MM
    const isValidTime = (t) => /^\d{2}:\d{2}$/.test(t);
    for (const [period, time] of Object.entries(periods)) {
      if (!time || !isValidTime(time.start) || !isValidTime(time.end)) {
        return res.status(400).json({ error: `Invalid time format for period ${period}` });
      }
    }

    let config = await PeriodConfig.findOne({ isActive: true });
    if (!config) {
      config = new PeriodConfig({ periods: new Map() });
    }

    const map = new Map();
    for (const [key, value] of Object.entries(periods)) {
      map.set(String(key), { start: value.start, end: value.end });
    }

    config.periods = map;
    await config.save();

    // Emit update
    if (req.io) {
      req.io.emit('period-times:update', { timestamp: new Date() });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving period times:', error);
    res.status(500).json({ error: error.message });
  }
};

// Save section-specific timetable
exports.saveSectionTimetable = async (req, res) => {
  try {
    const { sectionId, force = false, ...timetableData } = req.body;
    const userId = req.user._id;

    if (!sectionId) {
      return res.status(400).json({ error: 'Section ID is required' });
    }

    // Convert timetable data to schedule format
    const schedule = [];
    for (const [key, value] of Object.entries(timetableData)) {
      if (key === 'force' || !value || (!value.subject && !value.teacher && !value.classroom)) {
        continue;
      }
      const [day, period] = key.split('-');
      if (day && period && value.subject && value.teacher && value.classroom) {
        schedule.push({
          day,
          period: parseInt(period),
          subjectRef: value.subject,
          facultyRef: value.teacher,
          roomRef: value.classroom,
          startTime: value.startTime || '08:00',
          endTime: value.endTime || '08:50',
          note: value.note || ''
        });
      }
    }

    // Find or create timetable for this section
    const Timetable = require('../models/Timetable');
    let timetable = await Timetable.findOne({ sectionRef: sectionId }).sort({ generatedAt: -1 });
    
    if (!timetable) {
      timetable = new Timetable({
        sectionRef: sectionId,
        generatedBy: userId,
        schedule,
        isPublished: false,
        version: '1.0'
      });
    } else {
      // Create new version with revision history
      const oldVersion = timetable.version || '1.0';
      const newVersion = parseFloat(oldVersion) + 0.1;
      
      // Add to revision history
      if (!timetable.revisionHistory) {
        timetable.revisionHistory = [];
      }
      timetable.revisionHistory.push({
        version: oldVersion,
        generatedAt: timetable.generatedAt,
        generatedBy: timetable.generatedBy,
        changes: `Updated schedule with ${schedule.length} sessions`
      });

      // Update timetable
      timetable.previousVersion = timetable._id;
      timetable.schedule = schedule;
      timetable.generatedBy = userId;
      timetable.isPublished = false;
      timetable.version = newVersion.toFixed(1);
      timetable.generatedAt = new Date();
    }

    await timetable.save();

    // Emit Socket.IO update
    if (req.io) {
      req.io.emit('timetable:update', {
        sectionId: sectionId,
        change: 'saved',
        timetable
      });
    }

    res.json({
      success: true,
      message: 'Timetable saved successfully',
      timetable
    });
  } catch (error) {
    console.error('Error saving section timetable:', error);
    res.status(500).json({ error: error.message });
  }
};

// Save admin timetable data
exports.saveAdminTimetable = async (req, res) => {
  try {
    const { force = false, ...timetableData } = req.body;
    const userId = req.user._id;

    // Validate room assignments
    const validationErrors = await validateRoomAssignments(timetableData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid room assignments',
        validationErrors: validationErrors
      });
    }

    // Check for conflicts if not forcing
    if (!force) {
      const conflicts = await checkConflicts(timetableData);
      if (conflicts.length > 0) {
        return res.status(409).json({
          error: 'Conflicts detected',
          conflicts: conflicts
        });
      }
    }

    // Find existing admin timetable or create new one
    let adminTimetable = await AdminTimetable.findOne({ isActive: true });
    
    if (!adminTimetable) {
      adminTimetable = new AdminTimetable({
        createdBy: userId,
        timetableData: new Map()
      });
    }

    // Convert timetable data to Map format
    const timetableMap = new Map();
    for (const [key, value] of Object.entries(timetableData)) {
      if (value && (value.subject || value.teacher || value.classroom)) {
        timetableMap.set(key, {
          subject: value.subject || null,
          teacher: value.teacher || null,
          classroom: value.classroom || null
        });
      }
    }

    adminTimetable.timetableData = timetableMap;
    adminTimetable.lastModified = new Date();
    
    await adminTimetable.save();

    // Emit Socket.IO update if available
    if (req.io) {
      req.io.emit('admin-timetable:update', {
        change: 'saved',
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Timetable saved successfully',
      data: adminTimetable
    });
  } catch (error) {
    console.error('Error saving admin timetable:', error);
    res.status(500).json({ error: error.message });
  }
};

// Enhanced conflict check with suggestions
exports.checkConflict = async (req, res) => {
  try {
    const { teacher, period, day, classroom, sectionId, subjectId } = req.query;

    if ((!teacher && !classroom) || !period || !day) {
      return res.json({ hasConflict: false });
    }

    let hasConflict = false;
    let conflictDetails = null;
    let suggestions = null;

    // Check against all published timetables
    const Timetable = require('../models/Timetable');
    const publishedTimetables = await Timetable.find({ isPublished: true })
      .populate('schedule.facultyRef')
      .populate('schedule.roomRef')
      .populate('schedule.subjectRef')
      .populate('sectionRef');

    // Check teacher conflicts
    if (teacher) {
      for (const timetable of publishedTimetables) {
        for (const session of timetable.schedule) {
          if (session.day === day && 
              session.period === parseInt(period) &&
              session.facultyRef?._id?.toString() === teacher) {
            hasConflict = true;
            conflictDetails = {
              conflictType: 'teacher',
              message: `Teacher is already teaching ${session.subjectRef?.name || 'a subject'} in ${session.roomRef?.code || 'a room'} for section ${timetable.sectionRef?.name || 'Unknown'}`,
              existingAssignment: {
                subject: session.subjectRef?.name || 'Unknown',
                room: session.roomRef?.code || 'Unknown',
                section: timetable.sectionRef?.name || 'Unknown'
              }
            };
            break;
          }
        }
        if (hasConflict) break;
      }
    }

    // Check room conflicts
    if (classroom) {
      for (const timetable of publishedTimetables) {
        for (const session of timetable.schedule) {
          if (session.day === day && 
              session.period === parseInt(period) &&
              session.roomRef?._id?.toString() === classroom) {
            hasConflict = true;
            conflictDetails = {
              conflictType: 'classroom',
              message: `Room is already occupied by ${session.subjectRef?.name || 'a subject'} taught by ${session.facultyRef?.name || 'a teacher'} for section ${timetable.sectionRef?.name || 'Unknown'}`,
              existingAssignment: {
                subject: session.subjectRef?.name || 'Unknown',
                teacher: session.facultyRef?.name || 'Unknown',
                section: timetable.sectionRef?.name || 'Unknown'
              }
            };
            break;
          }
        }
        if (hasConflict) break;
      }
    }

    // Generate suggestions if conflict found
    if (hasConflict && sectionId && subjectId) {
      suggestions = await generateSuggestions(sectionId, subjectId, day, period, teacher, classroom);
    }

    res.json({
      hasConflict,
      conflictDetails,
      suggestions
    });
  } catch (error) {
    console.error('Error checking conflicts:', error);
    res.status(500).json({ error: error.message });
  }
};

// Generate smart suggestions endpoint
exports.getSmartSuggestions = async (req, res) => {
  try {
    const { sectionId, subjectId, day, period, excludeTeacher, excludeRoom } = req.query;
    
    if (!sectionId || !subjectId || !day || !period) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const suggestions = await generateSuggestions(sectionId, subjectId, day, period, excludeTeacher, excludeRoom);
    res.json(suggestions);
  } catch (error) {
    console.error('Error getting suggestions:', error);
    res.status(500).json({ error: error.message });
  }
};

// Generate smart suggestions (internal function)
async function generateSuggestions(sectionId, subjectId, day, period, excludeTeacher, excludeRoom) {
  try {
    const Section = require('../models/Section');
    const Subject = require('../models/Subject');
    const Faculty = require('../models/Faculty');
    const Timetable = require('../models/Timetable');

    const section = await Section.findById(sectionId);
    const subject = await Subject.findById(subjectId);
    
    if (!section || !subject) {
      return { alternativeRooms: [], alternativeTeachers: [] };
    }

    const suggestions = {
      alternativeRooms: [],
      alternativeTeachers: []
    };

    // Find alternative rooms
    const suitableRooms = await Room.find({
      status: 'active',
      capacity: { $gte: section.strength || 0 },
      _id: { $ne: excludeRoom }
    });

    const filteredRooms = suitableRooms.filter(room => {
      if (subject.type === 'Lab') {
        return room.type === 'Lab' || room.allowLabClass;
      } else {
        return room.type === 'Classroom' || (room.type === 'Lab' && room.allowTheoryClass);
      }
    });

    // Check room availability
    const publishedTimetables = await Timetable.find({ isPublished: true })
      .populate('schedule.roomRef');

    const availableRooms = filteredRooms.filter(room => {
      for (const timetable of publishedTimetables) {
        for (const session of timetable.schedule) {
          if (session.day === day && 
              session.period === parseInt(period) &&
              session.roomRef?._id?.toString() === room._id.toString()) {
            return false;
          }
        }
      }
      return true;
    });

    suggestions.alternativeRooms = availableRooms
      .sort((a, b) => Math.abs(a.capacity - (section.strength || 0)) - Math.abs(b.capacity - (section.strength || 0)))
      .slice(0, 5)
      .map(r => ({
        id: r._id,
        code: r.code,
        name: r.name,
        capacity: r.capacity,
        building: r.building,
        type: r.type
      }));

    // Find alternative teachers who teach the same subject
    const Mapping = require('../models/Mapping');
    const mappings = await Mapping.find({ 
      subjectRef: subjectId,
      sectionRef: sectionId,
      facultyRef: { $ne: excludeTeacher }
    }).populate('facultyRef');

    // Check teacher availability
    const availableTeachers = [];
    for (const mapping of mappings) {
      const faculty = mapping.facultyRef;
      if (isTeacherAvailableAtTime(faculty, day, parseInt(period), publishedTimetables)) {
        availableTeachers.push({
          id: faculty._id,
          name: faculty.name,
          email: faculty.email
        });
      }
    }

    suggestions.alternativeTeachers = availableTeachers.slice(0, 5);

    return suggestions;
  } catch (error) {
    console.error('Error generating suggestions:', error);
    return { alternativeRooms: [], alternativeTeachers: [] };
  }
};

// Helper to check if teacher is available at specific time
function isTeacherAvailableAtTime(faculty, day, period, publishedTimetables) {
  // Check faculty availability
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (faculty.availability && faculty.availability.dayOfWeek) {
    const dayIndex = DAYS.indexOf(day);
    if (!faculty.availability.dayOfWeek.includes(dayIndex)) {
      return false;
    }
  }

  // Check if teacher is already assigned at this time
  for (const timetable of publishedTimetables) {
    for (const session of timetable.schedule) {
      if (session.day === day && 
          session.period === period &&
          session.facultyRef?._id?.toString() === faculty._id.toString()) {
        return false;
      }
    }
  }

  return true;
}

// Get available rooms for timetable assignment
exports.getAvailableRooms = async (req, res) => {
  try {
    // Get only active rooms that are available for assignment
    const availableRooms = await Room.find({
      status: 'active'
    }).select('_id name code building floor type capacity allowTheoryClass allowLabClass');

    res.json(availableRooms);
  } catch (error) {
    console.error('Error fetching available rooms:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get room suggestions based on subject type and section strength
exports.getRoomSuggestions = async (req, res) => {
  try {
    const { subjectId, sectionId, day, period } = req.query;
    
    if (!subjectId || !sectionId) {
      return res.status(400).json({ error: 'Subject ID and Section ID are required' });
    }

    const Subject = require('../models/Subject');
    const Section = require('../models/Section');
    
    const subject = await Subject.findById(subjectId);
    const section = await Section.findById(sectionId);
    
    if (!subject || !section) {
      return res.status(404).json({ error: 'Subject or Section not found' });
    }

    const minCapacity = section.strength || 0;
    const requiredType = subject.type === 'Lab' ? 'Lab' : 'Classroom';

    // Find suitable rooms
    let candidateRooms = await Room.find({
      status: 'active',
      capacity: { $gte: minCapacity }
    });

    // Filter by type compatibility
    candidateRooms = candidateRooms.filter(room => {
      if (subject.type === 'Lab') {
        return room.type === 'Lab' || room.allowLabClass;
      } else {
        return room.type === 'Classroom' || (room.type === 'Lab' && room.allowTheoryClass);
      }
    });

    // Check availability for the time slot
    const AdminTimetable = require('../models/AdminTimetable');
    const adminTimetable = await AdminTimetable.findOne({ isActive: true });
    
    const availableRooms = candidateRooms.filter(room => {
      if (!adminTimetable) return true;
      
      const cellKey = `${day}-${period}`;
      const cellData = adminTimetable.timetableData.get(cellKey);
      
      // Room is available if not assigned at this time
      return !cellData || cellData.classroom?.toString() !== room._id.toString();
    });

    // Sort by capacity (prefer rooms that match section strength)
    availableRooms.sort((a, b) => {
      const aDiff = Math.abs(a.capacity - minCapacity);
      const bDiff = Math.abs(b.capacity - minCapacity);
      return aDiff - bDiff;
    });

    res.json(availableRooms.slice(0, 5)); // Return top 5 suggestions
  } catch (error) {
    console.error('Error fetching room suggestions:', error);
    res.status(500).json({ error: error.message });
  }
};

// Helper function to validate room assignments
async function validateRoomAssignments(timetableData) {
  const errors = [];
  const roomIds = [];

  // Collect all room IDs from timetable data
  for (const [key, value] of Object.entries(timetableData)) {
    if (value && value.classroom) {
      roomIds.push(value.classroom);
    }
  }

  if (roomIds.length === 0) {
    return errors; // No rooms to validate
  }

  try {
    // Check if all room IDs exist in the Room collection and are active
    const validRooms = await Room.find({
      _id: { $in: roomIds },
      status: 'active'
    }).select('_id name code status');

    const validRoomIds = validRooms.map(room => room._id.toString());

    // Check for invalid room assignments
    for (const [key, value] of Object.entries(timetableData)) {
      if (value && value.classroom) {
        if (!validRoomIds.includes(value.classroom)) {
          const [day, period] = key.split('-');
          errors.push({
            timeSlot: key,
            day,
            period,
            roomId: value.classroom,
            message: `Invalid or inactive room assigned at ${day} Period ${period}`
          });
        }
      }
    }
  } catch (error) {
    console.error('Error validating room assignments:', error);
    errors.push({
      message: 'Error validating room assignments',
      error: error.message
    });
  }

  return errors;
}

// Helper function to check for conflicts in the entire timetable
async function checkConflicts(timetableData) {
  const conflicts = [];
  const teacherSchedule = new Map(); // teacher -> [day-period]
  const classroomSchedule = new Map(); // classroom -> [day-period]

  for (const [key, value] of Object.entries(timetableData)) {
    if (!value || (!value.teacher && !value.classroom)) continue;

    const [day, period] = key.split('-');
    const timeSlot = `${day}-${period}`;

    // Check teacher conflicts
    if (value.teacher) {
      if (!teacherSchedule.has(value.teacher)) {
        teacherSchedule.set(value.teacher, []);
      }
      
      const teacherSlots = teacherSchedule.get(value.teacher);
      if (teacherSlots.includes(timeSlot)) {
        conflicts.push({
          type: 'teacher',
          teacher: value.teacher,
          timeSlot,
          message: `Teacher is already assigned at ${day} Period ${period}`
        });
      } else {
        teacherSlots.push(timeSlot);
      }
    }

    // Check classroom conflicts
    if (value.classroom) {
      if (!classroomSchedule.has(value.classroom)) {
        classroomSchedule.set(value.classroom, []);
      }
      
      const classroomSlots = classroomSchedule.get(value.classroom);
      if (classroomSlots.includes(timeSlot)) {
        conflicts.push({
          type: 'classroom',
          classroom: value.classroom,
          timeSlot,
          message: `Classroom is already assigned at ${day} Period ${period}`
        });
      } else {
        classroomSlots.push(timeSlot);
      }
    }
  }

  return conflicts;
}