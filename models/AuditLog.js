const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  adminName: {
    type: String,
    required: true
  },
  timetableEntryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Timetable',
    index: true
  },
  changeType: {
    type: String,
    enum: ['auto_regeneration', 'manual_adjustment', 'forced_update'],
    required: true,
    index: true
  },
  oldRoomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },
  oldRoomCode: String,
  oldRoomName: String,
  newRoomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },
  newRoomCode: String,
  newRoomName: String,
  reason: {
    type: String,
    required: true
  },
  validationWarningsOverridden: [String],
  metadata: {
    conflictId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conflict'
    },
    originalStatus: String,
    newStatus: String,
    affectedUsers: Number,
    subjectName: String,
    facultyName: String,
    sectionName: String,
    day: String,
    period: Number,
    startTime: String,
    endTime: String
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
auditLogSchema.index({ timestamp: -1, adminId: 1 });
auditLogSchema.index({ timetableEntryId: 1, timestamp: -1 });
auditLogSchema.index({ changeType: 1, timestamp: -1 });
auditLogSchema.index({ 'metadata.conflictId': 1, timestamp: -1 });

// Virtual for formatted timestamp
auditLogSchema.virtual('formattedTimestamp').get(function() {
  return this.timestamp.toLocaleString();
});

// Static method to create audit log entry
auditLogSchema.statics.logChange = async function(logData) {
  return this.create({
    adminId: logData.adminId,
    adminName: logData.adminName,
    timetableEntryId: logData.timetableEntryId,
    changeType: logData.changeType,
    oldRoomId: logData.oldRoomId,
    oldRoomCode: logData.oldRoomCode,
    oldRoomName: logData.oldRoomName,
    newRoomId: logData.newRoomId,
    newRoomCode: logData.newRoomCode,
    newRoomName: logData.newRoomName,
    reason: logData.reason,
    validationWarningsOverridden: logData.validationWarningsOverridden || [],
    metadata: logData.metadata || {}
  });
};

// Static method to query logs with filters
auditLogSchema.statics.queryLogs = async function(filters = {}, options = {}) {
  const {
    startDate,
    endDate,
    adminId,
    changeType,
    roomId,
    conflictId,
    page = 1,
    limit = 50
  } = { ...filters, ...options };

  const query = {};

  // Date range filter
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  // Admin filter
  if (adminId) {
    query.adminId = adminId;
  }

  // Change type filter
  if (changeType) {
    query.changeType = changeType;
  }

  // Room filter (old or new room)
  if (roomId) {
    query.$or = [
      { oldRoomId: roomId },
      { newRoomId: roomId }
    ];
  }

  // Conflict filter
  if (conflictId) {
    query['metadata.conflictId'] = conflictId;
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    this.find(query)
      .populate('adminId', 'name email role')
      .populate('oldRoomId', 'code name')
      .populate('newRoomId', 'code name')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasMore: skip + logs.length < total
  };
};

// Static method to get entry history
auditLogSchema.statics.getEntryHistory = async function(timetableEntryId) {
  return this.find({ timetableEntryId })
    .populate('adminId', 'name email')
    .populate('oldRoomId', 'code name')
    .populate('newRoomId', 'code name')
    .sort({ timestamp: -1 })
    .lean();
};

// Static method to generate audit report
auditLogSchema.statics.generateAuditReport = async function(startDate, endDate) {
  const query = {
    timestamp: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  };

  const [
    totalChanges,
    changesByType,
    changesByAdmin,
    forceUpdates
  ] = await Promise.all([
    this.countDocuments(query),
    this.aggregate([
      { $match: query },
      { $group: { _id: '$changeType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    this.aggregate([
      { $match: query },
      { $group: { _id: '$adminId', adminName: { $first: '$adminName' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]),
    this.countDocuments({ ...query, changeType: 'forced_update' })
  ]);

  return {
    period: { startDate, endDate },
    totalChanges,
    changesByType,
    changesByAdmin,
    forceUpdates,
    generatedAt: new Date()
  };
};

// Static method to delete old logs (for maintenance)
auditLogSchema.statics.deleteOldLogs = async function(daysOld = 365) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  return this.deleteMany({ timestamp: { $lt: cutoffDate } });
};

module.exports = mongoose.model('AuditLog', auditLogSchema);