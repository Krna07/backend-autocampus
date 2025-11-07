const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
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
  passwordHash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'faculty', 'student'],
    required: true,
    default: 'student'
  },
  // Student-specific fields
  regNumber: {
    type: String,
    sparse: true,
    trim: true,
    uppercase: true
  },
  rollNumber: {
    type: String,
    sparse: true,
    trim: true
  },
  mobile: {
    type: String,
    trim: true
  },
  sectionRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Section',
    required: function() {
      return this.role === 'student';
    }
  },
  // Additional student information
  studentInfo: {
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other']
    },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' }
    },
    parentContact: {
      fatherName: String,
      motherName: String,
      guardianPhone: String,
      emergencyContact: String
    },
    academicInfo: {
      admissionYear: Number,
      currentSemester: Number,
      cgpa: Number,
      previousEducation: String
    }
  },
  // Faculty-specific fields
  facultyInfo: {
    employeeId: String,
    department: String,
    designation: String,
    qualification: String,
    experience: Number,
    specialization: [String],
    availability: {
      dayOfWeek: [Number], // 0-6 (Sunday-Saturday)
      timeSlots: [{
        start: String,
        end: String
      }]
    }
  },
  // Profile and preferences
  profile: {
    avatar: String,
    bio: String,
    preferences: {
      notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: true }
      },
      language: { type: String, default: 'en' },
      timezone: { type: String, default: 'Asia/Kolkata' }
    }
  },
  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: Date,
  loginCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ regNumber: 1 });
userSchema.index({ rollNumber: 1 });
userSchema.index({ role: 1, sectionRef: 1 });
userSchema.index({ 'facultyInfo.employeeId': 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return this.name;
});

// Method to get student's section with timetable
userSchema.methods.getSectionWithTimetable = async function() {
  if (this.role !== 'student' || !this.sectionRef) {
    return null;
  }
  
  const Section = mongoose.model('Section');
  const Timetable = mongoose.model('Timetable');
  
  const section = await Section.findById(this.sectionRef);
  if (!section) return null;
  
  const timetable = await Timetable.findOne({
    sectionRef: this.sectionRef,
    isPublished: true
  })
  .populate('schedule.subjectRef')
  .populate('schedule.facultyRef')
  .populate('schedule.roomRef')
  .sort({ generatedAt: -1 });
  
  return {
    section,
    timetable
  };
};

// Method to check if user can access a timetable
userSchema.methods.canAccessTimetable = function(timetableId) {
  if (this.role === 'admin') return true;
  if (this.role === 'faculty') return true; // Faculty can see all timetables
  if (this.role === 'student') {
    // Students can only see their section's timetable
    return this.sectionRef && this.sectionRef.toString() === timetableId;
  }
  return false;
};

// Pre-save middleware to update login info
userSchema.pre('save', function(next) {
  if (this.isModified('lastLogin')) {
    this.loginCount += 1;
  }
  next();
});

module.exports = mongoose.model('User', userSchema);

