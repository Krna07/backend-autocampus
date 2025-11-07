const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Block = require('../models/Block');
const User = require('../models/User');
const Faculty = require('../models/Faculty');
const Subject = require('../models/Subject');
const Section = require('../models/Section');
const Mapping = require('../models/Mapping');
const Timetable = require('../models/Timetable');

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/smartcampus";

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Clean all collections for fresh seeding
    await Promise.all([
      Block.deleteMany(),
      User.deleteMany(),
      Faculty.deleteMany(),
      Subject.deleteMany(),
      Section.deleteMany(),
      Mapping.deleteMany(),
      Timetable.deleteMany()
    ]);
    console.log("🗑️  Cleared existing data");

    // --- BLOCKS & FLOORS ---
    const blocksData = [
      {
        name: "N-Block",
        buildingCode: "NB",
        floors: [
          {
            floorNumber: 1,
            rooms: [
              { code: "N-101", name: "Seminar Hall", type: "SeminarHall", capacity: 120 },
              { code: "N-102", name: "DBMS Lab", type: "Lab", capacity: 40 },
              { code: "N-103", name: "Compiler Lab", type: "Lab", capacity: 40 }
            ]
          },
          {
            floorNumber: 2,
            rooms: [
              { code: "N-201", name: "Classroom 201", type: "Classroom", capacity: 60 },
              { code: "N-202", name: "Staff Room", type: "StaffRoom", capacity: 12 }
            ]
          }
        ]
      },
      {
        name: "U-Block",
        buildingCode: "UB",
        floors: [
          {
            floorNumber: 1,
            rooms: [
              { code: "U-101", name: "Web Tech Lab", type: "Lab", capacity: 40 },
              { code: "U-102", name: "Microprocessor Lab", type: "Lab", capacity: 40 }
            ]
          },
          {
            floorNumber: 2,
            rooms: [
              { code: "U-201", name: "Classroom-1", type: "Classroom", capacity: 60 },
              { code: "U-202", name: "Classroom-2", type: "Classroom", capacity: 60 }
            ]
          }
        ]
      }
    ];

    const blocks = await Block.insertMany(blocksData);
    console.log("🏗️  Created blocks:", blocks.map(b => b.name).join(", "));

    // --- ADMIN USER ---
    const adminPassword = await bcrypt.hash("admin123", 10);
    const admin = await User.create({
      name: "Admin User",
      email: "admin@smartcampus.edu",
      passwordHash: adminPassword,
      role: "admin",
      mobile: "9999999999"
    });
    console.log("👑 Admin created:", admin.email);

    // --- FACULTY ---
    const faculty = await Faculty.insertMany([
      { name: "Dr. Vinoj", email: "vinoj@vignan.edu", maxHoursPerWeek: 18 },
      { name: "Ms. Bhargavi", email: "bhargavi@vignan.edu", maxHoursPerWeek: 18 },
      { name: "Mr. Amaresh", email: "amaresh@vignan.edu", maxHoursPerWeek: 18 },
      { name: "Mr. Yasir", email: "yasir@vignan.edu", maxHoursPerWeek: 18 },
      { name: "Ms. Tejaswi", email: "tejaswi@vignan.edu", maxHoursPerWeek: 18 }
    ]);
    console.log("👩‍🏫 Faculty created:", faculty.length);

    // --- SUBJECTS ---
    const subjects = await Subject.insertMany([
      { code: "CD", name: "Compiler Design", type: "Theory", weeklyPeriods: 3, preferredRoomType: "Classroom" },
      { code: "CN", name: "Computer Networks", type: "Theory", weeklyPeriods: 3, preferredRoomType: "Classroom" },
      { code: "CN-L", name: "CN Lab", type: "Lab", weeklyPeriods: 1, preferredRoomType: "Lab" },
      { code: "DMT", name: "Data Mining Techniques", type: "Theory", weeklyPeriods: 3, preferredRoomType: "Classroom" },
      { code: "MSD", name: "Microprocessor & System Design", type: "Theory", weeklyPeriods: 3, preferredRoomType: "Classroom" },
      { code: "WT", name: "Web Technologies", type: "Theory", weeklyPeriods: 3, preferredRoomType: "Classroom" }
    ]);
    console.log("📖 Subjects created:", subjects.length);

    // --- SECTION ---
    const section = await Section.create({
      name: "3rd Year A",
      year: 3,
      preferredBuildings: ["N-Block", "U-Block"],
      totalPeriodsPerWeek: 35
    });
    console.log("📚 Created section:", section.name);

    // --- MAPPINGS ---
    const mappings = await Mapping.insertMany([
      { sectionRef: section._id, subjectRef: subjects[0]._id, facultyRef: faculty[2]._id },
      { sectionRef: section._id, subjectRef: subjects[1]._id, facultyRef: faculty[0]._id },
      { sectionRef: section._id, subjectRef: subjects[2]._id, facultyRef: faculty[0]._id },
      { sectionRef: section._id, subjectRef: subjects[3]._id, facultyRef: faculty[1]._id },
      { sectionRef: section._id, subjectRef: subjects[4]._id, facultyRef: faculty[3]._id },
      { sectionRef: section._id, subjectRef: subjects[5]._id, facultyRef: faculty[4]._id }
    ]);
    console.log("🔗 Mappings done:", mappings.length);

    // --- DEMO TIMETABLE ---
    const timetable = await Timetable.create({
      sectionRef: section._id,
      version: "v1.0",
      generatedAt: new Date(),
      schedule: [
        {
          day: "Monday",
          period: 1,
          startTime: "08:15",
          endTime: "09:05",
          subjectRef: subjects[0]._id,
          facultyRef: faculty[2]._id,
          roomRef: blocks[0].floors[1].rooms[0]._id,
          note: "Theory"
        },
        {
          day: "Monday",
          period: 2,
          startTime: "09:05",
          endTime: "09:55",
          subjectRef: subjects[1]._id,
          facultyRef: faculty[0]._id,
          roomRef: blocks[1].floors[1].rooms[0]._id,
          note: "Theory"
        }
      ]
    });
    console.log("📅 Demo timetable generated for:", section.name);

    console.log("\n✅ Seed completed successfully!");
    console.log("\n📋 Summary:");
    console.log("   🏗️  Blocks: N-Block, U-Block");
    console.log("   🏢 Floors + rooms seeded dynamically");
    console.log("   👑 Admin, Faculty");
    console.log("   📚 Section, Subjects, Mappings");
    console.log("   📅 Demo Timetable");
    console.log("\n📋 Login Credentials:");
    console.log("   Admin: admin@smartcampus.edu / admin123");

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

seed();
