// Ensure User model is registered before other models
require('./setup');

const mongoose = require('mongoose');
const conflictDetectionService = require('../services/conflictDetectionService');
const Room = require('../models/Room');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const Timetable = require('../models/Timetable');
const Conflict = require('../models/Conflict');
const Faculty = require('../models/Faculty');

describe('ConflictDetectionService - Room Status Change Detection', () => {
  let testRoom, testSubject, testSection, testFaculty, testTimetable;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/smart-test', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear collections
    await Room.deleteMany({});
    await Subject.deleteMany({});
    await Section.deleteMany({});
    await Timetable.deleteMany({});
    await Conflict.deleteMany({});
    await Faculty.deleteMany({});

    // Create test data
    testRoom = await Room.create({
      code: 'R201',
      name: 'Room 201',
      building: 'Main Building',
      floor: 2,
      type: 'Classroom',
      capacity: 50,
      status: 'active'
    });

    testSubject = await Subject.create({
      code: 'MATH101',
      name: 'Mathematics 101',
      type: 'Theory',
      weeklyPeriods: 5
    });

    testSection = await Section.create({
      name: 'MATH-A',
      code: 'MATHA',
      department: 'Mathematics',
      year: 1,
      semester: 1,
      academicYear: '2024-2025',
      strength: 40,
      maxStrength: 50
    });

    testFaculty = await Faculty.create({
      name: 'Dr. Smith',
      email: 'smith@university.edu',
      department: 'Mathematics'
    });

    // Create published timetable with schedule
    testTimetable = await Timetable.create({
      sectionRef: testSection._id,
      isPublished: true,
      schedule: [
        {
          day: 'Monday',
          period: 1,
          startTime: '09:00',
          endTime: '10:00',
          subjectRef: testSubject._id,
          facultyRef: testFaculty._id,
          roomRef: testRoom._id
        },
        {
          day: 'Wednesday',
          period: 2,
          startTime: '10:00',
          endTime: '11:00',
          subjectRef: testSubject._id,
          facultyRef: testFaculty._id,
          roomRef: testRoom._id
        }
      ]
    });
  });

  describe('Room Status Change Monitoring', () => {
    test('should detect conflicts when room becomes unavailable', async () => {
      const oldStatus = testRoom.status;
      testRoom.status = 'in_maintenance';
      
      const conflict = await conflictDetectionService.monitorRoomStatusChanges(testRoom, oldStatus);
      
      expect(conflict).toBeDefined();
      expect(conflict.roomId.toString()).toBe(testRoom._id.toString());
      expect(conflict.originalStatus).toBe('active');
      expect(conflict.newStatus).toBe('in_maintenance');
      expect(conflict.affectedEntries).toHaveLength(2);
    });

    test('should not create conflict when room becomes active', async () => {
      testRoom.status = 'active';
      
      const conflict = await conflictDetectionService.monitorRoomStatusChanges(testRoom, 'active');
      
      expect(conflict).toBeNull();
    });

    test('should clear affected flags when room becomes active again', async () => {
      // First make room unavailable
      testRoom.status = 'closed';
      await conflictDetectionService.monitorRoomStatusChanges(testRoom, 'active');
      
      // Verify entries are marked as affected
      let timetable = await Timetable.findById(testTimetable._id);
      expect(timetable.schedule[0].isAffected).toBe(true);
      
      // Now make room active again
      testRoom.status = 'active';
      await conflictDetectionService.monitorRoomStatusChanges(testRoom, 'closed');
      
      // Verify affected flags are cleared
      timetable = await Timetable.findById(testTimetable._id);
      expect(timetable.schedule[0].isAffected).toBe(false);
      expect(timetable.schedule[0].conflictId).toBeNull();
    });
  });

  describe('Affected Entries Identification', () => {
    test('should identify all affected timetable entries', async () => {
      const affectedEntries = await conflictDetectionService.identifyAffectedEntries(
        testRoom._id,
        'in_maintenance'
      );
      
      expect(affectedEntries).toHaveLength(2);
      expect(affectedEntries[0].scheduleItem.day).toBe('Monday');
      expect(affectedEntries[1].scheduleItem.day).toBe('Wednesday');
    });

    test('should not identify unpublished timetables', async () => {
      testTimetable.isPublished = false;
      await testTimetable.save();
      
      const affectedEntries = await conflictDetectionService.identifyAffectedEntries(
        testRoom._id,
        'reserved'
      );
      
      expect(affectedEntries).toHaveLength(0);
    });

    test('should only identify entries for specific room', async () => {
      const anotherRoom = await Room.create({
        code: 'R202',
        name: 'Room 202',
        type: 'Lab',
        capacity: 30,
        status: 'active'
      });
      
      const affectedEntries = await conflictDetectionService.identifyAffectedEntries(
        anotherRoom._id,
        'offline'
      );
      
      expect(affectedEntries).toHaveLength(0);
    });
  });

  describe('Mark Entries as Affected', () => {
    test('should mark timetable entries with affected flags', async () => {
      const affectedEntries = await conflictDetectionService.identifyAffectedEntries(
        testRoom._id,
        'reserved'
      );
      
      await conflictDetectionService.markEntriesAsAffected(
        affectedEntries,
        testRoom._id,
        'active',
        'reserved'
      );
      
      const timetable = await Timetable.findById(testTimetable._id);
      
      expect(timetable.schedule[0].isAffected).toBe(true);
      expect(timetable.schedule[0].originalRoomId.toString()).toBe(testRoom._id.toString());
      expect(timetable.schedule[0].affectedReason).toContain('reserved');
      expect(timetable.schedule[0].affectedAt).toBeDefined();
    });
  });

  describe('Conflict Record Creation', () => {
    test('should create comprehensive conflict record', async () => {
      const affectedEntries = await conflictDetectionService.identifyAffectedEntries(
        testRoom._id,
        'closed'
      );
      
      // Set room status to closed before creating conflict
      testRoom.status = 'closed';
      
      const conflict = await conflictDetectionService.createConflictRecord(
        testRoom,
        affectedEntries,
        'active'
      );
      
      expect(conflict.roomCode).toBe('R201');
      expect(conflict.originalStatus).toBe('active');
      expect(conflict.newStatus).toBe('closed');
      expect(conflict.status).toBe('active');
      expect(conflict.affectedEntries).toHaveLength(2);
      expect(conflict.resolutionSummary.totalAffected).toBe(2);
      expect(conflict.resolutionSummary.unresolved).toBe(2);
    });

    test('should populate affected entries with complete details', async () => {
      const affectedEntries = await conflictDetectionService.identifyAffectedEntries(
        testRoom._id,
        'in_maintenance'
      );
      
      // Set room status to in_maintenance before creating conflict
      testRoom.status = 'in_maintenance';
      
      const conflict = await conflictDetectionService.createConflictRecord(
        testRoom,
        affectedEntries,
        'active'
      );
      
      const entry = conflict.affectedEntries[0];
      expect(entry.subjectName).toBe('Mathematics 101');
      expect(entry.facultyName).toBe('Dr. Smith');
      expect(entry.sectionName).toBe('MATH-A');
      expect(entry.day).toBe('Monday');
      expect(entry.period).toBe(1);
      expect(entry.status).toBe('pending');
    });
  });

  describe('Scheduled Classes Check', () => {
    test('should find scheduled classes for a room', async () => {
      const result = await conflictDetectionService.checkScheduledClasses(testRoom._id);
      
      expect(result.hasScheduledClasses).toBe(true);
      expect(result.count).toBe(2);
      expect(result.classes).toHaveLength(2);
      expect(result.classes[0].subject).toBe('Mathematics 101');
    });

    test('should return empty for room with no classes', async () => {
      const emptyRoom = await Room.create({
        code: 'R999',
        name: 'Empty Room',
        building: 'Annex',
        floor: 1,
        type: 'Classroom',
        capacity: 40,
        status: 'active'
      });
      
      const result = await conflictDetectionService.checkScheduledClasses(emptyRoom._id);
      
      expect(result.hasScheduledClasses).toBe(false);
      expect(result.count).toBe(0);
      expect(result.classes).toHaveLength(0);
    });
  });

  describe('Unavailable Status Detection', () => {
    const unavailableStatuses = ['in_maintenance', 'reserved', 'closed', 'offline'];
    
    unavailableStatuses.forEach(status => {
      test(`should detect conflict for status: ${status}`, async () => {
        testRoom.status = status;
        
        const conflict = await conflictDetectionService.monitorRoomStatusChanges(
          testRoom,
          'active'
        );
        
        expect(conflict).toBeDefined();
        expect(conflict.newStatus).toBe(status);
      });
    });

    test('should not detect conflict for active status', async () => {
      testRoom.status = 'active';
      
      const conflict = await conflictDetectionService.monitorRoomStatusChanges(
        testRoom,
        'active'
      );
      
      expect(conflict).toBeNull();
    });
  });

  describe('Active Conflicts Retrieval', () => {
    test('should retrieve all active conflicts', async () => {
      // Create multiple conflicts
      testRoom.status = 'in_maintenance';
      await conflictDetectionService.monitorRoomStatusChanges(testRoom, 'active');
      
      const anotherRoom = await Room.create({
        code: 'R301',
        name: 'Room 301',
        building: 'Science Block',
        floor: 3,
        type: 'Lab',
        capacity: 25,
        status: 'active' // Start as active, then change to closed
      });
      
      await Timetable.create({
        sectionRef: testSection._id,
        isPublished: true,
        schedule: [{
          day: 'Friday',
          period: 3,
          startTime: '13:00',
          endTime: '14:00',
          subjectRef: testSubject._id,
          facultyRef: testFaculty._id,
          roomRef: anotherRoom._id
        }]
      });
      
      // Change room status to closed to create conflict
      anotherRoom.status = 'closed';
      await conflictDetectionService.monitorRoomStatusChanges(anotherRoom, 'active');
      
      const conflicts = await conflictDetectionService.getActiveConflicts();
      
      expect(conflicts.length).toBeGreaterThanOrEqual(2);
    });
  });
});
