const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['Theory', 'Lab', 'Project'],
    required: true
  },
  weeklyPeriods: {
    type: Number,
    required: true,
    min: 1
  },
  preferredRoomType: {
    type: String,
    enum: ['Classroom', 'Lab'],
    default: 'Classroom'
  },
  requiredEquipment: [{
    type: String,
    trim: true
  }],
  requiresLab: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Subject', subjectSchema);

