const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Faculty = require('../models/Faculty');
const Section = require('../models/Section');

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/smartcampus";

async function seedUsers() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Get existing Faculty and Sections
    const facultyMembers = await Faculty.find();
    const sections = await Section.find();

    if (facultyMembers.length === 0) {
      console.log("⚠️  No faculty found. Please run seed.js first to create faculty.");
      await mongoose.connection.close();
      process.exit(0);
    }

    if (sections.length === 0) {
      console.log("⚠️  No sections found. Please run seed.js first to create sections.");
      await mongoose.connection.close();
      process.exit(0);
    }

    const facultyPassword = await bcrypt.hash("faculty123", 10);
    const studentPassword = await bcrypt.hash("student123", 10);

    // --- CREATE FACULTY USERS ---
    console.log("\n👨‍🏫 Creating Faculty Users...");
    let facultyUsersCreated = 0;
    let facultyUsersExisting = 0;

    for (const faculty of facultyMembers) {
      const existingUser = await User.findOne({ email: faculty.email });
      if (!existingUser) {
        await User.create({
          name: faculty.name,
          email: faculty.email,
          passwordHash: facultyPassword,
          role: "faculty",
          mobile: "9876543210"
        });
        console.log(`   ✓ Created faculty user: ${faculty.name} (${faculty.email})`);
        facultyUsersCreated++;
      } else {
        console.log(`   → Faculty user already exists: ${faculty.name}`);
        facultyUsersExisting++;
      }
    }

    console.log(`\n   📊 Faculty Users: ${facultyUsersCreated} created, ${facultyUsersExisting} already existed`);

    // --- CREATE STUDENT USERS ---
    console.log("\n🎓 Creating Student Users...");
    const firstSection = sections[0]; // Use first section for students
    
    const studentData = [
      {
        name: "Rahul Sharma",
        email: "rahul.sharma@smartcampus.edu",
        regNumber: "3YA001",
        mobile: "9876543211"
      },
      {
        name: "Priya Patel",
        email: "priya.patel@smartcampus.edu",
        regNumber: "3YA002",
        mobile: "9876543212"
      },
      {
        name: "Amit Kumar",
        email: "amit.kumar@smartcampus.edu",
        regNumber: "3YA003",
        mobile: "9876543213"
      },
      {
        name: "Sneha Reddy",
        email: "sneha.reddy@smartcampus.edu",
        regNumber: "3YA004",
        mobile: "9876543214"
      },
      {
        name: "Vikram Singh",
        email: "vikram.singh@smartcampus.edu",
        regNumber: "3YA005",
        mobile: "9876543215"
      },
      {
        name: "Ananya Desai",
        email: "ananya.desai@smartcampus.edu",
        regNumber: "3YA006",
        mobile: "9876543216"
      },
      {
        name: "Karan Mehta",
        email: "karan.mehta@smartcampus.edu",
        regNumber: "3YA007",
        mobile: "9876543217"
      },
      {
        name: "Divya Nair",
        email: "divya.nair@smartcampus.edu",
        regNumber: "3YA008",
        mobile: "9876543218"
      },
      {
        name: "Arjun Gupta",
        email: "arjun.gupta@smartcampus.edu",
        regNumber: "3YA009",
        mobile: "9876543219"
      },
      {
        name: "Isha Joshi",
        email: "isha.joshi@smartcampus.edu",
        regNumber: "3YA010",
        mobile: "9876543220"
      }
    ];

    let studentsCreated = 0;
    let studentsExisting = 0;

    for (const student of studentData) {
      const existingUser = await User.findOne({ email: student.email });
      if (!existingUser) {
        await User.create({
          name: student.name,
          email: student.email,
          passwordHash: studentPassword,
          role: "student",
          regNumber: student.regNumber,
          mobile: student.mobile,
          sectionRef: firstSection._id
        });
        console.log(`   ✓ Created student: ${student.name} (${student.regNumber})`);
        studentsCreated++;
      } else {
        console.log(`   → Student already exists: ${student.name}`);
        studentsExisting++;
      }
    }

    console.log(`\n   📊 Students: ${studentsCreated} created, ${studentsExisting} already existed`);

    // --- SUMMARY ---
    console.log("\n✅ User seeding completed!");
    console.log("\n📋 Login Credentials:");
    console.log("   Faculty: Use any faculty email / faculty123");
    console.log("   Students: Use any student email / student123");
    console.log("\n📝 Sample Faculty Emails:");
    facultyMembers.slice(0, 3).forEach(f => {
      console.log(`   - ${f.email}`);
    });
    console.log("\n📝 Sample Student Emails:");
    studentData.slice(0, 3).forEach(s => {
      console.log(`   - ${s.email}`);
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seed error:", error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

seedUsers();

