const Timetable = require('../models/Timetable');
const Section = require('../models/Section');
const schedulerService = require('../services/schedulerService');
const enhancedSchedulerService = require('../services/enhancedSchedulerService');
const notificationService = require('../services/notificationService');

// Check if data is sufficient for timetable generation
exports.checkDataSufficiency = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const Mapping = require('../models/Mapping');
    const Subject = require('../models/Subject');
    const Faculty = require('../models/Faculty');
    const Room = require('../models/Room');
    const Section = require('../models/Section');

    const dataStatus = {
      sufficient: true,
      missing: []
    };

    // Check section exists
    const section = await Section.findById(sectionId);
    if (!section) {
      dataStatus.sufficient = false;
      dataStatus.missing.push('Section not found');
      return res.json(dataStatus);
    }

    // Check mappings
    const mappings = await Mapping.find({ sectionRef: sectionId })
      .populate('subjectRef')
      .populate('facultyRef');
    
    if (mappings.length === 0) {
      dataStatus.sufficient = false;
      dataStatus.missing.push('No subject-faculty mappings found for this section');
    }

    // Check subjects
    const subjects = await Subject.find();
    if (subjects.length === 0) {
      dataStatus.sufficient = false;
      dataStatus.missing.push('No subjects found in the system');
    }

    // Check faculty
    const faculty = await Faculty.find();
    if (faculty.length === 0) {
      dataStatus.sufficient = false;
      dataStatus.missing.push('No faculty members found in the system');
    }

    // Check rooms
    const rooms = await Room.find({ status: 'active' });
    if (rooms.length === 0) {
      dataStatus.sufficient = false;
      dataStatus.missing.push('No active rooms found in the system');
    }

    // Check if mappings have valid subjects and faculty
    if (mappings.length > 0) {
      const invalidMappings = mappings.filter(m => !m.subjectRef || !m.facultyRef);
      if (invalidMappings.length > 0) {
        dataStatus.sufficient = false;
        dataStatus.missing.push(`${invalidMappings.length} mapping(s) have invalid subject or faculty references`);
      }
    }

    res.json(dataStatus);
  } catch (error) {
    console.error('Error checking data sufficiency:', error);
    res.status(500).json({ 
      sufficient: false,
      missing: ['Error checking data sufficiency'],
      error: error.message
    });
  }
};

exports.generateTimetable = async (req, res) => {
  try {
    // Set a longer timeout for this endpoint
    req.setTimeout(120000); // 2 minutes
    
    const { sectionId } = req.body;
    const adminId = req.user._id;
    
    // Send a response header to keep connection alive
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Content-Type', 'application/json');

    const result = await schedulerService.generateTimetable(sectionId, adminId);

    // Notify faculty with generated schedules (async, don't wait)
    setImmediate(async () => {
      try {
        await notificationService.notifyFacultySchedulesOnGenerate(result.timetable, req.io);
      } catch (err) {
        console.error('Error sending notifications:', err);
      }
    });

    res.json(result);
  } catch (error) {
    console.error('Error in generateTimetable:', error);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

exports.generateAllTimetables = async (req, res) => {
  try {
    // Set a longer timeout for this endpoint
    req.setTimeout(300000); // 5 minutes
    
    const adminId = req.user._id;
    
    // Send a response header to keep connection alive
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Content-Type', 'application/json');
    
    const result = await enhancedSchedulerService.generateAllTimetables(adminId);

    // Notify faculty for all generated timetables (async, don't wait)
    setImmediate(async () => {
      try {
        for (const success of result.success) {
          if (success.timetable) {
            await notificationService.notifyFacultySchedulesOnGenerate(success.timetable, req.io);
          }
        }
      } catch (err) {
        console.error('Error sending notifications:', err);
      }
    });

    res.json(result);
  } catch (error) {
    console.error('Error in generateAllTimetables:', error);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

exports.getTimetable = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const timetable = await Timetable.findOne({ sectionRef: sectionId })
      .populate('sectionRef')
      .populate('schedule.subjectRef')
      .populate('schedule.facultyRef')
      .populate('schedule.roomRef')
      .populate('generatedBy')
      .sort({ generatedAt: -1 });

    if (!timetable) {
      return res.status(404).json({ error: 'Timetable not found' });
    }

    res.json(timetable);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTimetableHistory = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const timetables = await Timetable.find({ sectionRef: sectionId })
      .populate('generatedBy')
      .sort({ generatedAt: -1 })
      .select('version generatedAt generatedBy isPublished revisionHistory');

    res.json(timetables);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTimetableById = async (req, res) => {
  try {
    const { id } = req.params;
    const timetable = await Timetable.findById(id)
      .populate('sectionRef')
      .populate('schedule.subjectRef')
      .populate('schedule.facultyRef')
      .populate('schedule.roomRef');

    if (!timetable) {
      return res.status(404).json({ error: 'Timetable not found' });
    }

    res.json(timetable);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllTimetables = async (req, res) => {
  try {
    const timetables = await Timetable.find()
      .populate('sectionRef')
      .populate('generatedBy')
      .sort({ generatedAt: -1 });
    res.json(timetables);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMyGeneratedTimetables = async (req, res) => {
  try {
    const adminId = req.user._id;
    // Include legacy timetables that don't have generatedBy set (null)
    const timetables = await Timetable.find({
      $or: [
        { generatedBy: adminId },
        { generatedBy: { $exists: false } },
        { generatedBy: null }
      ]
    })
      .populate('sectionRef')
      .sort({ generatedAt: -1 });
    res.json(timetables);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateTimetable = async (req, res) => {
  try {
    const { schedule } = req.body;
    const timetable = await Timetable.findByIdAndUpdate(
      req.params.id,
      { schedule },
      { new: true, runValidators: true }
    )
      .populate('sectionRef')
      .populate('schedule.subjectRef')
      .populate('schedule.facultyRef')
      .populate('schedule.roomRef');

    if (!timetable) {
      return res.status(404).json({ error: 'Timetable not found' });
    }

    // Emit Socket.IO update
    if (req.io) {
      req.io.emit('timetable:update', {
        sectionId: timetable.sectionRef._id,
        change: 'updated',
        timetable
      });
    }

    res.json(timetable);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.publishTimetable = async (req, res) => {
  try {
    const timetable = await Timetable.findByIdAndUpdate(
      req.params.id,
      { isPublished: true },
      { new: true }
    )
      .populate('sectionRef')
      .populate('schedule.subjectRef')
      .populate('schedule.facultyRef')
      .populate('schedule.roomRef');

    if (!timetable) {
      return res.status(404).json({ error: 'Timetable not found' });
    }

    // Send notifications
    await notificationService.notifyTimetablePublished(timetable, req.io);

    res.json({ message: 'Timetable published successfully', timetable });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getFacultyTimetable = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user || user.role !== 'faculty') {
      return res.status(403).json({ error: 'Access denied. Faculty role required.' });
    }

    // Find the Faculty record that matches this user's email
    const Faculty = require('../models/Faculty');
    const facultyRecord = await Faculty.findOne({ email: user.email });
    
    if (!facultyRecord) {
      console.log(`Faculty record not found for user ${user.email}`);
      return res.json([]); // Return empty array if no faculty record found
    }

    const facultyId = facultyRecord._id;
    console.log(`Fetching timetable for faculty: ${facultyRecord.name} (${facultyRecord.email}), Faculty ID: ${facultyId}`);

    const facultySessions = [];
    
    // Get all timetables (both published and unpublished) to show all assigned periods
    const allTimetables = await Timetable.find()
      .populate('sectionRef')
      .populate('schedule.subjectRef')
      .populate('schedule.facultyRef')
      .populate('schedule.roomRef');

    console.log(`Found ${allTimetables.length} timetables to check`);

    // Filter sessions where this faculty is assigned
    allTimetables.forEach(timetable => {
      if (!timetable || !timetable.schedule || !Array.isArray(timetable.schedule)) {
        return; // Skip invalid timetables
      }

      timetable.schedule.forEach(session => {
        // Skip if session has no facultyRef
        if (!session || !session.facultyRef) {
          return;
        }

        // Handle both populated and non-populated facultyRef
        let sessionFacultyId = null;
        
        if (session.facultyRef._id) {
          // Populated reference (Faculty model)
          sessionFacultyId = session.facultyRef._id.toString();
        } else if (session.facultyRef.toString) {
          // ObjectId reference
          sessionFacultyId = session.facultyRef.toString();
        } else if (typeof session.facultyRef === 'string') {
          // String ID
          sessionFacultyId = session.facultyRef;
        }
        
        // Safely convert facultyId to string
        const facultyIdStr = facultyId ? (facultyId.toString ? facultyId.toString() : String(facultyId)) : null;
        
        if (sessionFacultyId && facultyIdStr && sessionFacultyId === facultyIdStr) {
          // Safely convert session to object
          const sessionObj = session.toObject ? session.toObject() : session;
          
          facultySessions.push({
            ...sessionObj,
            section: timetable.sectionRef,
            isPublished: timetable.isPublished || false,
            timetableVersion: timetable.version || '1.0'
          });
        }
      });
    });

    console.log(`Found ${facultySessions.length} sessions for faculty ${facultyRecord.name}`);

    // Sort by day and period for better display
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    facultySessions.sort((a, b) => {
      const dayA = dayOrder.indexOf(a.day);
      const dayB = dayOrder.indexOf(b.day);
      
      // Handle invalid days
      if (dayA === -1 && dayB === -1) return 0;
      if (dayA === -1) return 1;
      if (dayB === -1) return -1;
      
      const dayDiff = dayA - dayB;
      if (dayDiff !== 0) return dayDiff;
      
      // Sort by period
      const periodA = parseInt(a.period) || 0;
      const periodB = parseInt(b.period) || 0;
      return periodA - periodB;
    });

    res.json(facultySessions);
  } catch (error) {
    console.error('Error fetching faculty timetable:', error);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

exports.getStudentTimetable = async (req, res) => {
  try {
    const sectionId = req.user.sectionRef;
    if (!sectionId) {
      return res.status(400).json({ error: 'Student not assigned to a section' });
    }

    const timetable = await Timetable.findOne({
      sectionRef: sectionId,
      isPublished: true
    })
      .populate('sectionRef')
      .populate('schedule.subjectRef')
      .populate('schedule.facultyRef')
      .populate('schedule.roomRef')
      .sort({ generatedAt: -1 });

    if (!timetable) {
      return res.status(404).json({ error: 'Timetable not found' });
    }

    res.json(timetable);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete timetable (Admin only)
exports.deleteTimetable = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    // Find the timetable
    const timetable = await Timetable.findById(id)
      .populate('sectionRef')
      .populate('schedule.subjectRef')
      .populate('schedule.facultyRef')
      .populate('schedule.roomRef');

    if (!timetable) {
      return res.status(404).json({ error: 'Timetable not found' });
    }

    // Store timetable info for notifications before deletion
    const timetableInfo = {
      sectionName: timetable.sectionRef?.name || 'Unknown Section',
      sectionId: timetable.sectionRef?._id,
      isPublished: timetable.isPublished,
      version: timetable.version,
      generatedAt: timetable.generatedAt
    };

    // Delete the timetable
    await Timetable.findByIdAndDelete(id);

    // Send real-time notification about deletion
    if (req.io) {
      req.io.emit('timetable:deleted', {
        sectionId: timetableInfo.sectionId,
        sectionName: timetableInfo.sectionName,
        deletedBy: req.user.name || req.user.email,
        deletedAt: new Date(),
        wasPublished: timetableInfo.isPublished
      });
    }

    // Send notifications to affected users
    try {
      await notificationService.notifyTimetableDeleted(timetableInfo, req.user, req.io);
    } catch (notificationError) {
      console.error('Error sending deletion notifications:', notificationError);
      // Don't fail the deletion if notifications fail
    }

    res.json({ 
      message: 'Timetable deleted successfully',
      deletedTimetable: {
        id,
        sectionName: timetableInfo.sectionName,
        version: timetableInfo.version,
        wasPublished: timetableInfo.isPublished
      }
    });
  } catch (error) {
    console.error('Error deleting timetable:', error);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Delete multiple timetables (Admin only)
exports.deleteTimetables = async (req, res) => {
  try {
    const { timetableIds } = req.body;
    const adminId = req.user._id;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    if (!Array.isArray(timetableIds) || timetableIds.length === 0) {
      return res.status(400).json({ error: 'Invalid timetable IDs provided' });
    }

    // Find all timetables to be deleted
    const timetables = await Timetable.find({ _id: { $in: timetableIds } })
      .populate('sectionRef');

    if (timetables.length === 0) {
      return res.status(404).json({ error: 'No timetables found with provided IDs' });
    }

    // Store info for notifications
    const deletedTimetables = timetables.map(tt => ({
      id: tt._id,
      sectionName: tt.sectionRef?.name || 'Unknown Section',
      sectionId: tt.sectionRef?._id,
      isPublished: tt.isPublished,
      version: tt.version,
      generatedAt: tt.generatedAt
    }));

    // Delete all timetables
    const deleteResult = await Timetable.deleteMany({ _id: { $in: timetableIds } });

    // Send real-time notifications
    if (req.io) {
      deletedTimetables.forEach(ttInfo => {
        req.io.emit('timetable:deleted', {
          sectionId: ttInfo.sectionId,
          sectionName: ttInfo.sectionName,
          deletedBy: req.user.name || req.user.email,
          deletedAt: new Date(),
          wasPublished: ttInfo.isPublished
        });
      });
    }

    // Send notifications to affected users
    try {
      for (const ttInfo of deletedTimetables) {
        await notificationService.notifyTimetableDeleted(ttInfo, req.user, req.io);
      }
    } catch (notificationError) {
      console.error('Error sending deletion notifications:', notificationError);
      // Don't fail the deletion if notifications fail
    }

    res.json({ 
      message: `${deleteResult.deletedCount} timetable(s) deleted successfully`,
      deletedCount: deleteResult.deletedCount,
      deletedTimetables: deletedTimetables.map(tt => ({
        id: tt.id,
        sectionName: tt.sectionName,
        version: tt.version,
        wasPublished: tt.isPublished
      }))
    });
  } catch (error) {
    console.error('Error deleting timetables:', error);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

