const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const notificationService = require('../services/notificationService');

/**
 * Test endpoint to manually trigger room status notification
 * Useful for debugging
 */
router.post('/test-room-notification/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    
    // Find the room
    const room = await Room.findById(roomId);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found',
        roomId
      });
    }
    
    console.log(`[TEST] Manually triggering notification for room: ${room.code}`);
    
    // Manually trigger notification
    const result = await notificationService.notifyRoomStatusChange(room, global.io);
    
    return res.json({
      success: true,
      message: `Notification triggered for room ${room.code}`,
      room: {
        id: room._id,
        code: room.code,
        name: room.name,
        status: room.status
      },
      result
    });
    
  } catch (error) {
    console.error('[TEST] Error triggering notification:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test endpoint to check room and timetable data
 */
router.get('/test-room-data/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const Timetable = require('../models/Timetable');
    
    // Find room by code (case insensitive)
    const room = await Room.findOne({ 
      code: { $regex: new RegExp(`^${roomCode}$`, 'i') }
    });
    
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found',
        searchedCode: roomCode,
        suggestion: 'Check if room code matches exactly (e.g., A102 vs A-102)'
      });
    }
    
    // Find timetables using this room
    const timetables = await Timetable.find({
      'schedule.roomRef': room._id
    })
    .populate('sectionRef', 'name year')
    .populate('schedule.subjectRef', 'name code')
    .populate('schedule.facultyRef', 'name');
    
    // Extract sessions using this room
    const sessions = [];
    timetables.forEach(timetable => {
      timetable.schedule.forEach(session => {
        if (session.roomRef && session.roomRef.toString() === room._id.toString()) {
          sessions.push({
            timetableId: timetable._id,
            timetablePublished: timetable.isPublished,
            section: timetable.sectionRef?.name,
            subject: session.subjectRef?.name,
            faculty: session.facultyRef?.name,
            day: session.day,
            period: session.period,
            time: `${session.startTime}-${session.endTime}`
          });
        }
      });
    });
    
    return res.json({
      success: true,
      room: {
        id: room._id,
        code: room.code,
        name: room.name,
        type: room.type,
        capacity: room.capacity,
        status: room.status
      },
      timetables: {
        total: timetables.length,
        published: timetables.filter(t => t.isPublished).length,
        unpublished: timetables.filter(t => !t.isPublished).length
      },
      sessions: {
        total: sessions.length,
        inPublishedTimetables: sessions.filter(s => s.timetablePublished).length,
        details: sessions
      }
    });
    
  } catch (error) {
    console.error('[TEST] Error getting room data:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test endpoint to check admin users
 */
router.get('/test-admin-users', async (req, res) => {
  try {
    const User = require('../models/User');
    
    const admins = await User.find({ role: 'admin' }).select('name email role');
    const faculty = await User.find({ role: 'faculty' }).select('name email role');
    
    return res.json({
      success: true,
      admins: {
        count: admins.length,
        users: admins
      },
      faculty: {
        count: faculty.length,
        users: faculty
      },
      totalNotificationRecipients: admins.length + faculty.length
    });
    
  } catch (error) {
    console.error('[TEST] Error getting users:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
