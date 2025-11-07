const upcomingClassesService = require('../services/upcomingClassesService');

// Get upcoming classes for a student
exports.getStudentUpcomingClasses = async (req, res) => {
  try {
    const studentId = req.user._id;
    const result = await upcomingClassesService.getStudentUpcomingClasses(studentId);
    
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error getting student upcoming classes:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get upcoming classes for a faculty member
exports.getFacultyUpcomingClasses = async (req, res) => {
  try {
    const facultyId = req.user._id;
    const result = await upcomingClassesService.getFacultyUpcomingClasses(facultyId);
    
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error getting faculty upcoming classes:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get next class for any user (student or faculty)
exports.getNextClass = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    
    let result;
    if (userRole === 'student') {
      result = await upcomingClassesService.getStudentUpcomingClasses(userId);
    } else if (userRole === 'faculty') {
      result = await upcomingClassesService.getFacultyUpcomingClasses(userId);
    } else {
      return res.status(403).json({ error: 'Access denied. Student or Faculty role required.' });
    }
    
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    
    // Return only the next class
    res.json({
      success: true,
      nextClass: result.nextClass,
      timeUntil: result.nextClass ? 
        upcomingClassesService.getTimeUntilClass(result.nextClass, upcomingClassesService.getCurrentTimeInfo()) : null
    });
  } catch (error) {
    console.error('Error getting next class:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get today's remaining classes
exports.getTodayRemainingClasses = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    
    let result;
    if (userRole === 'student') {
      result = await upcomingClassesService.getStudentUpcomingClasses(userId);
    } else if (userRole === 'faculty') {
      result = await upcomingClassesService.getFacultyUpcomingClasses(userId);
    } else {
      return res.status(403).json({ error: 'Access denied. Student or Faculty role required.' });
    }
    
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    
    // Add time until each class and status
    const timeInfo = upcomingClassesService.getCurrentTimeInfo();
    const remainingWithStatus = result.remainingToday.map(cls => ({
      ...cls,
      timeUntil: upcomingClassesService.getTimeUntilClass(cls, timeInfo),
      status: upcomingClassesService.getClassStatus(cls, timeInfo)
    }));
    
    res.json({
      success: true,
      remainingToday: remainingWithStatus,
      todayClasses: result.todayClasses,
      summary: result.summary
    });
  } catch (error) {
    console.error('Error getting today remaining classes:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get this week's upcoming classes
exports.getThisWeekClasses = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    
    let result;
    if (userRole === 'student') {
      result = await upcomingClassesService.getStudentUpcomingClasses(userId);
    } else if (userRole === 'faculty') {
      result = await upcomingClassesService.getFacultyUpcomingClasses(userId);
    } else {
      return res.status(403).json({ error: 'Access denied. Student or Faculty role required.' });
    }
    
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    
    // Group classes by day
    const classesByDay = {};
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    result.thisWeekClasses.forEach(cls => {
      if (!classesByDay[cls.day]) {
        classesByDay[cls.day] = [];
      }
      classesByDay[cls.day].push(cls);
    });
    
    res.json({
      success: true,
      thisWeekClasses: result.thisWeekClasses,
      classesByDay,
      summary: result.summary
    });
  } catch (error) {
    console.error('Error getting this week classes:', error);
    res.status(500).json({ error: error.message });
  }
};