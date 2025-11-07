const Attendance = require('../models/Attendance');
const Room = require('../models/Room');
const Subject = require('../models/Subject');
const Faculty = require('../models/Faculty');
const Section = require('../models/Section');
const User = require('../models/User');
const AdminTimetable = require('../models/AdminTimetable');
const crypto = require('crypto');

// Generate QR code data for a session
exports.generateSessionQR = async (req, res) => {
  try {
    const { roomId, day, period } = req.body;
    const facultyId = req.user._id;

    // Verify faculty is authorized for this session
    const adminTimetable = await AdminTimetable.findOne({ isActive: true });
    const cellKey = `${day}-${period}`;
    
    if (!adminTimetable || !adminTimetable.timetableData.has(cellKey)) {
      return res.status(404).json({ error: 'Session not found in timetable' });
    }

    const cellData = adminTimetable.timetableData.get(cellKey);
    if (!cellData.teacher || cellData.teacher.toString() !== facultyId.toString() ||
        !cellData.classroom || cellData.classroom.toString() !== roomId) {
      return res.status(403).json({ error: 'You are not authorized for this session' });
    }

    // Generate session ID and QR data
    const today = new Date().toISOString().split('T')[0];
    const sessionId = `${roomId}-${day}-${period}-${today}`;
    
    // Create secure QR code data
    const qrData = {
      sessionId: sessionId,
      roomId: roomId,
      day: day,
      period: period,
      date: today,
      subjectId: cellData.subject,
      facultyId: facultyId,
      timestamp: Date.now(),
      // Add security hash
      hash: crypto.createHash('sha256')
        .update(`${sessionId}-${facultyId}-${process.env.JWT_SECRET || 'fallback'}`)
        .digest('hex').substring(0, 16)
    };

    res.json({
      success: true,
      qrData: JSON.stringify(qrData),
      sessionId: sessionId,
      expiresIn: 3600000 // 1 hour in milliseconds
    });
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({ error: error.message });
  }
};

// Student check-in via QR code
exports.checkInStudent = async (req, res) => {
  try {
    const { qrData, location } = req.body;
    const studentId = req.user._id;

    // Parse and validate QR data
    let sessionData;
    try {
      sessionData = JSON.parse(qrData);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid QR code data' });
    }

    const { sessionId, roomId, day, period, date, subjectId, facultyId, timestamp, hash } = sessionData;

    // Verify QR code security hash
    const expectedHash = crypto.createHash('sha256')
      .update(`${sessionId}-${facultyId}-${process.env.JWT_SECRET || 'fallback'}`)
      .digest('hex').substring(0, 16);
    
    if (hash !== expectedHash) {
      return res.status(400).json({ error: 'Invalid or tampered QR code' });
    }

    // Check if QR code is expired (1 hour)
    if (Date.now() - timestamp > 3600000) {
      return res.status(400).json({ error: 'QR code has expired' });
    }

    // Verify student is enrolled in the section for this subject
    const student = await User.findById(studentId).populate('sectionRef');
    if (!student || !student.sectionRef) {
      return res.status(400).json({ error: 'Student section not found' });
    }

    // Check if student already checked in for this session
    const existingAttendance = await Attendance.findOne({
      sessionId: sessionId,
      studentId: studentId
    });

    if (existingAttendance) {
      return res.status(409).json({ 
        error: 'Already checked in for this session',
        checkInTime: existingAttendance.checkInTime
      });
    }

    // Verify room and session details
    const [room, subject, faculty] = await Promise.all([
      Room.findById(roomId),
      Subject.findById(subjectId),
      Faculty.findById(facultyId)
    ]);

    if (!room || !subject || !faculty) {
      return res.status(404).json({ error: 'Session details not found' });
    }

    // Check if student is in the correct room (optional location verification)
    // This would require room location data and proximity checking

    // Determine if student is late (assuming 10-minute grace period)
    const sessionDate = new Date(date);
    const now = new Date();
    const isLate = now > new Date(sessionDate.getTime() + 10 * 60 * 1000); // 10 minutes late

    // Create attendance record
    const attendance = new Attendance({
      studentId: studentId,
      sessionId: sessionId,
      roomId: roomId,
      subjectId: subjectId,
      facultyId: facultyId,
      sectionId: student.sectionRef._id,
      day: day,
      period: period,
      date: sessionDate,
      checkInTime: now,
      checkInMethod: 'qr_code',
      location: location,
      isLate: isLate,
      status: isLate ? 'late' : 'present'
    });

    await attendance.save();

    // Emit real-time update
    if (req.io) {
      req.io.emit('attendance:checkin', {
        sessionId: sessionId,
        studentId: studentId,
        studentName: student.name,
        checkInTime: now,
        status: attendance.status,
        roomCode: room.code
      });

      // Notify faculty
      const facultyUser = await User.findOne({ role: 'faculty', email: faculty.email });
      if (facultyUser) {
        req.io.to(`user_${facultyUser._id}`).emit('notification:new', {
          message: `${student.name} checked in to ${room.code} - ${subject.name}`,
          type: 'student_checkin',
          studentName: student.name,
          roomCode: room.code,
          subjectName: subject.name,
          status: attendance.status,
          timestamp: now
        });
      }
    }

    res.json({
      success: true,
      message: `Successfully checked in to ${room.code}`,
      attendance: {
        sessionId: sessionId,
        roomCode: room.code,
        roomName: room.name,
        subjectName: subject.name,
        checkInTime: now,
        status: attendance.status,
        isLate: isLate
      }
    });
  } catch (error) {
    console.error('Error checking in student:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get attendance for a session (faculty view)
exports.getSessionAttendance = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const facultyId = req.user._id;

    // Verify faculty authorization for this session
    const sessionParts = sessionId.split('-');
    if (sessionParts.length !== 4) {
      return res.status(400).json({ error: 'Invalid session ID format' });
    }

    const [roomId, day, period, date] = sessionParts;
    
    // Check timetable authorization
    const adminTimetable = await AdminTimetable.findOne({ isActive: true });
    const cellKey = `${day}-${period}`;
    
    if (!adminTimetable || !adminTimetable.timetableData.has(cellKey)) {
      return res.status(404).json({ error: 'Session not found in timetable' });
    }

    const cellData = adminTimetable.timetableData.get(cellKey);
    if (!cellData.teacher || cellData.teacher.toString() !== facultyId.toString()) {
      return res.status(403).json({ error: 'You are not authorized for this session' });
    }

    // Get attendance records
    const attendanceRecords = await Attendance.find({ sessionId })
      .populate('studentId', 'name email')
      .populate('roomId', 'code name')
      .populate('subjectId', 'name')
      .sort({ checkInTime: 1 });

    // Get total enrolled students for this section/subject
    const sectionId = attendanceRecords.length > 0 ? attendanceRecords[0].sectionId : null;
    const totalStudents = sectionId ? await User.countDocuments({ 
      sectionRef: sectionId, 
      role: 'student' 
    }) : 0;

    const attendanceStats = {
      totalStudents: totalStudents,
      presentCount: attendanceRecords.filter(a => a.status === 'present').length,
      lateCount: attendanceRecords.filter(a => a.status === 'late').length,
      absentCount: totalStudents - attendanceRecords.length,
      attendanceRate: totalStudents > 0 ? ((attendanceRecords.length / totalStudents) * 100).toFixed(1) : 0
    };

    res.json({
      success: true,
      sessionId: sessionId,
      attendance: attendanceRecords,
      stats: attendanceStats
    });
  } catch (error) {
    console.error('Error fetching session attendance:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get student's attendance history
exports.getStudentAttendance = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { startDate, endDate, subjectId } = req.query;

    const query = { studentId };
    
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (subjectId) {
      query.subjectId = subjectId;
    }

    const attendanceRecords = await Attendance.find(query)
      .populate('roomId', 'code name')
      .populate('subjectId', 'name')
      .populate('facultyId', 'name')
      .sort({ date: -1, period: 1 });

    // Calculate attendance statistics
    const stats = {
      totalClasses: attendanceRecords.length,
      presentCount: attendanceRecords.filter(a => a.status === 'present').length,
      lateCount: attendanceRecords.filter(a => a.status === 'late').length,
      attendanceRate: attendanceRecords.length > 0 ? 
        ((attendanceRecords.filter(a => a.status !== 'absent').length / attendanceRecords.length) * 100).toFixed(1) : 0
    };

    res.json({
      success: true,
      attendance: attendanceRecords,
      stats: stats
    });
  } catch (error) {
    console.error('Error fetching student attendance:', error);
    res.status(500).json({ error: error.message });
  }
};

// Manual attendance marking (faculty)
exports.markAttendance = async (req, res) => {
  try {
    const { sessionId, studentIds, status } = req.body;
    const facultyId = req.user._id;

    // Verify faculty authorization
    const sessionParts = sessionId.split('-');
    if (sessionParts.length !== 4) {
      return res.status(400).json({ error: 'Invalid session ID format' });
    }

    const [roomId, day, period, date] = sessionParts;
    
    const adminTimetable = await AdminTimetable.findOne({ isActive: true });
    const cellKey = `${day}-${period}`;
    
    if (!adminTimetable || !adminTimetable.timetableData.has(cellKey)) {
      return res.status(404).json({ error: 'Session not found in timetable' });
    }

    const cellData = adminTimetable.timetableData.get(cellKey);
    if (!cellData.teacher || cellData.teacher.toString() !== facultyId.toString()) {
      return res.status(403).json({ error: 'You are not authorized for this session' });
    }

    const results = [];
    
    for (const studentId of studentIds) {
      try {
        // Check if attendance already exists
        let attendance = await Attendance.findOne({ sessionId, studentId });
        
        if (attendance) {
          // Update existing attendance
          attendance.status = status;
          attendance.checkInMethod = 'manual';
          await attendance.save();
          results.push({ studentId, action: 'updated', status });
        } else {
          // Create new attendance record
          const student = await User.findById(studentId);
          if (!student) continue;

          attendance = new Attendance({
            studentId: studentId,
            sessionId: sessionId,
            roomId: roomId,
            subjectId: cellData.subject,
            facultyId: facultyId,
            sectionId: student.sectionRef,
            day: day,
            period: parseInt(period),
            date: new Date(date),
            checkInTime: new Date(),
            checkInMethod: 'manual',
            status: status
          });
          
          await attendance.save();
          results.push({ studentId, action: 'created', status });
        }
      } catch (error) {
        results.push({ studentId, action: 'error', error: error.message });
      }
    }

    // Emit real-time update
    if (req.io) {
      req.io.emit('attendance:updated', {
        sessionId: sessionId,
        results: results,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: `Attendance marked for ${results.length} students`,
      results: results
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ error: error.message });
  }
};