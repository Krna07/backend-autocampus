/**
 * Comprehensive Constraint Testing Script
 * Tests all timetable conflict detection constraints
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Room = require('./models/Room');
const Timetable = require('./models/Timetable');
const Subject = require('./models/Subject');
const Section = require('./models/Section');
const Faculty = require('./models/Faculty');
const validationService = require('./services/validationService');
const conflictDetectionService = require('./services/conflictDetectionService');
const smartSuggestionService = require('./services/smartSuggestionService');

// Test results tracker
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, message) {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}`);
  if (message) console.log(`   ${message}`);
  
  testResults.tests.push({ name, passed, message });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

async function setupTestData() {
  console.log('\n📦 Setting up test data...\n');
  
  // Create test room
  const testRoom = await Room.create({
    code: 'TEST-101',
    name: 'Test Room 101',
    building: 'Test Building',
    floor: 1,
    type: 'Classroom',
    capacity: 50,
    equipment: ['Projector', 'Whiteboard'],
    status: 'active'
  });
  
  // Create test subject
  const testSubject = await Subject.create({
    name: 'Test Subject',
    code: 'TEST101',
    type: 'Theory',
    requiredEquipment: ['Projector']
  });
  
  // Create test section
  const testSection = await Section.create({
    name: 'Test Section A',
    strength: 40,
    semester: 1,
    year: 1
  });
  
  // Create test faculty
  const testFaculty = await Faculty.create({
    name: 'Test Faculty',
    email: 'test@faculty.com',
    department: 'Test Department'
  });
  
  // Create test timetable
  const testTimetable = await Timetable.create({
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
      }
    ]
  });
  
  return {
    room: testRoom,
    subject: testSubject,
    section: testSection,
    faculty: testFaculty,
    timetable: testTimetable
  };
}

async function cleanupTestData() {
  console.log('\n🧹 Cleaning up test data...\n');
  
  await Room.deleteMany({ code: /^TEST-/ });
  await Subject.deleteMany({ code: /^TEST/ });
  await Section.deleteMany({ name: /^Test Section/ });
  await Faculty.deleteMany({ email: /^test@/ });
  await Timetable.deleteMany({ isDemo: true });
}

// ============================================
// CONSTRAINT TESTS
// ============================================

async function testRoomStatusConstraint(testData) {
  console.log('\n🔍 Testing Room Status C