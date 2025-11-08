const mongoose = require('mongoose');
const validationService = require('../services/validationService');
const Room = require('../models/Room');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const Timetable = require('../models/Timetable');

describe('ValidationService - Timetable Conflict Detection', () => {
  let testRoom, testSubject, testSection, testTimetable;

  beforeAll(async () => {
    // Connect to test database
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

    // Create test data
    testRoom = await Room.create({
      code: 'R101',
      name: 'Room 101',
      building: 'Main Building',
      floor: 1,
      type: 'Classroom',
      capacity: 50,
      status: 'active',
      equipment: ['Projector', 'Whiteboard']
    });

    testSubject = await Subject.create({
      code: 'CS101',
      name: 'Computer Science 101',
      type: 'Theory',
      weeklyPeriods: 4,
      requiredEquipment: ['Projector']
    });

    testSection = await Section.create({
      name: 'CS-A',
      code: 'CSA',
      department: 'Computer Science',
      year: 1,
      semester: 1,
      academicYear: '2024-2025',
      strength: 45,
      maxStrength: 60
    });
  });

  describe('Constraint 1: Room Status Validation', () => {
    test('should pass when room is active', async () => {
      const result = await validationService.validateRoomStatus(testRoom._id);
      
      expect(result.passed).toBe(true);
      expect(result.message).toBe('Room is available');
    });

    test('should fail when room is in maintenance', async () => {
      testRoom.status = 'in_maintenance';
      await testRoom.save();

      const result = await validationService.validateRoomStatus(testRoom._id);
      
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('error');
      expect(result.type).toBe('room_unavailable');
      expect(result.canOverride).toBe(false);
    });

    test('should fail when room is reserved', async () => {
      testRoom.status = 'reserved';
      await testRoom.save();

      const result = await validationService.validateRoomStatus(testRoom._id);
      
      expect(result.passed).toBe(false);
      expect(result.data.status).toBe('reserved');
    });

    test('should fail when room is closed', async () => {
      testRoom.status = 'closed';
      await testRoom.save();

      const result = await validationService.validateRoomStatus(testRoom._id);
      
      expect(result.passed).toBe(false);
    });

    test('should fail when room does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const result = await validationService.validateRoomStatus(fakeId);
      
      expect(result.passed).toBe(false);
      expect(result.type).toBe('room_not_found');
    });
  });

  describe('Constraint 2: Room Capacity Validation', () => {
    test('should pass when capacity is sufficient', async () => {
      const result = await validationService.validateCapacity(testRoom._id, testSection._id);
      
      expect(result.passed).toBe(true);
      expect(result.message).toBe('Room capacity is appropriate');
    });

    test('should fail when capacity is insufficient', async () => {
      testSection.strength = 60;
      await testSection.save();

      const result = await validationService.validateCapacity(testRoom._id, testSection._id);
      
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('error');
      expect(result.type).toBe('capacity_insufficient');
      expect(result.canOverride).toBe(true);
      expect(result.data.deficit).toBe(10);
    });

    test('should warn when room is oversized', async () => {
      testSection.strength = 20;
      await testSection.save();

      const result = await validationService.validateCapacity(testRoom._id, testSection._id);
      
      expect(result.passed).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.type).toBe('capacity_oversized');
    });
  });

  describe('Constraint 3: Equipment Validation', () => {
    test('should pass when all equipment is available', async () => {
      const result = await validationService.validateEquipment(testRoom._id, testSubject._id);
      
      expect(result.passed).toBe(true);
      expect(result.message).toBe('All required equipment available');
    });

    test('should pass when no equipment is required', async () => {
      testSubject.requiredEquipment = [];
      await testSubject.save();

      const result = await validationService.validateEquipment(testRoom._id, testSubject._id);
      
      expect(result.passed).toBe(true);
      expect(result.message).toBe('No special equipment required');
    });

    test('should warn when equipment is missing', async () => {
      testSubject.requiredEquipment = ['Projector', 'Smart Board', 'Audio System'];
      await testSubject.save();

      const result = await validationService.validateEquipment(testRoom._id, testSubject._id);
      
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('warning');
      expect(result.type).toBe('equipment_missing');
      expect(result.canOverride).toBe(true);
      expect(result.data.missing).toContain('Smart Board');
      expect(result.data.missing).toContain('Audio System');
    });
  });

  describe('Constraint 4: Time Slot Availability', () => {
    let testFaculty;
    
    beforeEach(async () => {
      // Create faculty for timetable
      const Faculty = require('../models/Faculty');
      await Faculty.deleteMany({}); // Clear faculty before creating
      testFaculty = await Faculty.create({
        name: 'Dr. Test',
        email: 'test@university.edu',
        department: 'Computer Science'
      });
      
      // Create a published timetable with a schedule
      testTimetable = await Timetable.create({
        sectionRef: testSection._id,
        isPublished: true,
        schedule: [{
          day: 'Monday',
          period: 1,
          startTime: '09:00',
          endTime: '10:00',
          subjectRef: testSubject._id,
          facultyRef: testFaculty._id,
          roomRef: testRoom._id
        }]
      });
    });

    test('should pass when time slot is available', async () => {
      const result = await validationService.validateTimeSlotAvailability(
        testRoom._id,
        'Monday',
        2
      );
      
      expect(result.passed).toBe(true);
      expect(result.message).toBe('Time slot is available');
    });

    test('should fail when room is occupied at same time', async () => {
      const result = await validationService.validateTimeSlotAvailability(
        testRoom._id,
        'Monday',
        1
      );
      
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('error');
      expect(result.type).toBe('room_occupied');
      expect(result.canOverride).toBe(true);
      expect(result.data.conflictingClass).toBeDefined();
    });

    test('should pass when excluding current timetable', async () => {
      const result = await validationService.validateTimeSlotAvailability(
        testRoom._id,
        'Monday',
        1,
        testTimetable._id
      );
      
      expect(result.passed).toBe(true);
    });
  });

  describe('Constraint 5: Room Type Validation', () => {
    test('should pass when room type matches', async () => {
      const result = await validationService.validateRoomType(testRoom._id, testSubject._id);
      
      expect(result.passed).toBe(true);
      expect(result.message).toBe('Room type matches requirements');
    });

    test('should warn when lab subject assigned to classroom', async () => {
      testSubject.type = 'Lab';
      await testSubject.save();

      const result = await validationService.validateRoomType(testRoom._id, testSubject._id);
      
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('warning');
      expect(result.type).toBe('type_mismatch');
      expect(result.canOverride).toBe(true);
      expect(result.data.requiredType).toBe('Lab');
    });

    test('should warn when classroom subject assigned to lab', async () => {
      testRoom.type = 'Lab';
      await testRoom.save();

      const result = await validationService.validateRoomType(testRoom._id, testSubject._id);
      
      expect(result.passed).toBe(false);
      expect(result.data.roomType).toBe('Lab');
      expect(result.data.requiredType).toBe('Classroom');
    });
  });

  describe('Comprehensive Validation', () => {
    test('should return valid result when all constraints pass', async () => {
      const result = await validationService.validateRoomAssignment(
        {
          timetableId: null,
          day: 'Tuesday',
          period: 1,
          subjectId: testSubject._id,
          sectionId: testSection._id
        },
        testRoom._id
      );
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.canForceUpdate).toBe(false);
    });

    test('should return errors and allow force update for overridable constraints', async () => {
      testSection.strength = 60; // Exceeds capacity
      await testSection.save();

      const result = await validationService.validateRoomAssignment(
        {
          day: 'Tuesday',
          period: 1,
          subjectId: testSubject._id,
          sectionId: testSection._id
        },
        testRoom._id
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.canForceUpdate).toBe(true);
    });

    test('should not allow force update for non-overridable constraints', async () => {
      testRoom.status = 'closed';
      await testRoom.save();

      const result = await validationService.validateRoomAssignment(
        {
          day: 'Tuesday',
          period: 1,
          subjectId: testSubject._id,
          sectionId: testSection._id
        },
        testRoom._id
      );
      
      expect(result.isValid).toBe(false);
      expect(result.canForceUpdate).toBe(false);
    });
  });
});
