const AdminTimetable = require('../models/AdminTimetable');
const Timetable = require('../models/Timetable');
const Subject = require('../models/Subject');
const Faculty = require('../models/Faculty');
const Room = require('../models/Room');
const Section = require('../models/Section');
const User = require('../models/User');

class UpcomingClassesService {
  
  // Get period time slots
  getPeriodTimeSlots() {
    return {
      1: { start: '08:00', end: '08:50' },
      2: { start: '09:00', end: '09:50' },
      3: { start: '10:10', end: '10:30' }, // Break
      4: { start: '10:30', end: '11:20' },
      5: { start: '12:40', end: '13:40' }, // Lunch
      6: { start: '13:40', end: '14:30' },
      7: { start: '14:30', end: '15:20' },
      8: { start: '15:30', end: '16:20' }
    };
  }

  // Convert time string to minutes for comparison
  timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Get current day and time info
  getCurrentTimeInfo() {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[now.getDay()];
    const currentTime = now.getHours() * 60 + now.getMinutes(); // in minutes
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    return {
      currentDay,
      currentTime,
      currentHour,
      currentMinute,
      now
    };
  }

  // Get upcoming classes for a student
  async getStudentUpcomingClasses(studentId) {
    try {
      const student = await User.findById(studentId).populate('sectionRef');
      if (!student || student.role !== 'student' || !student.sectionRef) {
        return { error: 'Student not found or not assigned to section' };
      }

      const sectionId = student.sectionRef._id;
      const timeInfo = this.getCurrentTimeInfo();
      
      // Get classes from AdminTimetable (most current)
      const adminClasses = await this.getClassesFromAdminTimetable(sectionId);
      
      // If no admin timetable, fallback to regular timetable
      let allClasses = adminClasses;
      if (allClasses.length === 0) {
        allClasses = await this.getClassesFromRegularTimetable(sectionId);
      }

      // Filter and organize classes
      const result = this.organizeUpcomingClasses(allClasses, timeInfo);
      
      return {
        success: true,
        student: {
          name: student.name,
          regNumber: student.regNumber,
          section: student.sectionRef.name
        },
        ...result
      };
    } catch (error) {
      console.error('Error getting student upcoming classes:', error);
      return { error: error.message };
    }
  }

  // Get upcoming classes for a faculty member
  async getFacultyUpcomingClasses(facultyId) {
    try {
      const user = await User.findById(facultyId);
      if (!user || user.role !== 'faculty') {
        return { error: 'Faculty not found' };
      }

      // Find faculty record by email
      const faculty = await Faculty.findOne({ email: user.email });
      if (!faculty) {
        return { error: 'Faculty record not found' };
      }

      const timeInfo = this.getCurrentTimeInfo();
      
      // Get all classes where this faculty is assigned
      const allClasses = await this.getFacultyClassesFromAdminTimetable(faculty._id);
      
      // If no admin timetable classes, check regular timetables
      if (allClasses.length === 0) {
        const regularClasses = await this.getFacultyClassesFromRegularTimetable(faculty._id);
        allClasses.push(...regularClasses);
      }

      // Filter and organize classes
      const result = this.organizeUpcomingClasses(allClasses, timeInfo);
      
      return {
        success: true,
        faculty: {
          name: faculty.name,
          email: faculty.email,
          department: faculty.department
        },
        ...result
      };
    } catch (error) {
      console.error('Error getting faculty upcoming classes:', error);
      return { error: error.message };
    }
  }

  // Get classes from AdminTimetable for a section
  async getClassesFromAdminTimetable(sectionId) {
    try {
      const adminTimetable = await AdminTimetable.findOne({ isActive: true });
      if (!adminTimetable) return [];

      const classes = [];
      const timeSlots = this.getPeriodTimeSlots();

      for (const [key, value] of adminTimetable.timetableData) {
        if (!value.subject || !value.teacher || !value.classroom) continue;

        const [day, period] = key.split('-');
        const periodNum = parseInt(period);
        
        // Skip break and lunch periods
        if (periodNum === 3 || periodNum === 5) continue;

        try {
          const [subject, teacher, room, section] = await Promise.all([
            Subject.findById(value.subject),
            Faculty.findById(value.teacher),
            Room.findById(value.classroom),
            Section.findById(sectionId)
          ]);

          // Check if this class belongs to the requested section
          // We need to match by some criteria - for now, we'll include all classes
          // In a real system, you'd have section-specific timetables
          
          if (subject && teacher && room) {
            classes.push({
              day,
              period: periodNum,
              startTime: timeSlots[periodNum]?.start || '00:00',
              endTime: timeSlots[periodNum]?.end || '00:00',
              subject: {
                _id: subject._id,
                name: subject.name,
                code: subject.code
              },
              faculty: {
                _id: teacher._id,
                name: teacher.name,
                email: teacher.email
              },
              room: {
                _id: room._id,
                code: room.code,
                name: room.name,
                building: room.building,
                floor: room.floor
              },
              section: section ? {
                _id: section._id,
                name: section.name
              } : null
            });
          }
        } catch (error) {
          console.error('Error processing timetable entry:', error);
        }
      }

      return classes;
    } catch (error) {
      console.error('Error getting classes from admin timetable:', error);
      return [];
    }
  }

  // Get classes from regular Timetable for a section
  async getClassesFromRegularTimetable(sectionId) {
    try {
      const timetable = await Timetable.findOne({
        sectionRef: sectionId,
        isPublished: true
      })
      .populate('schedule.subjectRef')
      .populate('schedule.facultyRef')
      .populate('schedule.roomRef')
      .populate('sectionRef')
      .sort({ generatedAt: -1 });

      if (!timetable) return [];

      return timetable.schedule.map(session => ({
        day: session.day,
        period: session.period,
        startTime: session.startTime,
        endTime: session.endTime,
        subject: session.subjectRef ? {
          _id: session.subjectRef._id,
          name: session.subjectRef.name,
          code: session.subjectRef.code
        } : null,
        faculty: session.facultyRef ? {
          _id: session.facultyRef._id,
          name: session.facultyRef.name,
          email: session.facultyRef.email
        } : null,
        room: session.roomRef ? {
          _id: session.roomRef._id,
          code: session.roomRef.code,
          name: session.roomRef.name,
          building: session.roomRef.building,
          floor: session.roomRef.floor
        } : null,
        section: timetable.sectionRef ? {
          _id: timetable.sectionRef._id,
          name: timetable.sectionRef.name
        } : null
      }));
    } catch (error) {
      console.error('Error getting classes from regular timetable:', error);
      return [];
    }
  }

  // Get faculty classes from AdminTimetable
  async getFacultyClassesFromAdminTimetable(facultyId) {
    try {
      const adminTimetable = await AdminTimetable.findOne({ isActive: true });
      if (!adminTimetable) return [];

      const classes = [];
      const timeSlots = this.getPeriodTimeSlots();

      for (const [key, value] of adminTimetable.timetableData) {
        if (!value.teacher || value.teacher.toString() !== facultyId.toString()) continue;
        if (!value.subject || !value.classroom) continue;

        const [day, period] = key.split('-');
        const periodNum = parseInt(period);
        
        // Skip break and lunch periods
        if (periodNum === 3 || periodNum === 5) continue;

        try {
          const [subject, room] = await Promise.all([
            Subject.findById(value.subject),
            Room.findById(value.classroom)
          ]);

          if (subject && room) {
            classes.push({
              day,
              period: periodNum,
              startTime: timeSlots[periodNum]?.start || '00:00',
              endTime: timeSlots[periodNum]?.end || '00:00',
              subject: {
                _id: subject._id,
                name: subject.name,
                code: subject.code
              },
              room: {
                _id: room._id,
                code: room.code,
                name: room.name,
                building: room.building,
                floor: room.floor
              }
            });
          }
        } catch (error) {
          console.error('Error processing faculty timetable entry:', error);
        }
      }

      return classes;
    } catch (error) {
      console.error('Error getting faculty classes from admin timetable:', error);
      return [];
    }
  }

  // Get faculty classes from regular timetables
  async getFacultyClassesFromRegularTimetable(facultyId) {
    try {
      const timetables = await Timetable.find({ isPublished: true })
        .populate('schedule.subjectRef')
        .populate('schedule.facultyRef')
        .populate('schedule.roomRef')
        .populate('sectionRef');

      const classes = [];

      timetables.forEach(timetable => {
        timetable.schedule.forEach(session => {
          if (session.facultyRef && session.facultyRef._id.toString() === facultyId.toString()) {
            classes.push({
              day: session.day,
              period: session.period,
              startTime: session.startTime,
              endTime: session.endTime,
              subject: session.subjectRef ? {
                _id: session.subjectRef._id,
                name: session.subjectRef.name,
                code: session.subjectRef.code
              } : null,
              room: session.roomRef ? {
                _id: session.roomRef._id,
                code: session.roomRef.code,
                name: session.roomRef.name,
                building: session.roomRef.building,
                floor: session.roomRef.floor
              } : null,
              section: timetable.sectionRef ? {
                _id: timetable.sectionRef._id,
                name: timetable.sectionRef.name
              } : null
            });
          }
        });
      });

      return classes;
    } catch (error) {
      console.error('Error getting faculty classes from regular timetables:', error);
      return [];
    }
  }

  // Organize classes into upcoming categories
  organizeUpcomingClasses(allClasses, timeInfo) {
    const { currentDay, currentTime } = timeInfo;
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const currentDayIndex = days.indexOf(currentDay);

    // Filter out invalid classes
    const validClasses = allClasses.filter(cls => 
      cls && cls.day && cls.period && cls.startTime && cls.subject
    );

    // Get today's classes
    const todayClasses = validClasses
      .filter(cls => cls.day === currentDay)
      .sort((a, b) => a.period - b.period);

    // Get remaining classes today
    const remainingToday = todayClasses.filter(cls => {
      const classStartTime = this.timeToMinutes(cls.startTime);
      return classStartTime > currentTime;
    });

    // Get next class (next upcoming class from any day)
    let nextClass = null;
    
    // First check remaining classes today
    if (remainingToday.length > 0) {
      nextClass = remainingToday[0];
    } else {
      // Look for classes in upcoming days
      for (let i = 1; i <= 7; i++) {
        const dayIndex = (currentDayIndex + i) % 7;
        const dayName = days[dayIndex];
        
        const dayClasses = validClasses
          .filter(cls => cls.day === dayName)
          .sort((a, b) => a.period - b.period);
        
        if (dayClasses.length > 0) {
          nextClass = dayClasses[0];
          break;
        }
      }
    }

    // Get this week's classes (next 7 days)
    const thisWeekClasses = [];
    for (let i = 0; i < 7; i++) {
      const dayIndex = (currentDayIndex + i) % 7;
      const dayName = days[dayIndex];
      
      let dayClasses = validClasses
        .filter(cls => cls.day === dayName)
        .sort((a, b) => a.period - b.period);

      // For today, only include remaining classes
      if (i === 0) {
        dayClasses = dayClasses.filter(cls => {
          const classStartTime = this.timeToMinutes(cls.startTime);
          return classStartTime > currentTime;
        });
      }

      dayClasses.forEach(cls => {
        thisWeekClasses.push({
          ...cls,
          dayIndex: i,
          isToday: i === 0,
          isTomorrow: i === 1
        });
      });
    }

    // Sort this week's classes by day and period
    thisWeekClasses.sort((a, b) => {
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      return a.period - b.period;
    });

    return {
      nextClass,
      todayClasses,
      remainingToday,
      thisWeekClasses: thisWeekClasses.slice(0, 10), // Limit to next 10 classes
      summary: {
        totalTodayClasses: todayClasses.length,
        remainingTodayClasses: remainingToday.length,
        upcomingThisWeek: thisWeekClasses.length
      }
    };
  }

  // Get class status (upcoming, current, completed)
  getClassStatus(classItem, timeInfo) {
    const { currentTime } = timeInfo;
    const classStartTime = this.timeToMinutes(classItem.startTime);
    const classEndTime = this.timeToMinutes(classItem.endTime);

    if (currentTime < classStartTime) {
      return 'upcoming';
    } else if (currentTime >= classStartTime && currentTime <= classEndTime) {
      return 'current';
    } else {
      return 'completed';
    }
  }

  // Get time until class starts
  getTimeUntilClass(classItem, timeInfo) {
    const { currentTime } = timeInfo;
    const classStartTime = this.timeToMinutes(classItem.startTime);
    
    if (classStartTime <= currentTime) {
      return null; // Class has started or ended
    }

    const minutesUntil = classStartTime - currentTime;
    
    if (minutesUntil < 60) {
      return `${minutesUntil} minutes`;
    } else {
      const hours = Math.floor(minutesUntil / 60);
      const minutes = minutesUntil % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  }
}

module.exports = new UpcomingClassesService();