// Test setup and configuration
require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for database operations
jest.setTimeout(30000);

// Mock Socket.IO for tests
global.io = {
  emit: jest.fn(),
  to: jest.fn().mockReturnThis()
};

// Create a minimal User model for Section middleware
const mongoose = require('mongoose');

// Only create User model if it doesn't exist
if (!mongoose.models.User) {
  const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    role: String,
    sectionRef: mongoose.Schema.Types.ObjectId
  });
  mongoose.model('User', userSchema);
}

// Suppress console logs during tests (optional)
if (process.env.SUPPRESS_TEST_LOGS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}
