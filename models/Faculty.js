const mongoose = require('mongoose');

const facultySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  maxHoursPerWeek: {
    type: Number,
    required: true,
    min: 1,
    default: 40
  },
  subjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  }],
  availability: {
    dayOfWeek: [{
      type: Number,
      min: 0,
      max: 6
    }]
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Faculty', facultySchema);

