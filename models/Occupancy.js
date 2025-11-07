const mongoose = require('mongoose');

const occupancySchema = new mongoose.Schema({
  roomRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  source: {
    type: String,
    enum: ['sensor', 'manual', 'timetable'],
    default: 'timetable'
  },
  count: {
    type: Number,
    required: true,
    min: 0
  },
  sessionRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Timetable'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Occupancy', occupancySchema);

