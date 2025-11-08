const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Section = require('../models/Section');
require('dotenv').config();

const sampleStudents = [
  {
    name: 'Arjun Sharma',
    email: 'arjun.sharma@student.edu',
    regNumber: 'CS2024001',
    rollNumber: '001',
    mobile: '9876543210',
    studentInfo: {
      dateOfBirth: new Date('2003-05-15'),
      gender: 'Male',
      address: {
        street: '123 Main Street',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
        country: 'India'
      },
      parentContact: {
        fatherName: 'Rajesh Sharma',
        motherName: 'Priya Sharma',
        guardianPhone: '9876543211',
        emergencyContact: '9876543212'
      },
      academicInfo: {
        admissionYear: 2024,
        currentSemester: 1,
        cgpa: 8.5,
        previousEducation: 'Intermediate - MPC'
      }
    }
  },
  {
    name: 'Priya Reddy',
    email: 'priya.reddy@student.edu',
    regNumber: 'CS2024002',
    rollNumber: '002',
    mobile: '9876543213',
    studentInfo: {
      dateOfBirth: new Date('2003-08-22'),
      gender: 'Female',
      address: {
        street: '456 Park Avenue',
        city: 'Vijayawada',
        state: 'Andhra Pradesh',
        pincode: '520001',
        country: 'India'
      },
      parentContact: {
        fatherName: 'Venkat Reddy',
        motherName: 'Lakshmi Reddy',
        guardianPhone: '9876543214',
        emergencyContact: '9876543215'
      },
      academicInfo: {
        admissionYear: 2024,
        currentSemester: 1,
        cgpa: 9.2,
        previousEducation: 'Intermediate - MPC'
      }
    }
  },
  {
    name: 'Kiran Kumar',
    email: 'kiran.kumar@student.edu',
    regNumber: 'CS2024003',
    rollNumber: '003',
    mobile: '9876543216',
    studentInfo: {
      dateOfBirth: new Date('2003-12-10'),
      gender: 'Male',
      address: {
        street: '789 College Road',
        city: 'Guntur',
        state: 'Andhra Pradesh',
        pincode: '522001',
        country: 'India'
      },
      parentContact: {
        fatherName: 'Ravi Kumar',
        motherName: 'Sita Kumar',
        guardianPhone: '9876543217',
        emergencyContact: '9876543218'
      },
      academicInfo: {
        admissionYear: 2024,
        currentSemester: 1,
        cgpa: 7.8,
        previousEducation: 'Intermediate - MPC'
      }
    }
  },
  {
    name: 'Sneha Patel',
    email: 'sneha.patel@student.edu',
    regNumber: 'CS2024004',
    rollNumber: '004',
    mobile: '9876543219',
    studentInfo: {
      dateOfBirth: new Date('2003-03-18'),
      gender: 'Female',
      address: {
        street: '321 University Lane',
        city: 'Visakhapatnam',
        state: 'Andhra Pradesh',
        pincode: '530001',
        country: 'India'
      },
      parentContact: {
        fatherName: 'Suresh Patel',
        motherName: 'Meera Patel',
        guardianPhone: '9876543220',
        emergencyContact: '9876543221'
      },
      academicInfo: {
        admissionYear: 2024,
        currentSemester: 1,
        cgpa: 8.9,
        previousEducation: 'Intermediate - MPC'
      }
    }
  },
  {
    name: 'Rahul Gupta',
    email: 'rahul.gupta@student.edu',
    regNumber: 'CS2024005',
    rollNumber: '005',
    mobile: '9876543222',
    studentInfo: {
      dateOfBirth: new Date('2003-07-25'),
      gender: 'Male',
      address: {
        street: '654 Tech Park',
        city: 'Warangal',
        state: 'Telangana',
        pincode: '506001',
        country: 'India'
      },
      parentContact: {
        fatherName: 'Mohan Gupta',
        motherName: 'Radha Gupta',
        guardianPhone: '9876543223',
        emergencyContact: '9876543224'
      },
      academicInfo: {
        admissionYear: 2024,
        currentSemester: 1,
        cgpa: 8.1,
        previousEducation: 'Intermediate - MPC'
      }
    }
  }
];

async function seedStudents() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smartcampus');
    console.log('✅ Connected to MongoDB');

    // Find or create a sample section
    let section = await Section.findOne({ name: 'CSE-A' });

    if (!section) {
      section = new Section({
        name: 'CSE-A',
        code: 'CSE-A-2024',
        department: 'Computer Science Engineering',
        year: 1,
        semester: 1,
        academicYear: '2024-2025',
        strength: 0,
        maxStrength: 60,
        totalPeriodsPerWeek: 30,
        preferredBuildings: ['Main Block', 'CS Block'],
        isActive: true
      });
      await section.save();
      console.log('✅ Created sample section: CSE-A');
    }

    // Clear existing students for this section
    await User.deleteMany({
      role: 'student',
      sectionRef: section._id
    });
    console.log('🧹 Cleared existing students');

    // Create students
    const hashedPassword = await bcrypt.hash('student123', 10);

    for (const studentData of sampleStudents) {
      const student = new User({
        ...studentData,
        role: 'student',
        passwordHash: hashedPassword,
        sectionRef: section._id,
        isActive: true,
        isVerified: true,
        profile: {
          preferences: {
            notifications: {
              email: true,
              sms: false,
              push: true
            },
            language: 'en',
            timezone: 'Asia/Kolkata'
          }
        }
      });

      await student.save();
      console.log(`✅ Created student: ${student.name} (${student.regNumber})`);
    }

    // Update section strength
    const studentCount = await User.countDocuments({
      role: 'student',
      sectionRef: section._id,
      isActive: true
    });

    section.strength = studentCount;
    await section.save();
    console.log(`✅ Updated section strength: ${studentCount}`);

    console.log('\n🎉 Student seeding completed successfully!');
    console.log('\n📋 Sample Login Credentials:');
    console.log('Email: arjun.sharma@student.edu');
    console.log('Password: student123');
    console.log('\nOther students:');
    sampleStudents.forEach(student => {
      console.log(`- ${student.email} (Password: student123)`);
    });

  } catch (error) {
    console.error('❌ Error seeding students:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
  }
}

// Run the seed function
if (require.main === module) {
  seedStudents();
}

module.exports = seedStudents;