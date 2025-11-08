const RoomBooking = require('../models/RoomBooking');
const Room = require('../models/Room');
const Timetable = require('../models/Timetable');
const notificationService = require('../services/notificationService');

// Create a new room booking
exports.createBooking = async (req, res) => {
  try {
    const {
      roomId,
      title,
      description,
      bookingType,
      startDate,
      endDate,
      startTime,
      endTime,
      days,
      isRecurring,
      attendees,
      notes,
      forceBook
    } = req.body;

    // Validate room exists
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check for booking conflicts
    const bookingConflicts = await RoomBooking.checkConflict(
      roomId,
      new Date(startDate),
      new Date(endDate),
      startTime,
      endTime,
      days
    );

    if (bookingConflicts.length > 0 && !forceBook) {
      return res.status(409).json({
        error: 'Booking conflict detected',
        conflicts: bookingConflicts,
        message: 'This room is already booked for the selected time. Use force booking to override.'
      });
    }

    // Check for timetable conflicts
    const timetableConflicts = await RoomBooking.checkTimetableConflict(
      roomId,
      days,
      startTime,
      endTime
    );

    if (timetableConflicts.length > 0 && !forceBook) {
      return res.status(409).json({
        error: 'Timetable conflict detected',
        conflicts: timetableConflicts,
        message: 'This room is assigned to timetable sessions. Use force booking to override and suggest replacement rooms.'
      });
    }

    // Create booking
    const booking = new RoomBooking({
      roomId,
      bookedBy: req.user._id,
      title,
      description,
      bookingType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      startTime,
      endTime,
      days,
      isRecurring,
      attendees,
      notes,
      isForceBooked: forceBook && (bookingConflicts.length > 0 || timetableConflicts.length > 0)
    });

    await booking.save();

    // If force booked with timetable conflicts, handle replacement
    if (forceBook && timetableConflicts.length > 0) {
      // This will be handled in a separate endpoint for suggesting and applying replacements
      booking.conflictingTimetables = timetableConflicts.map(c => ({
        timetableId: c.timetableId,
        affectedSessions: [{
          day: c.day,
          period: c.period,
          startTime: c.startTime,
          endTime: c.endTime
        }]
      }));
      await booking.save();
    }

    // Populate booking details
    const populatedBooking = await RoomBooking.findById(booking._id)
      .populate('roomId', 'code name type capacity')
      .populate('bookedBy', 'name email');

    // Send notification to admins
    if (req.io) {
      // Notify about new booking
      const User = require('../models/User');
      const admins = await User.find({ role: 'admin' });
      
      admins.forEach(admin => {
        req.io.to(`user_${admin._id}`).emit('notification:new', {
          type: 'room_booking',
          title: `New Room Booking: ${room.code}`,
          message: `${req.user.name} booked ${room.code} for ${title}`,
          data: {
            bookingId: booking._id,
            roomCode: room.code,
            bookedBy: req.user.name,
            startDate,
            endDate
          }
        });
      });
    }

    res.status(201).json({
      message: 'Room booked successfully',
      booking: populatedBooking,
      hasConflicts: timetableConflicts.length > 0,
      conflicts: timetableConflicts
    });

  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
};

// Get all bookings
exports.getAllBookings = async (req, res) => {
  try {
    const { status, roomId, startDate, endDate } = req.query;

    const query = {};
    if (status) query.status = status;
    if (roomId) query.roomId = roomId;
    if (startDate || endDate) {
      query.$or = [
        {
          startDate: { $lte: new Date(endDate || Date.now()) },
          endDate: { $gte: new Date(startDate || Date.now()) }
        }
      ];
    }

    const bookings = await RoomBooking.find(query)
      .populate('roomId', 'code name type capacity')
      .populate('bookedBy', 'name email')
      .sort({ startDate: -1 });

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

// Get booking by ID
exports.getBookingById = async (req, res) => {
  try {
    const booking = await RoomBooking.findById(req.params.id)
      .populate('roomId', 'code name type capacity building floor')
      .populate('bookedBy', 'name email role')
      .populate('conflictingTimetables.timetableId')
      .populate('conflictingTimetables.replacementRoomId', 'code name');

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
};

// Update booking
exports.updateBooking = async (req, res) => {
  try {
    const booking = await RoomBooking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user is authorized (admin or booking creator)
    if (req.user.role !== 'admin' && booking.bookedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this booking' });
    }

    const updates = req.body;
    Object.keys(updates).forEach(key => {
      booking[key] = updates[key];
    });

    await booking.save();

    const updatedBooking = await RoomBooking.findById(booking._id)
      .populate('roomId', 'code name type capacity')
      .populate('bookedBy', 'name email');

    res.json({
      message: 'Booking updated successfully',
      booking: updatedBooking
    });

  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
};

// Cancel booking
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await RoomBooking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user is authorized
    if (req.user.role !== 'admin' && booking.bookedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to cancel this booking' });
    }

    booking.status = 'cancelled';
    await booking.save();

    res.json({
      message: 'Booking cancelled successfully',
      booking
    });

  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
};

// Delete booking
exports.deleteBooking = async (req, res) => {
  try {
    const booking = await RoomBooking.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Only admin can delete
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete bookings' });
    }

    await RoomBooking.findByIdAndDelete(req.params.id);

    res.json({ message: 'Booking deleted successfully' });

  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
};

// Get available rooms for booking
exports.getAvailableRooms = async (req, res) => {
  try {
    const { startDate, endDate, startTime, endTime, days, type, capacity } = req.query;

    if (!startDate || !endDate || !startTime || !endTime || !days) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const daysArray = Array.isArray(days) ? days : [days];

    // Get all rooms
    let roomQuery = { status: 'active' };
    if (type) roomQuery.type = type;
    if (capacity) roomQuery.capacity = { $gte: parseInt(capacity) };

    const allRooms = await Room.find(roomQuery);

    // Check each room for conflicts
    const availableRooms = [];
    
    for (const room of allRooms) {
      // Check booking conflicts
      const bookingConflicts = await RoomBooking.checkConflict(
        room._id,
        new Date(startDate),
        new Date(endDate),
        startTime,
        endTime,
        daysArray
      );

      // Check timetable conflicts
      const timetableConflicts = await RoomBooking.checkTimetableConflict(
        room._id,
        daysArray,
        startTime,
        endTime
      );

      if (bookingConflicts.length === 0 && timetableConflicts.length === 0) {
        availableRooms.push(room);
      }
    }

    res.json({
      availableRooms,
      totalAvailable: availableRooms.length,
      totalRooms: allRooms.length
    });

  } catch (error) {
    console.error('Error fetching available rooms:', error);
    res.status(500).json({ error: 'Failed to fetch available rooms' });
  }
};

// Suggest replacement rooms for force booking
exports.suggestReplacementRooms = async (req, res) => {
  try {
    const { roomId, days, startTime, endTime } = req.body;

    // Get the original room details
    const originalRoom = await Room.findById(roomId);
    if (!originalRoom) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Get timetable conflicts
    const conflicts = await RoomBooking.checkTimetableConflict(roomId, days, startTime, endTime);

    if (conflicts.length === 0) {
      return res.json({
        message: 'No conflicts found',
        conflicts: [],
        suggestions: []
      });
    }

    // Find suitable replacement rooms
    const allRooms = await Room.find({
      _id: { $ne: roomId },
      status: 'active',
      type: originalRoom.type,
      capacity: { $gte: originalRoom.capacity * 0.8 } // At least 80% of original capacity
    });

    const suggestions = [];

    for (const conflict of conflicts) {
      const suitableRooms = [];

      for (const room of allRooms) {
        // Check if this room is available for the conflicting session
        const roomConflicts = await RoomBooking.checkTimetableConflict(
          room._id,
          [conflict.day],
          conflict.startTime,
          conflict.endTime
        );

        if (roomConflicts.length === 0) {
          suitableRooms.push({
            roomId: room._id,
            code: room.code,
            name: room.name,
            type: room.type,
            capacity: room.capacity,
            building: room.building,
            floor: room.floor
          });
        }
      }

      suggestions.push({
        conflict,
        replacementOptions: suitableRooms
      });
    }

    res.json({
      conflicts,
      suggestions,
      totalConflicts: conflicts.length
    });

  } catch (error) {
    console.error('Error suggesting replacement rooms:', error);
    res.status(500).json({ error: 'Failed to suggest replacement rooms' });
  }
};

// Apply replacement rooms for force booking
exports.applyReplacements = async (req, res) => {
  try {
    const { bookingId, replacements } = req.body;

    const booking = await RoomBooking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Apply replacements to timetables
    for (const replacement of replacements) {
      const { timetableId, day, period, newRoomId } = replacement;

      const timetable = await Timetable.findById(timetableId);
      if (!timetable) continue;

      // Find and update the session
      const sessionIndex = timetable.schedule.findIndex(
        s => s.day === day && s.period === period && s.roomRef.toString() === booking.roomId.toString()
      );

      if (sessionIndex !== -1) {
        timetable.schedule[sessionIndex].roomRef = newRoomId;
        await timetable.save();

        // Update booking record
        booking.conflictingTimetables.push({
          timetableId,
          replacementRoomId: newRoomId,
          affectedSessions: [{
            day,
            period,
            startTime: timetable.schedule[sessionIndex].startTime,
            endTime: timetable.schedule[sessionIndex].endTime
          }]
        });
      }
    }

    await booking.save();

    res.json({
      message: 'Replacements applied successfully',
      booking
    });

  } catch (error) {
    console.error('Error applying replacements:', error);
    res.status(500).json({ error: 'Failed to apply replacements' });
  }
};

// Get my bookings (for current user)
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await RoomBooking.find({ bookedBy: req.user._id })
      .populate('roomId', 'code name type capacity')
      .sort({ startDate: -1 });

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching my bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};
