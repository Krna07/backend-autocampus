// Test EmailJS Configuration
require('dotenv').config();
const emailService = require('./services/emailService');

async function testEmail() {
  console.log('🧪 Testing EmailJS Configuration...\n');
  
  // Check environment variables
  console.log('📋 Configuration:');
  console.log('  Service ID:', process.env.EMAILJS_SERVICE_ID ? '✅ Set' : '❌ Missing');
  console.log('  Template ID:', process.env.EMAILJS_TEMPLATE_ID ? '✅ Set' : '❌ Missing');
  console.log('  Public Key:', process.env.EMAILJS_PUBLIC_KEY ? '✅ Set' : '❌ Missing');
  console.log('  Private Key:', process.env.EMAILJS_PRIVATE_KEY ? '✅ Set' : '❌ Missing');
  console.log('');
  
  // Test email data
  const testRoom = {
    code: 'TEST-101',
    name: 'Test Room',
    type: 'Classroom',
    capacity: 50,
    status: 'in_maintenance'
  };
  
  const testSessions = [
    {
      sectionName: 'CSE-3A',
      subjectName: 'Data Structures',
      facultyName: 'Dr. Test',
      day: 'Monday',
      period: 1,
      startTime: '08:15',
      endTime: '09:05'
    }
  ];
  
  const testSections = new Set(['CSE-3A']);
  const testSubjects = new Set(['Data Structures']);
  const testFaculty = new Set(['Dr. Test']);
  
  // IMPORTANT: Replace with your actual email
  const YOUR_EMAIL = 'tushar110704@gmail.com'; // ✅ Updated!
  
  console.log('📧 Sending test email to:', YOUR_EMAIL);
  console.log('');
  
  try {
    const result = await emailService.sendRoomStatusChangeEmail(
      YOUR_EMAIL,
      'Test User',
      testRoom,
      testSessions,
      testSections,
      testSubjects,
      testFaculty
    );
    
    console.log('');
    console.log('📊 Result:');
    console.log('  Success:', result.success ? '✅' : '❌');
    console.log('  Simulated:', result.simulated ? 'Yes' : 'No');
    
    if (result.success && !result.simulated) {
      console.log('  Status:', result.status);
      console.log('  Message ID:', result.messageId);
      console.log('');
      console.log('✅ Email sent successfully!');
      console.log('📬 Check your inbox at:', YOUR_EMAIL);
      console.log('⏰ It may take a few minutes to arrive.');
      console.log('📁 Also check your spam/junk folder.');
    } else if (result.simulated) {
      console.log('');
      console.log('⚠️  Email was simulated (not actually sent)');
      console.log('This means EmailJS is not properly configured.');
    } else {
      console.log('  Error:', result.error);
      console.log('');
      console.log('❌ Email failed to send!');
      console.log('');
      console.log('🔍 Troubleshooting:');
      console.log('1. Check your EmailJS dashboard: https://dashboard.emailjs.com/');
      console.log('2. Verify your Service ID, Template ID, and Keys');
      console.log('3. Make sure your EmailJS service is active');
      console.log('4. Check if you have email credits remaining (free tier: 200/month)');
      console.log('5. Verify the template exists and has the correct variables');
    }
    
  } catch (error) {
    console.error('');
    console.error('❌ Test failed with error:');
    console.error(error);
  }
}

// Run the test
testEmail().then(() => {
  console.log('');
  console.log('🏁 Test complete!');
  process.exit(0);
}).catch(error => {
  console.error('');
  console.error('💥 Test crashed:', error);
  process.exit(1);
});
