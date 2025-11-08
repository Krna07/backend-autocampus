const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

// Import all models
const User = require('../models/User');
const Faculty = require('../models/Faculty');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const Room = require('../models/Room');
const Mapping = require('../models/Mapping');
const Timetable = require('../models/Timetable');
const Block = require('../models/Block');
const PeriodConfig = require('../models/PeriodConfig');
const RoomBooking = require('../models/RoomBooking');
const Notification = require('../models/Notification');
const Occupancy = require('../models/Occupancy');
const Attendance = require('../models/Attendance');
const Conflict = require('../models/Conflict');
const AuditLog = require('../models/AuditLog');

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/smartcampus";

async function completeSeed() {
  try {
    console.log('🚀 Starting Complete Database Seed...\n');
    
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    // Clean all collections
    console.log('🗑️  Cleaning existing data...');
    await Promise.all([
      User.deleteMany(),
      Faculty.deleteMany(),
      Subject.deleteMany(),
      Section.deleteMany(),
      Room.deleteMany(),
      Mapping.deleteMany(),
      Timetable.deleteMany(),
      Block.deleteMany(),
      PeriodConfig.deleteMany(),
      RoomBooking.deleteMany(),
      Notification.deleteMany(),
      Occupancy.deleteMany(),
      Attendance.deleteMany(),
      Conflict.deleteMany(),
      AuditLog.deleteMany()
    ]);
    console.log("✅ All collections cleared\n");

    // ==================== STEP 1: Period Configuration ====================
    console.log('⏰ Creating Period Configuration...');
    const periodConfig = await PeriodConfig.create({
      periods: new Map([
        ['1', { start: '08:15', end: '09:05' }],
        ['2', { start: '09:05', end: '09:55' }],
        ['3', { start: '10:10', end: '11:00' }],
        ['4', { start: '11:00', end: '11:50' }],
        ['5', { start: '12:35', end: '13:25' }],
        ['6', { start: '13:25', end: '14:15' }],
        ['7', { start: '14:15', end: '15:05' }]
      ]),
      isActive: true,
      version: '1.0'
    });
    console.log('✅ Period configuration created\n');

    // ==================== STEP 2: Rooms ====================
    console.log('🏢 Creating Rooms...');
    const rooms = await Room.insertMany([
      // N-Block Classrooms
      { code: 'N-101', name: 'Classroom 101', building: 'N-Block', floor: 1, type: 'Classroom', capacity: 60, status: 'active', equipment: ['Projector', 'Whiteboard', 'AC'], allowTheoryClass: true, allowLabClass: false },
      { code: 'N-102', name: 'Classroom 102', building: 'N-Block', floor: 1, type: 'Classroom', capacity: 60, status: 'active', equipment: ['Projector', 'Whiteboard'], allowTheoryClass: true, allowLabClass: false },
      { code: 'N-201', name: 'Classroom 201', building: 'N-Block', floor: 2, type: 'Classroom', capacity: 70, status: 'active', equipment: ['Projector', 'Whiteboard', 'AC', 'Smart Board'], allowTheoryClass: true, allowLabClass: false },
      { code: 'N-202', name: 'Classroom 202', building: 'N-Block', floor: 2, type: 'Classroom', capacity: 65, status: 'active', equipment: ['Projector', 'Whiteboard'], allowTheoryClass: true, allowLabClass: false },
      { code: 'N-301', name: 'Seminar Hall', building: 'N-Block', floor: 3, type: 'Classroom', capacity: 120, status: 'active', equipment: ['Projector', 'Audio System', 'AC', 'Smart Board'], allowTheoryClass: true, allowLabClass: false },
      
      // U-Block Labs
      { code: 'U-101', name: 'Computer Lab 1', building: 'U-Block', floor: 1, type: 'Lab', capacity: 40, status: 'active', equipment: ['Computers', 'Projector', 'AC'], allowTheoryClass: false, allowLabClass: true },
      { code: 'U-102', name: 'Computer Lab 2', building: 'U-Block', floor: 1, type: 'Lab', capacity: 40, status: 'active', equipment: ['Computers', 'Projector', 'AC'], allowTheoryClass: false, allowLabClass: true },
      { code: 'U-103', name: 'Network Lab', building: 'U-Block', floor: 1, type: 'Lab', capacity: 35, status: 'active', equipment: ['Computers', 'Network Equipment', 'Projector'], allowTheoryClass: false, allowLabClass: true },
      { code: 'U-201', name: 'DBMS Lab', building: 'U-Block', floor: 2, type: 'Lab', capacity: 40, status: 'active', equipment: ['Computers', 'Projector', 'AC'], allowTheoryClass: false, allowLabClass: true },
      { code: 'U-202', name: 'Web Tech Lab', building: 'U-Block', floor: 2, type: 'Lab', capacity: 40, status: 'active', equipment: ['Computers', 'Projector', 'AC'], allowTheoryClass: false, allowLabClass: true },
      
      // S-Block Mixed
      { code: 'S-101', name: 'Classroom 101', building: 'S-Block', floor: 1, type: 'Classroom', capacity: 55, status: 'active', equipment: ['Projector', 'Whiteboard'], allowTheoryClass: true, allowLabClass: false },
      { code: 'S-102', name: 'Classroom 102', building: 'S-Block', floor: 1, type: 'Classroom', capacity: 55, status: 'active', equipment: ['Projector', 'Whiteboard'], allowTheoryClass: true, allowLabClass: false },
      { code: 'S-201', name: 'Microprocessor Lab', building: 'S-Block', floor: 2, type: 'Lab', capacity: 35, status: 'active', equipment: ['Computers', 'Microprocessor Kits', 'Projector'], allowTheoryClass: false, allowLabClass: true },
      
      // Maintenance room for testing
      { code: 'N-103', name: 'Classroom 103', building: 'N-Block', floor: 1, type: 'Classroom', capacity: 60, status: 'in_maintenance', equipment: ['Projector'], allowTheoryClass: true, allowLabClass: false }
    ]);
    console.log(`✅ Created ${rooms.length} rooms\n`);

    // ==================== STEP 3: Subjects ====================
    console.log('📚 Creating Subjects...');
    const subjects = await Subject.insertMany([
      { code: 'CS301', name: 'Data Structures', type: 'Theory', weeklyPeriods: 4, preferredRoomType: 'Classroom', requiredEquipment: ['Projector'] },
      { code: 'CS302', name: 'Database Management Systems', type: 'Theory', weeklyPeriods: 4, preferredRoomType: 'Classroom', requiredEquipment: ['Projector'] },
      { code: 'CS303', name: 'Computer Networks', type: 'Theory', weeklyPeriods: 3, preferredRoomType: 'Classroom', requiredEquipment: ['Projector'] },
      { code: 'CS304', name: 'Operating Systems', type: 'Theory', weeklyPeriods: 4, preferredRoomType: 'Classroom', requiredEquipment: ['Projector'] },
      { code: 'CS305', name: 'Web Technologies', type: 'Theory', weeklyPeriods: 3, preferredRoomType: 'Classroom', requiredEquipment: ['Projector'] },
      { code: 'CS306', name: 'Software Engineering', type: 'Theory', weeklyPeriods: 3, preferredRoomType: 'Classroom', requiredEquipment: ['Projector'] },
      
      // Lab Subjects
      { code: 'CS301L', name: 'Data Structures Lab', type: 'Lab', weeklyPeriods: 2, preferredRoomType: 'Lab', requiredEquipment: ['Computers'], requiresLab: true },
      { code: 'CS302L', name: 'DBMS Lab', type: 'Lab', weeklyPeriods: 2, preferredRoomType: 'Lab', requiredEquipment: ['Computers'], requiresLab: true },
      { code: 'CS303L', name: 'Computer Networks Lab', type: 'Lab', weeklyPeriods: 2, preferredRoomType: 'Lab', requiredEquipment: ['Computers', 'Network Equipment'], requiresLab: true },
      { code: 'CS305L', name: 'Web Technologies Lab', type: 'Lab', weeklyPeriods: 2, preferredRoomType: 'Lab', requiredEquipment: ['Computers'], requiresLab: true }
    ]);
    console.log(`✅ Created ${subjects.length} subjects\n`);

    // ==================== STEP 4: Faculty ====================
    console.log('👨‍🏫 Creating Faculty...');
    const faculty = await Faculty.insertMany([
      { name: 'Dr. Rajesh Kumar', email: 'rajesh@university.edu', department: 'Computer Science', maxHoursPerWeek: 18, specialization: 'Data Structures' },
      { name: 'Dr. Priya Sharma', email: 'priya@university.edu', department: 'Computer Science', maxHoursPerWeek: 18, specialization: 'Database Systems' },
      { name: 'Prof. Amit Patel', email: 'amit@university.edu', department: 'Computer Science', maxHoursPerWeek: 18, specialization: 'Computer Networks' },
      { name: 'Dr. Sneha Reddy', email: 'sneha@university.edu', department: 'Computer Science', maxHoursPerWeek: 18, specialization: 'Operating Systems' },
      { name: 'Prof. Vikram Singh', email: 'vikram@university.edu', department: 'Computer Science', maxHoursPerWeek: 18, specialization: 'Web Technologies' },
      { name: 'Dr. Anita Desai', email: 'anita@university.edu', department: 'Computer Science', maxHoursPerWeek: 18, specialization: 'Software Engineering' },
      { name: 'Mr. Karthik Rao', email: 'karthik@university.edu', department: 'Computer Science', maxHoursPerWeek: 16, specialization: 'Lab Instructor' },
      { name: 'Ms. Divya Nair', email: 'divya@university.edu', department: 'Computer Science', maxHoursPerWeek: 16, specialization: 'Lab Instructor' }
    ]);
    console.log(`✅ Created ${faculty.length} faculty members\n`);

    // ==================== STEP 5: Sections ====================
    console.log('🎓 Creating Sections...');
    const sections = await Section.insertMany([
      { 
        name: 'CSE-3A', 
        code: 'CSE3A', 
        department: 'Computer Science', 
        year: 3, 
        semester: 5, 
        academicYear: '2024-2025', 
        strength: 58, 
        maxStrength: 65,
        preferredBuildings: ['N-Block', 'U-Block']
      },
      { 
        name: 'CSE-3B', 
        code: 'CSE3B', 
        department: 'Computer Science', 
        year: 3, 
        semester: 5, 
        academicYear: '2024-2025', 
        strength: 60, 
        maxStrength: 65,
        preferredBuildings: ['N-Block', 'U-Block']
      },
      { 
        name: 'CSE-2A', 
        code: 'CSE2A', 
        department: 'Computer Science', 
        year: 2, 
        semester: 3, 
        academicYear: '2024-2025', 
        strength: 55, 
        maxStrength: 60,
        preferredBuildings: ['S-Block', 'U-Block']
      }
    ]);
    console.log(`✅ Created ${sections.length} sections\n`);

    // ==================== STEP 6: Users (Admin, Faculty, Students) ====================
    console.log('👥 Creating Users...');
    const adminPassword = await bcrypt.hash("admin123", 10);
    const facultyPassword = await bcrypt.hash("faculty123", 10);
    const studentPassword = await bcrypt.hash("student123", 10);
    
    // Admin User
    const adminUser = await User.create({
      name: "Tushar (Admin)",
      email: "tushar110704@gmail.com",
      passwordHash: adminPassword,
      role: "admin",
      mobile: "9999999999"
    });
    
    // Faculty Users
    const facultyUsers = await User.insertMany([
      { name: faculty[0].name, email: faculty[0].email, passwordHash: facultyPassword, role: "faculty", mobile: "9876543210" },
      { name: faculty[1].name, email: faculty[1].email, passwordHash: facultyPassword, role: "faculty", mobile: "9876543211" },
      { name: faculty[2].name, email: faculty[2].email, passwordHash: facultyPassword, role: "faculty", mobile: "9876543212" },
      { name: faculty[3].name, email: faculty[3].email, passwordHash: facultyPassword, role: "faculty", mobile: "9876543213" },
      { name: faculty[4].name, email: faculty[4].email, passwordHash: facultyPassword, role: "faculty", mobile: "9876543214" },
      { name: faculty[5].name, email: faculty[5].email, passwordHash: facultyPassword, role: "faculty", mobile: "9876543215" }
    ]);
    
    // Student Users for CSE-3A
    const students3A = await User.insertMany([
      { name: "Rahul Verma", email: "rahul.verma@student.edu", passwordHash: studentPassword, role: "student", regNumber: "21B01A0501", mobile: "9876543220", sectionRef: sections[0]._id },
      { name: "Priya Gupta", email: "priya.gupta@student.edu", passwordHash: studentPassword, role: "student", regNumber: "21B01A0502", mobile: "9876543221", sectionRef: sections[0]._id },
      { name: "Amit Shah", email: "amit.shah@student.edu", passwordHash: studentPassword, role: "student", regNumber: "21B01A0503", mobile: "9876543222", sectionRef: sections[0]._id },
      { name: "Sneha Iyer", email: "sneha.iyer@student.edu", passwordHash: studentPassword, role: "student", regNumber: "21B01A0504", mobile: "9876543223", sectionRef: sections[0]._id },
      { name: "Vikram Joshi", email: "vikram.joshi@student.edu", passwordHash: studentPassword, role: "student", regNumber: "21B01A0505", mobile: "9876543224", sectionRef: sections[0]._id },
      { name: "Student Demo", email: "student@smartcampus.edu", passwordHash: studentPassword, role: "student", regNumber: "21B01A0506", mobile: "9876543225", sectionRef: sections[0]._id }
    ]);
    
    // Student Users for CSE-3B
    const students3B = await User.insertMany([
      { name: "Arjun Mehta", email: "arjun.mehta@student.edu", passwordHash: studentPassword, role: "student", regNumber: "21B01A0551", mobile: "9876543230", sectionRef: sections[1]._id },
      { name: "Kavya Reddy", email: "kavya.reddy@student.edu", passwordHash: studentPassword, role: "student", regNumber: "21B01A0552", mobile: "9876543231", sectionRef: sections[1]._id },
      { name: "Rohan Kumar", email: "rohan.kumar@student.edu", passwordHash: studentPassword, role: "student", regNumber: "21B01A0553", mobile: "9876543232", sectionRef: sections[1]._id }
    ]);
    
    console.log(`✅ Created 1 admin, ${facultyUsers.length} faculty users, ${students3A.length + students3B.length} students\n`);

    // ==================== STEP 7: Mappings ====================
    console.log('🔗 Creating Subject-Faculty-Section Mappings...');
    const mappings = await Mapping.insertMany([
      // CSE-3A Mappings
      { sectionRef: sections[0]._id, subjectRef: subjects[0]._id, facultyRef: faculty[0]._id }, // Data Structures
      { sectionRef: sections[0]._id, subjectRef: subjects[1]._id, facultyRef: faculty[1]._id }, // DBMS
      { sectionRef: sections[0]._id, subjectRef: subjects[2]._id, facultyRef: faculty[2]._id }, // Networks
      { sectionRef: sections[0]._id, subjectRef: subjects[3]._id, facultyRef: faculty[3]._id }, // OS
      { sectionRef: sections[0]._id, subjectRef: subjects[4]._id, facultyRef: faculty[4]._id }, // Web Tech
      { sectionRef: sections[0]._id, subjectRef: subjects[6]._id, facultyRef: faculty[6]._id }, // DS Lab
      { sectionRef: sections[0]._id, subjectRef: subjects[7]._id, facultyRef: faculty[7]._id }, // DBMS Lab
      
      // CSE-3B Mappings
      { sectionRef: sections[1]._id, subjectRef: subjects[0]._id, facultyRef: faculty[0]._id },
      { sectionRef: sections[1]._id, subjectRef: subjects[1]._id, facultyRef: faculty[1]._id },
      { sectionRef: sections[1]._id, subjectRef: subjects[5]._id, facultyRef: faculty[5]._id }, // Software Engg
      { sectionRef: sections[1]._id, subjectRef: subjects[8]._id, facultyRef: faculty[6]._id }  // CN Lab
    ]);
    console.log(`✅ Created ${mappings.length} mappings\n`);

    // ==================== STEP 8: Timetables ====================
    console.log('📅 Creating Timetables...');
    
    // CSE-3A Timetable
    const timetable3A = await Timetable.create({
      sectionRef: sections[0]._id,
      version: 'v1.0',
      generatedAt: new Date(),
      isPublished: true,
      schedule: [
        // Monday
        { day: 'Monday', period: 1, startTime: '08:15', endTime: '09:05', subjectRef: subjects[0]._id, facultyRef: faculty[0]._id, roomRef: rooms[0]._id },
        { day: 'Monday', period: 2, startTime: '09:05', endTime: '09:55', subjectRef: subjects[1]._id, facultyRef: faculty[1]._id, roomRef: rooms[0]._id },
        { day: 'Monday', period: 3, startTime: '10:10', endTime: '11:00', subjectRef: subjects[2]._id, facultyRef: faculty[2]._id, roomRef: rooms[1]._id },
        { day: 'Monday', period: 4, startTime: '11:00', endTime: '11:50', subjectRef: subjects[3]._id, facultyRef: faculty[3]._id, roomRef: rooms[1]._id },
        
        // Tuesday
        { day: 'Tuesday', period: 1, startTime: '08:15', endTime: '09:05', subjectRef: subjects[4]._id, facultyRef: faculty[4]._id, roomRef: rooms[2]._id },
        { day: 'Tuesday', period: 2, startTime: '09:05', endTime: '09:55', subjectRef: subjects[0]._id, facultyRef: faculty[0]._id, roomRef: rooms[2]._id },
        { day: 'Tuesday', period: 3, startTime: '10:10', endTime: '11:00', subjectRef: subjects[6]._id, facultyRef: faculty[6]._id, roomRef: rooms[5]._id },
        { day: 'Tuesday', period: 4, startTime: '11:00', endTime: '11:50', subjectRef: subjects[6]._id, facultyRef: faculty[6]._id, roomRef: rooms[5]._id },
        
        // Wednesday
        { day: 'Wednesday', period: 1, startTime: '08:15', endTime: '09:05', subjectRef: subjects[1]._id, facultyRef: faculty[1]._id, roomRef: rooms[3]._id },
        { day: 'Wednesday', period: 2, startTime: '09:05', endTime: '09:55', subjectRef: subjects[2]._id, facultyRef: faculty[2]._id, roomRef: rooms[3]._id },
        { day: 'Wednesday', period: 3, startTime: '10:10', endTime: '11:00', subjectRef: subjects[7]._id, facultyRef: faculty[7]._id, roomRef: rooms[8]._id },
        { day: 'Wednesday', period: 4, startTime: '11:00', endTime: '11:50', subjectRef: subjects[7]._id, facultyRef: faculty[7]._id, roomRef: rooms[8]._id },
        
        // Thursday
        { day: 'Thursday', period: 1, startTime: '08:15', endTime: '09:05', subjectRef: subjects[3]._id, facultyRef: faculty[3]._id, roomRef: rooms[0]._id },
        { day: 'Thursday', period: 2, startTime: '09:05', endTime: '09:55', subjectRef: subjects[4]._id, facultyRef: faculty[4]._id, roomRef: rooms[0]._id },
        { day: 'Thursday', period: 3, startTime: '10:10', endTime: '11:00', subjectRef: subjects[0]._id, facultyRef: faculty[0]._id, roomRef: rooms[1]._id },
        
        // Friday
        { day: 'Friday', period: 1, startTime: '08:15', endTime: '09:05', subjectRef: subjects[1]._id, facultyRef: faculty[1]._id, roomRef: rooms[2]._id },
        { day: 'Friday', period: 2, startTime: '09:05', endTime: '09:55', subjectRef: subjects[2]._id, facultyRef: faculty[2]._id, roomRef: rooms[2]._id },
        { day: 'Friday', period: 3, startTime: '10:10', endTime: '11:00', subjectRef: subjects[3]._id, facultyRef: faculty[3]._id, roomRef: rooms[3]._id }
      ]
    });
    
    // CSE-3B Timetable
    const timetable3B = await Timetable.create({
      sectionRef: sections[1]._id,
      version: 'v1.0',
      generatedAt: new Date(),
      isPublished: true,
      schedule: [
        { day: 'Monday', period: 1, startTime: '08:15', endTime: '09:05', subjectRef: subjects[0]._id, facultyRef: faculty[0]._id, roomRef: rooms[10]._id },
        { day: 'Monday', period: 2, startTime: '09:05', endTime: '09:55', subjectRef: subjects[1]._id, facultyRef: faculty[1]._id, roomRef: rooms[10]._id },
        { day: 'Tuesday', period: 1, startTime: '08:15', endTime: '09:05', subjectRef: subjects[5]._id, facultyRef: faculty[5]._id, roomRef: rooms[11]._id },
        { day: 'Wednesday', period: 3, startTime: '10:10', endTime: '11:00', subjectRef: subjects[8]._id, facultyRef: faculty[6]._id, roomRef: rooms[7]._id },
        { day: 'Wednesday', period: 4, startTime: '11:00', endTime: '11:50', subjectRef: subjects[8]._id, facultyRef: faculty[6]._id, roomRef: rooms[7]._id }
      ]
    });
    
    console.log(`✅ Created timetables for ${sections.length} sections\n`);

    // ==================== STEP 9: Room Bookings ====================
    console.log('📝 Creating Room Bookings...');
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const bookings = await RoomBooking.insertMany([
      {
        roomId: rooms[4]._id, // Seminar Hall
        bookedBy: adminUser._id,
        title: 'Department Meeting',
        description: 'Monthly department review meeting',
        bookingType: 'meeting',
        startDate: today,
        endDate: today,
        startTime: '14:00',
        endTime: '16:00',
        days: ['Friday'],
        isRecurring: false,
        status: 'active'
      },
      {
        roomId: rooms[0]._id,
        bookedBy: facultyUsers[0]._id,
        title: 'Guest Lecture',
        description: 'Industry expert talk on AI',
        bookingType: 'event',
        startDate: nextWeek,
        endDate: nextWeek,
        startTime: '10:00',
        endTime: '12:00',
        days: ['Monday'],
        isRecurring: false,
        status: 'active'
      }
    ]);
    console.log(`✅ Created ${bookings.length} room bookings\n`);

    // ==================== STEP 10: Notifications ====================
    console.log('🔔 Creating Notifications...');
    const notifications = [];
    
    // Notifications for admin
    notifications.push(
      await Notification.create({
        userId: adminUser._id,
        title: 'System Initialized',
        message: 'Smart Campus system has been successfully initialized with all data',
        type: 'system_announcement',
        priority: 'high'
      })
    );
    
    // Notifications for students about timetable
    for (const student of students3A.slice(0, 3)) {
      notifications.push(
        await Notification.create({
          userId: student._id,
          title: 'Timetable Published',
          message: 'Your timetable for semester 5 has been published',
          type: 'timetable_published',
          priority: 'high',
          data: { timetableId: timetable3A._id, sectionName: 'CSE-3A' }
        })
      );
    }
    
    // Notification for faculty
    notifications.push(
      await Notification.create({
        userId: facultyUsers[0]._id,
        title: 'Room Booking Confirmed',
        message: 'Your booking for Guest Lecture has been confirmed',
        type: 'room_booking',
        priority: 'medium'
      })
    );
    
    console.log(`✅ Created ${notifications.length} notifications\n`);

    // ==================== STEP 11: Occupancy Records ====================
    console.log('📊 Creating Occupancy Records...');
    const occupancyRecords = await Occupancy.insertMany([
      {
        roomRef: rooms[0]._id,
        timestamp: new Date(today.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
        source: 'timetable',
        count: 58,
        sessionRef: timetable3A._id
      },
      {
        roomRef: rooms[5]._id,
        timestamp: new Date(today.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
        source: 'timetable',
        count: 40,
        sessionRef: timetable3A._id
      },
      {
        roomRef: rooms[2]._id,
        timestamp: new Date(),
        source: 'timetable',
        count: 60,
        sessionRef: timetable3B._id
      }
    ]);
    console.log(`✅ Created ${occupancyRecords.length} occupancy records\n`);

    // ==================== STEP 12: Attendance Records ====================
    console.log('✅ Creating Attendance Records...');
    const attendanceRecords = [];
    const sessionDate = new Date();
    
    // Create attendance for first session of CSE-3A
    const firstSession = timetable3A.schedule[0];
    for (const student of students3A.slice(0, 4)) {
      attendanceRecords.push({
        studentId: student._id,
        sessionId: `${firstSession.roomRef}-${firstSession.day}-${firstSession.period}-${sessionDate.toISOString().split('T')[0]}`,
        roomId: firstSession.roomRef,
        subjectId: firstSession.subjectRef,
        facultyId: firstSession.facultyRef,
        sectionId: sections[0]._id,
        day: firstSession.day,
        period: firstSession.period,
        date: sessionDate,
        checkInTime: new Date(sessionDate.getTime() + 10 * 60 * 1000), // 10 mins after start
        checkInMethod: 'qr_code',
        isLate: false,
        status: 'present'
      });
    }
    
    await Attendance.insertMany(attendanceRecords);
    console.log(`✅ Created ${attendanceRecords.length} attendance records\n`);

    // ==================== STEP 13: Audit Logs ====================
    console.log('📝 Creating Audit Logs...');
    const auditLogs = await AuditLog.insertMany([
      {
        adminId: adminUser._id,
        adminName: adminUser.name,
        timetableEntryId: timetable3A._id,
        changeType: 'auto_regeneration',
        reason: 'Initial timetable generation for CSE-3A',
        metadata: {
          sectionName: 'CSE-3A',
          affectedUsers: students3A.length
        }
      },
      {
        adminId: adminUser._id,
        adminName: adminUser.name,
        timetableEntryId: timetable3B._id,
        changeType: 'auto_regeneration',
        reason: 'Initial timetable generation for CSE-3B',
        metadata: {
          sectionName: 'CSE-3B',
          affectedUsers: students3B.length
        }
      },
      {
        adminId: adminUser._id,
        adminName: adminUser.name,
        changeType: 'manual_adjustment',
        oldRoomId: rooms[0]._id,
        oldRoomCode: rooms[0].code,
        oldRoomName: rooms[0].name,
        newRoomId: rooms[1]._id,
        newRoomCode: rooms[1].code,
        newRoomName: rooms[1].name,
        reason: 'Room change due to capacity requirements',
        metadata: {
          subjectName: subjects[0].name,
          facultyName: faculty[0].name,
          sectionName: 'CSE-3A'
        }
      }
    ]);
    console.log(`✅ Created ${auditLogs.length} audit logs\n`);

    // ==================== SUMMARY ====================
    console.log('\n' + '='.repeat(60));
    console.log('✅ COMPLETE DATABASE SEED SUCCESSFUL!');
    console.log('='.repeat(60) + '\n');
    
    console.log('📊 Summary:');
    console.log(`   ⏰ Period Config: 1 configuration with 7 periods`);
    console.log(`   🏢 Rooms: ${rooms.length} rooms (${rooms.filter(r => r.type === 'Classroom').length} classrooms, ${rooms.filter(r => r.type === 'Lab').length} labs)`);
    console.log(`   📚 Subjects: ${subjects.length} subjects (${subjects.filter(s => s.type === 'Theory').length} theory, ${subjects.filter(s => s.type === 'Lab').length} labs)`);
    console.log(`   👨‍🏫 Faculty: ${faculty.length} faculty members`);
    console.log(`   🎓 Sections: ${sections.length} sections`);
    console.log(`   👥 Users: 1 admin + ${facultyUsers.length} faculty + ${students3A.length + students3B.length} students = ${1 + facultyUsers.length + students3A.length + students3B.length} total`);
    console.log(`   🔗 Mappings: ${mappings.length} subject-faculty-section mappings`);
    console.log(`   📅 Timetables: ${sections.length} published timetables`);
    console.log(`   📝 Room Bookings: ${bookings.length} active bookings`);
    console.log(`   🔔 Notifications: ${notifications.length} notifications`);
    console.log(`   📊 Occupancy: ${occupancyRecords.length} occupancy records`);
    console.log(`   ✅ Attendance: ${attendanceRecords.length} attendance records`);
    console.log(`   📝 Audit Logs: ${auditLogs.length} audit entries`);
    
    console.log('\n📋 Login Credentials:');
    console.log('   👑 Admin:');
    console.log('      Email: admin@smartcampus.edu');
    console.log('      Password: admin123');
    console.log('\n   👨‍🏫 Faculty (all use password: faculty123):');
    console.log('      - rajesh@university.edu');
    console.log('      - priya@university.edu');
    console.log('      - amit@university.edu');
    console.log('      - sneha@university.edu');
    console.log('      - vikram@university.edu');
    console.log('      - anita@university.edu');
    console.log('\n   👨‍🎓 Students (all use password: student123):');
    console.log('      - student@smartcampus.edu');
    console.log('      - rahul.verma@student.edu');
    console.log('      - priya.gupta@student.edu');
    console.log('      - amit.shah@student.edu');
    console.log('      - And more...');
    
    console.log('\n🎯 All models populated with interconnected data!');
    console.log('🔗 All references properly linked - no orphan data!');
    console.log('✅ Ready for production use!\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seed Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

completeSeed();
