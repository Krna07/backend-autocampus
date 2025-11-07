const mongoose = require('mongoose');

const conflictSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  roomCode: {
    type: String,
    required: true
  },
  roomName: {
    type: String,
    required: true
  },
  originalStatus: {
    type: String,
    required: true
  },
  newStatus: {
    type: String,
    required: true,
    enum: ['in_maintenance', 'reserved', 'closed', 'offline']
  },
  affectedEntries: [{
    timetableEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Timetable'
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject'
    },
    subjectName: String,
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Faculty'
    },
    facultyName: String,
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section'
    },
    sectionName: String,
    day: String,
    period: Number,
    startTime: String,
    endTime: String,
    status: {
      type: String,
      enum: ['pending', 'resolved', 'requires_manual'],
      default: 'pending'
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    newRoomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room'
    },
    newRoomCode: String
  }],
  status: {
    type: String,
    enum: ['active', 'resolved', 'dismissed'],
    default: 'active',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolutionMethod: {
    type: String,
    enum: ['auto_regeneration', 'manual_adjustment', 'dismissed']
  },
  resolutionSummary: {
    totalAffected: {
      type: Number,
      default: 0
    },
    autoResolved: {
      type: Number,
      default: 0
    },
    manuallyResolved: {
      type: Number,
      default: 0
    },
    unresolved: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
conflictSchema.index({ status: 1, createdAt: -1 });
conflictSchema.index({ roomId: 1, status: 1 });
conflictSchema.index({ 'affectedEntries.status': 1 });

// Virtual for active affected entries count
conflictSchema.virtual('activeAffectedCount').get(function() {
  return this.affectedEntries.filter(e => e.status === 'pending').length;
});

// Method to mark conflict as resolved
conflictSchema.methods.markAsResolved = function(adminId, method) {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  this.resolvedBy = adminId;
  this.resolutionMethod = method;
  return this.save();
};

// Method to update resolution summary
conflictSchema.methods.updateResolutionSummary = function() {
  this.resolutionSummary.totalAffected = this.affectedEntries.length;
  this.resolutionSummary.autoResolved = this.affectedEntries.filter(
    e => e.status === 'resolved' && e.resolvedBy
  ).length;
  this.resolutionSummary.manuallyResolved = this.affectedEntries.filter(
    e => e.status === 'resolved' && !e.resolvedBy
  ).length;
  this.resolutionSummary.unresolved = this.affectedEntries.filter(
    e => e.status === 'pending' || e.status === 'requires_manual'
  ).length;
  return this.save();
};

// Static method to get active conflicts
conflictSchema.statics.getActiveConflicts = async function() {
  return this.find({ status: 'active' })
    .populate('roomId')
    .populate('resolvedBy', 'name email')
    .sort({ createdAt: -1 });
};

// Static method to get conflicts by room
conflictSchema.statics.getConflictsByRoom = async function(roomId) {
  return this.find({ roomId, status: 'active' })
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('Conflict', conflictSchema);