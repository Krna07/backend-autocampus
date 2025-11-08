const mongoose = require('mongoose');

const maintenanceWindowSchema = new mongoose.Schema({
  from: Date,
  to: Date,
  reason: String
}, { _id: false });

const roomSchema = new mongoose.Schema({
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
  building: {
    type: String,
    required: true,
    trim: true
  },
  floor: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['Classroom', 'Lab'],
    required: true
  },
  capacity: {
    type: Number,
    required: true,
    min: 1
  },
  equipment: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: ['active', 'in_maintenance', 'maintenance', 'reserved', 'closed', 'offline'],
    default: 'active'
  },
  occupancyStatus: {
    type: String,
    enum: ['idle', 'occupied', 'reserved'],
    default: 'idle'
  },
  currentSession: {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Faculty',
      default: null
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      default: null
    },
    startTime: {
      type: Date,
      default: null
    },
    endTime: {
      type: Date,
      default: null
    },
    day: {
      type: String,
      default: null
    },
    period: {
      type: Number,
      default: null
    }
  },
  allowTheoryClass: {
    type: Boolean,
    default: false
  },
  allowLabClass: {
    type: Boolean,
    default: true
  },
  maintenanceWindows: [maintenanceWindowSchema]
}, {
  timestamps: true
});

// Middleware to detect room status changes and trigger conflict detection
roomSchema.pre('save', function (next) {
  // Store the original status before save
  if (this.isModified('status')) {
    this._originalStatus = this.constructor.findOne({ _id: this._id })
      .then(doc => doc ? doc.status : null)
      .catch(() => null);
  }
  next();
});

roomSchema.post('save', async function (doc) {
  // Only trigger conflict detection if status was modified
  if (doc._originalStatus !== undefined) {
    try {
      const originalStatus = await doc._originalStatus;

      // Only process if status actually changed
      if (originalStatus && originalStatus !== doc.status) {
        console.log(`[Room Model] Status changed for room ${doc.code}: ${originalStatus} -> ${doc.status}`);

        // Import conflict detection service (lazy load to avoid circular dependency)
        const conflictDetectionService = require('../services/conflictDetectionService');

        // Trigger conflict detection asynchronously
        setImmediate(async () => {
          try {
            await conflictDetectionService.monitorRoomStatusChanges(doc, originalStatus);
          } catch (error) {
            console.error('[Room Model] Error in conflict detection:', error);
          }
        });
      }
    } catch (error) {
      console.error('[Room Model] Error processing status change:', error);
    }
  }
});

// Middleware for findOneAndUpdate
roomSchema.pre('findOneAndUpdate', async function (next) {
  // Get the update operation
  const update = this.getUpdate();

  // Check if status is being updated
  if (update.$set && update.$set.status) {
    try {
      // Find the document being updated
      const docToUpdate = await this.model.findOne(this.getQuery());

      if (docToUpdate) {
        // Store original status in the update context
        this._originalStatus = docToUpdate.status;
        this._roomDoc = docToUpdate;
      }
    } catch (error) {
      console.error('[Room Model] Error in pre-update hook:', error);
    }
  }

  next();
});

roomSchema.post('findOneAndUpdate', async function (doc) {
  // Check if we have stored original status
  if (this._originalStatus && doc) {
    const originalStatus = this._originalStatus;
    const newStatus = doc.status;

    // Only process if status actually changed
    if (originalStatus !== newStatus) {
      console.log(`[Room Model] Status changed for room ${doc.code}: ${originalStatus} -> ${newStatus}`);

      // Import conflict detection service (lazy load to avoid circular dependency)
      const conflictDetectionService = require('../services/conflictDetectionService');

      // Trigger conflict detection asynchronously
      setImmediate(async () => {
        try {
          await conflictDetectionService.monitorRoomStatusChanges(doc, originalStatus);
        } catch (error) {
          console.error('[Room Model] Error in conflict detection:', error);
        }
      });
    }
  }
});

module.exports = mongoose.model('Room', roomSchema);

