// Simple test script for Admin Timetable API
// Run with: node test-admin-timetable.js

const mongoose = require('mongoose');
const AdminTimetable = require('./models/AdminTimetable');
require('dotenv').config();

async function testAdminTimetable() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-campus');
    console.log('✅ Connected to MongoDB');

    // Test creating a new admin timetable
    const testTimetable = new AdminTimetable({
      createdBy: new mongoose.Types.ObjectId(),
      timetableData: new Map([
        ['Monday-1', {
          subject: new mongoose.Types.ObjectId(),
          teacher: new mongoose.Types.ObjectId(),
          classroom: new mongoose.Types.ObjectId()
        }],
        ['Tuesday-2', {
          subject: new mongoose.Types.ObjectId(),
          teacher: new mongoose.Types.ObjectId(),
          classroom: new mongoose.Types.ObjectId()
        }]
      ])
    });

    await testTimetable.save();
    console.log('✅ Admin timetable created successfully');

    // Test retrieving the timetable
    const retrieved = await AdminTimetable.findById(testTimetable._id);
    console.log('✅ Admin timetable retrieved successfully');
    console.log('Timetable data keys:', Array.from(retrieved.timetableData.keys()));

    // Clean up
    await AdminTimetable.findByIdAndDelete(testTimetable._id);
    console.log('✅ Test data cleaned up');

    console.log('🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
}

// Run the test
testAdminTimetable();