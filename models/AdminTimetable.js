const mongoose = require('mongoose');

const adminTimetableSchema = new mongoose.Schema({
    // Store timetable data as key-value pairs where key is "Day-Period" format
    timetableData: {
        type: Map,
        of: {
            subject: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Subject',
                default: null
            },
            teacher: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Faculty',
                default: null
            },
            classroom: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Room',
                default: null
            }
        },
        default: new Map()
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lastModified: {
        type: Date,
        default: Date.now
    },
    version: {
        type: String,
        default: '1.0'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Update lastModified on save
adminTimetableSchema.pre('save', function (next) {
    this.lastModified = new Date();
    next();
});

module.exports = mongoose.model('AdminTimetable', adminTimetableSchema);