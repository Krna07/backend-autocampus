const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sessionId: {
    type: String, // Format: "roomId-day-period-date"
    required: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  facultyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: true
  },
  sectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Section',
    required: true
  },
  day: {
    type: String,
    required: true
  },
  period: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  checkInTime: {
    type: Date,
    default: Date.now
  },
  checkInMethod: {
    type: String,
    enum: ['qr_code', 'manual', 'auto'],
    default: 'qr_code'
  },
  location: {
    latitude: Number,
    longitude: Number
  },
  isLate: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['present', 'late', 'absent'],
    default: 'present'
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
attendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
attendanceSchema.index({ roomId: 1, date: 1 });
attendanceSchema.index({ studentId: 1, date: 1 });
attendanceSchema.index({ subjectId: 1, date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);