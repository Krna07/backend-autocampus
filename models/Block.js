
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  code: String,
  name: String,
  type: {
    type: String,
    enum: ["Classroom", "Lab", "StaffRoom", "SeminarHall", "ConferenceHall"],
    default: "Classroom"
  },
  capacity: Number,
  equipment: [String],
  allowTheoryClass: { type: Boolean, default: true },
  allowLabClass: { type: Boolean, default: true },
  status: { type: String, enum: ["active", "maintenance", "offline"], default: "active" },
});

const floorSchema = new mongoose.Schema({
  floorNumber: Number,
  rooms: [roomSchema],
});

const blockSchema = new mongoose.Schema({
  name: String,           // e.g., "N-Block"
  buildingCode: String,   // e.g., "NB"
  floors: [floorSchema],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Block", blockSchema);

