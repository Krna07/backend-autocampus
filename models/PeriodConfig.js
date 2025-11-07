const mongoose = require('mongoose');

const periodTimeSchema = new mongoose.Schema({
  start: { type: String, required: true },
  end: { type: String, required: true }
}, { _id: false });

const periodConfigSchema = new mongoose.Schema({
  periods: {
    type: Map,
    of: periodTimeSchema,
    default: new Map()
  },
  isActive: { type: Boolean, default: true },
  version: { type: String, default: '1.0' }
}, {
  timestamps: true
});

module.exports = mongoose.model('PeriodConfig', periodConfigSchema);


