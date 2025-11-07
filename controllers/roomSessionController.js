const Room = require('../models/Room');
const AdminTimetable = require('../models/AdminTimetable');
const Faculty = require('../models/Faculty');
const Subject = require('../models/Subject');
const mongoose = require('mongoose');

// Start a class session
exports.startClassSession = async (req, res) => {
  try {
    const { roomId, day, period } = req.body;
    const facultyId = req.user._id;

    // Validate input
    if (!roomId || !day || !period) {
      return res.status(400).json({ error: 'Room ID, day, and period are required' });
    }

    // Check if room exists and is active
    const room = await Room.findById(roomId);
    if (!room || room.status !== 'active') {
      return res.status(404).json({ error: 'Room not found or not active' });
    }

    // Check if room is already occupied
    if (room.occupancyStatus === 'occupied') {
      return res.status(409).json({ error: 'Room is already occupied' });
    }

    // Get timetable data to verify the faculty is scheduled for this room/time
    const adminTimetable = await AdminTimetable.findOne({ isActive: true });
    const cellKey = `${day}-${period}`;
    
    let isAuthorized = false;
    let subjectId = null;

    if (adminTimetable && adminTimetable.timetableData.has(cellKey)) {
      const cellData = adminTimetable.timetableData.get(cellKey);
      if (cellData.teacher && cellData.teacher.toString() === facultyId.toString() && 
          cellData.classroom && cellData.classroom.toString() === roomId) {
        isAuthorized = true;
        subjectId = cellData.subject;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'You are not scheduled to teach in this room at this time' });
    }

    // Calculate class duration (1 hour)
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour later

    // Update room status
    room.occupancyStatus = 'occupied';
    room.currentSession = {
      facultyId: facultyId,
      subjectId: subjectId,
      startTime: startTime,
      endTime: endTime,
      day: day,
      period: period
    };

    await room.save();

    // Notify subscribers about room status change
    try {
      const notificationService = require('../services/notificationService');
      await notificationService.notifyRoomStatusChange(room, req.io);
    } catch (_) {}

    // Note: Automatic status reset is handled by the RoomStatusScheduler service

    // Emit Socket.IO update
    if (req.io) {
      req.io.emit('room:session-started', {
        roomId: roomId,
        facultyId: facultyId,
        startTime: startTime,
        endTime: endTime,
        day: day,
        period: period
      });
    }

    res.json({
      success: true,
      message: 'Class session started successfully',
      session: room.currentSession
    });
  } catch (error) {
    console.error('Error starting class session:', error);
    res.status(500).json({ error: error.message });
  }
};

// End a class session
exports.endClassSession = async (req, res) => {
  try {
    const { roomId } = req.body;
    const facultyId = req.user._id;

    // Find the room
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if faculty is authorized to end this session
    if (!room.currentSession.facultyId || 
        room.currentSession.facultyId.toString() !== facultyId.toString()) {
      return res.status(403).json({ error: 'You are not authorized to end this session' });
    }

    // Reset room status
    room.occupancyStatus = 'idle';
    room.currentSession = {
      facultyId: null,
      subjectId: null,
      startTime: null,
      endTime: null,
      day: null,
      period: null
    };

    await room.save();

    // Notify subscribers about room status change
    try {
      const notificationService = require('../services/notificationService');
      await notificationService.notifyRoomStatusChange(room, req.io);
    } catch (_) {}

    // Send admin notification when a room becomes idle
    if (req.io) {
      try {
        req.io.to('role_admin').emit('notification:new', {
          message: `Room ${room.code} is now idle`,
          type: 'room_idle',
          roomId: room._id,
          timestamp: new Date()
        });
      } catch (_) {}
    }

    // Emit Socket.IO update
    if (req.io) {
      req.io.emit('room:session-ended', {
        roomId: roomId,
        facultyId: facultyId,
        endTime: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Class session ended successfully'
    });
  } catch (error) {
    console.error('Error ending class session:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get faculty's current sessions
exports.getFacultySessions = async (req, res) => {
  try {
    const facultyId = req.user._id;

    const activeSessions = await Room.find({
      'currentSession.facultyId': facultyId,
      occupancyStatus: 'occupied'
    })
    .populate('currentSession.subjectId')
    .select('_id name code building floor currentSession occupancyStatus');

    res.json(activeSessions);
  } catch (error) {
    console.error('Error fetching faculty sessions:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get faculty's scheduled classes for today
exports.getFacultySchedule = async (req, res) => {
  try {
    const facultyId = req.user._id;
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    const adminTimetable = await AdminTimetable.findOne({ isActive: true });
    
    if (!adminTimetable) {
      return res.json([]);
    }

    const todaySchedule = [];
    
    for (const [key, value] of adminTimetable.timetableData) {
      const [day, period] = key.split('-');
      
      if (day === today && value.teacher && value.teacher.toString() === facultyId.toString()) {
        // Get room and subject details
        const room = value.classroom ? await Room.findById(value.classroom) : null;
        const subject = value.subject ? await Subject.findById(value.subject) : null;
        
        todaySchedule.push({
          day,
          period: parseInt(period),
          room: room ? {
            _id: room._id,
            name: room.name,
            code: room.code,
            building: room.building,
            floor: room.floor,
            occupancyStatus: room.occupancyStatus
          } : null,
          subject: subject ? {
            _id: subject._id,
            name: subject.name
          } : null,
          canStart: room && room.occupancyStatus === 'idle'
        });
      }
    }

    // Sort by period
    todaySchedule.sort((a, b) => a.period - b.period);

    res.json(todaySchedule);
  } catch (error) {
    console.error('Error fetching faculty schedule:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get room status
exports.getRoomStatus = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findById(roomId)
      .populate('currentSession.facultyId')
      .populate('currentSession.subjectId')
      .select('_id name code building floor status occupancyStatus currentSession');

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json(room);
  } catch (error) {
    console.error('Error fetching room status:', error);
    res.status(500).json({ error: error.message });
  }
};

// Note: Automatic status reset is now handled by the RoomStatusScheduler service
// which runs as a cron job every minute to check for expired sessions