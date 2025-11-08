const mongoose = require('mongoose');

const roomBookingSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  bookedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  bookingType: {
    type: String,
    enum: ['meeting', 'event', 'personal', 'maintenance', 'other'],
    default: 'meeting'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  days: [{
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  }],
  isRecurring: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'completed'],
    default: 'active'
  },
  isForceBooked: {
    type: Boolean,
    default: false
  },
  conflictingTimetables: [{
    timetableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Timetable'
    },
    replacementRoomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room'
    },
    affectedSessions: [{
      day: String,
      period: Number,
      startTime: String,
      endTime: String
    }]
  }],
  attendees: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
roomBookingSchema.index({ roomId: 1, startDate: 1, endDate: 1 });
roomBookingSchema.index({ bookedBy: 1 });
roomBookingSchema.index({ status: 1 });

// Method to check if booking conflicts with existing bookings
roomBookingSchema.statics.checkConflict = async function(roomId, startDate, endDate, startTime, endTime, days, excludeBookingId = null) {
  const query = {
    roomId,
    status: 'active',
    $or: [
      {
        startDate: { $lte: endDate },
        endDate: { $gte: startDate }
      }
    ]
  };

  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const conflictingBookings = await this.find(query);

  // Check time and day conflicts
  const conflicts = conflictingBookings.filter(booking => {
    // Check if days overlap
    const daysOverlap = days.some(day => booking.days.includes(day));
    if (!daysOverlap) return false;

    // Check if times overlap
    const bookingStart = parseInt(booking.startTime.replace(':', ''));
    const bookingEnd = parseInt(booking.endTime.replace(':', ''));
    const newStart = parseInt(startTime.replace(':', ''));
    const newEnd = parseInt(endTime.replace(':', ''));

    return (newStart < bookingEnd && newEnd > bookingStart);
  });

  return conflicts;
};

// Method to check if booking conflicts with timetables
roomBookingSchema.statics.checkTimetableConflict = async function(roomId, days, startTime, endTime) {
  const Timetable = require('./Timetable');
  
  const timetables = await Timetable.find({
    'schedule.roomRef': roomId,
    isPublished: true
  })
  .populate('sectionRef', 'name year')
  .populate('schedule.subjectRef', 'name code')
  .populate('schedule.facultyRef', 'name');

  const conflicts = [];

  timetables.forEach(timetable => {
    timetable.schedule.forEach(session => {
      if (session.roomRef && session.roomRef.toString() === roomId.toString()) {
        // Check if day matches
        if (days.includes(session.day)) {
          // Check if time overlaps
          const sessionStart = parseInt(session.startTime.replace(':', ''));
          const sessionEnd = parseInt(session.endTime.replace(':', ''));
          const bookingStart = parseInt(startTime.replace(':', ''));
          const bookingEnd = parseInt(endTime.replace(':', ''));

          if (bookingStart < sessionEnd && bookingEnd > sessionStart) {
            conflicts.push({
              timetableId: timetable._id,
              sectionName: timetable.sectionRef?.name,
              subjectName: session.subjectRef?.name,
              facultyName: session.facultyRef?.name,
              day: session.day,
              period: session.period,
              startTime: session.startTime,
              endTime: session.endTime
            });
          }
        }
      }
    });
  });

  return conflicts;
};

module.exports = mongoose.model('RoomBooking', roomBookingSchema);
