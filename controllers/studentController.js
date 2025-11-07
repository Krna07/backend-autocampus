const User = require('../models/User');
const Section = require('../models/Section');
const Timetable = require('../models/Timetable');
const AdminTimetable = require('../models/AdminTimetable');
const Attendance = require('../models/Attendance');

// Get student's dashboard data
exports.getStudentDashboard = async (req, res) => {
  try {
    const studentId = req.user._id;
    const student = await User.findById(studentId)
      .populate('sectionRef')
      .select('-passwordHash');

    if (!student || student.role !== 'student') {
      return res.status(403).json({ error: 'Access denied. Student role required.' });
    }

    if (!student.sectionRef) {
      return res.status(400).json({ 
        error: 'No section assigned',
        message: 'Please contact administration to assign you to a section.'
      });
    }

    // Get section's timetable
    const sectionData = await student.getSectionWithTimetable();
    
    // Get upcoming classes using the service
    const upcomingClassesService = require('../services/upcomingClassesService');
    const upcomingClasses = await upcomingClassesService.getStudentUpcomingClasses(studentId);
    
    // Get recent attendance
    const recentAttendance = await getRecentAttendance(studentId);

    // Get announcements/notifications
    const announcements = await getStudentAnnouncements(student.sectionRef._id);

    res.json({
      success: true,
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        regNumber: student.regNumber,
        rollNumber: student.rollNumber,
        section: student.sectionRef,
        profile: student.profile,
        lastLogin: student.lastLogin
      },
      section: sectionData?.section,
      timetable: sectionData?.timetable,
      upcomingClasses: upcomingClasses.success ? upcomingClasses : null,
      recentAttendance,
      announcements
    });
  } catch (error) {
    console.error('Error fetching student dashboard:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get student's complete timetable
exports.getStudentTimetable = async (req, res) => {
  try {
    const studentId = req.user._id;
    const student = await User.findById(studentId).populate('sectionRef');

    if (!student || student.role !== 'student') {
      return res.status(403).json({ error: 'Access denied. Student role required.' });
    }

    if (!student.sectionRef) {
      return res.status(400).json({ 
        error: 'No section assigned',
        message: 'Please contact administration to assign you to a section.'
      });
    }

    // Get section's published timetable
    const timetable = await Timetable.findOne({
      sectionRef: student.sectionRef._id,
      isPublished: true
    })
    .populate('sectionRef')
    .populate('schedule.subjectRef')
    .populate('schedule.facultyRef')
    .populate('schedule.roomRef')
    .sort({ generatedAt: -1 });

    if (!timetable) {
      return res.status(404).json({ 
        error: 'No timetable found',
        message: 'Timetable has not been published for your section yet.'
      });
    }

    res.json({
      success: true,
      timetable,
      section: student.sectionRef
    });
  } catch (error) {
    console.error('Error fetching student timetable:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get student's profile
exports.getStudentProfile = async (req, res) => {
  try {
    const studentId = req.user._id;
    const student = await User.findById(studentId)
      .populate('sectionRef')
      .select('-passwordHash');

    if (!student || student.role !== 'student') {
      return res.status(403).json({ error: 'Access denied. Student role required.' });
    }

    res.json({
      success: true,
      profile: student
    });
  } catch (error) {
    console.error('Error fetching student profile:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update student's profile
exports.updateStudentProfile = async (req, res) => {
  try {
    const studentId = req.user._id;
    const updates = req.body;

    // Remove sensitive fields that shouldn't be updated by student
    delete updates.role;
    delete updates.sectionRef;
    delete updates.regNumber;
    delete updates.email;
    delete updates.passwordHash;

    const student = await User.findByIdAndUpdate(
      studentId,
      { $set: updates },
      { new: true, runValidators: true }
    )
    .populate('sectionRef')
    .select('-passwordHash');

    if (!student || student.role !== 'student') {
      return res.status(403).json({ error: 'Access denied. Student role required.' });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: student
    });
  } catch (error) {
    console.error('Error updating student profile:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get student's attendance summary
exports.getAttendanceSummary = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { startDate, endDate, subjectId } = req.query;

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(403).json({ error: 'Access denied. Student role required.' });
    }

    const query = { studentId };
    
    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default to current month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      query.date = { $gte: startOfMonth, $lte: endOfMonth };
    }
    
    if (subjectId) {
      query.subjectId = subjectId;
    }

    const attendanceRecords = await Attendance.find(query)
      .populate('roomId', 'code name')
      .populate('subjectId', 'name')
      .populate('facultyId', 'name')
      .sort({ date: -1, period: 1 });

    // Calculate statistics
    const stats = {
      totalClasses: attendanceRecords.length,
      presentCount: attendanceRecords.filter(a => a.status === 'present').length,
      lateCount: attendanceRecords.filter(a => a.status === 'late').length,
      absentCount: attendanceRecords.filter(a => a.status === 'absent').length
    };

    stats.attendanceRate = stats.totalClasses > 0 ? 
      (((stats.presentCount + stats.lateCount) / stats.totalClasses) * 100).toFixed(1) : 0;

    // Subject-wise breakdown
    const subjectStats = {};
    attendanceRecords.forEach(record => {
      const subjectName = record.subjectId?.name || 'Unknown';
      if (!subjectStats[subjectName]) {
        subjectStats[subjectName] = {
          total: 0,
          present: 0,
          late: 0,
          absent: 0
        };
      }
      subjectStats[subjectName].total++;
      subjectStats[subjectName][record.status]++;
    });

    // Calculate subject-wise attendance rates
    Object.keys(subjectStats).forEach(subject => {
      const data = subjectStats[subject];
      data.attendanceRate = ((data.present + data.late) / data.total * 100).toFixed(1);
    });

    res.json({
      success: true,
      attendance: attendanceRecords,
      stats,
      subjectStats
    });
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({ error: error.message });
  }
};

// Helper function to get today's classes
async function getTodayClasses(sectionId) {
  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    
    // Try to get from AdminTimetable first (more current)
    const adminTimetable = await AdminTimetable.findOne({ isActive: true });
    if (adminTimetable) {
      const todayClasses = [];
      
      for (const [key, value] of adminTimetable.timetableData) {
        const [day, period] = key.split('-');
        if (day === today && value.subject && value.teacher && value.classroom) {
          const [subject, teacher, room] = await Promise.all([
            require('../models/Subject').findById(value.subject),
            require('../models/Faculty').findById(value.teacher),
            require('../models/Room').findById(value.classroom)
          ]);
          
          todayClasses.push({
            period: parseInt(period),
            day: day,
            subject: subject,
            faculty: teacher,
            room: room,
            startTime: getPeriodTime(parseInt(period)).start,
            endTime: getPeriodTime(parseInt(period)).end
          });
        }
      }
      
      return todayClasses.sort((a, b) => a.period - b.period);
    }
    
    // Fallback to regular timetable
    const timetable = await Timetable.findOne({
      sectionRef: sectionId,
      isPublished: true
    })
    .populate('schedule.subjectRef')
    .populate('schedule.facultyRef')
    .populate('schedule.roomRef')
    .sort({ generatedAt: -1 });

    if (!timetable) return [];

    return timetable.schedule
      .filter(session => session.day === today)
      .sort((a, b) => a.period - b.period);
  } catch (error) {
    console.error('Error getting today classes:', error);
    return [];
  }
}

// Helper function to get recent attendance
async function getRecentAttendance(studentId) {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    return await Attendance.find({
      studentId: studentId,
      date: { $gte: oneWeekAgo }
    })
    .populate('subjectId', 'name')
    .populate('roomId', 'code')
    .sort({ date: -1, period: -1 })
    .limit(10);
  } catch (error) {
    console.error('Error getting recent attendance:', error);
    return [];
  }
}

// Helper function to get next class
function getNextClass(timetable) {
  if (!timetable || !timetable.schedule) return null;

  const now = new Date();
  const currentDay = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][(now.getDay() + 6) % 7];
  const currentTime = now.getHours() * 100 + now.getMinutes();

  const upcoming = timetable.schedule
    .filter(s => {
      const dayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(s.day);
      const currentDayIndex = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(currentDay);
      
      if (dayIndex > currentDayIndex) return true;
      if (dayIndex === currentDayIndex) {
        const [hours, minutes] = s.startTime.split(':').map(Number);
        const sessionTime = hours * 100 + minutes;
        return sessionTime > currentTime;
      }
      return false;
    })
    .sort((a, b) => {
      const dayA = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(a.day);
      const dayB = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(b.day);
      if (dayA !== dayB) return dayA - dayB;
      return a.period - b.period;
    })[0];

  return upcoming;
}

// Helper function to get student announcements
async function getStudentAnnouncements(sectionId) {
  // This would integrate with a notifications/announcements system
  // For now, return empty array
  return [];
}

// Helper function to get period timing
function getPeriodTime(period) {
  const timeSlots = {
    1: { start: '08:00', end: '08:50' },
    2: { start: '09:00', end: '09:50' },
    3: { start: '10:10', end: '10:30' }, // Break
    4: { start: '10:30', end: '11:20' },
    5: { start: '12:40', end: '13:40' }, // Lunch
    6: { start: '13:40', end: '14:30' },
    7: { start: '14:30', end: '15:20' },
    8: { start: '15:30', end: '16:20' }
  };
  return timeSlots[period] || { start: '00:00', end: '00:00' };
}