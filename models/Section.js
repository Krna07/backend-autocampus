const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  year: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  semester: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  academicYear: {
    type: String,
    required: true,
    match: /^\d{4}-\d{4}$/ // Format: 2024-2025
  },
  strength: {
    type: Number,
    default: 0,
    min: 0
  },
  maxStrength: {
    type: Number,
    required: true,
    min: 1
  },
  preferredBuildings: [{
    type: String,
    trim: true
  }],
  totalPeriodsPerWeek: {
    type: Number,
    required: true,
    min: 1,
    default: 30
  },
  // Class timing preferences
  classTimings: {
    startTime: {
      type: String,
      default: '08:00'
    },
    endTime: {
      type: String,
      default: '16:20'
    },
    breakDuration: {
      type: Number,
      default: 20 // minutes
    },
    lunchDuration: {
      type: Number,
      default: 60 // minutes
    }
  },
  // Section metadata
  metadata: {
    classTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    hod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    subjects: [{
      subjectRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject'
      },
      facultyRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      periodsPerWeek: {
        type: Number,
        default: 4
      },
      isElective: {
        type: Boolean,
        default: false
      }
    }],
    roomPreferences: [{
      roomType: {
        type: String,
        enum: ['Classroom', 'Lab']
      },
      capacity: Number,
      equipment: [String]
    }]
  },
  // Status and flags
  isActive: {
    type: Boolean,
    default: true
  },
  hasTimetable: {
    type: Boolean,
    default: false
  },
  timetableLastUpdated: Date
}, {
  timestamps: true
});

// Indexes for better performance
sectionSchema.index({ department: 1, year: 1, semester: 1 });
sectionSchema.index({ academicYear: 1 });
sectionSchema.index({ code: 1 });
sectionSchema.index({ isActive: 1 });

// Virtual for section display name
sectionSchema.virtual('displayName').get(function() {
  return `${this.name} - ${this.department} Year ${this.year}`;
});

// Virtual to get current student count
sectionSchema.virtual('currentStrength', {
  ref: 'User',
  localField: '_id',
  foreignField: 'sectionRef',
  count: true,
  match: { role: 'student', isActive: true }
});

// Method to get all students in this section
sectionSchema.methods.getStudents = function() {
  const User = mongoose.model('User');
  return User.find({
    sectionRef: this._id,
    role: 'student',
    isActive: true
  }).sort({ rollNumber: 1, name: 1 });
};

// Method to get section's current timetable
sectionSchema.methods.getCurrentTimetable = function() {
  const Timetable = mongoose.model('Timetable');
  return Timetable.findOne({
    sectionRef: this._id,
    isPublished: true
  })
  .populate('schedule.subjectRef')
  .populate('schedule.facultyRef')
  .populate('schedule.roomRef')
  .sort({ generatedAt: -1 });
};

// Method to check if section can accommodate more students
sectionSchema.methods.canAddStudents = function(count = 1) {
  return (this.strength + count) <= this.maxStrength;
};

// Static method to find sections by department and year
sectionSchema.statics.findByDepartmentAndYear = function(department, year) {
  return this.find({
    department: department,
    year: year,
    isActive: true
  }).sort({ name: 1 });
};

// Pre-save middleware to update strength
sectionSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('_id')) {
    const User = mongoose.model('User');
    const studentCount = await User.countDocuments({
      sectionRef: this._id,
      role: 'student',
      isActive: true
    });
    this.strength = studentCount;
  }
  next();
});

module.exports = mongoose.model('Section', sectionSchema);

