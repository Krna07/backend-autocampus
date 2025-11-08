// Load environment variables FIRST before anything else
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const routes = require('./routes/index');
const { initSockets } = require('./sockets/socketHandlers');
const RoomStatusScheduler = require('./services/roomStatusScheduler');

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  }
});

// Initialize Socket.IO handlers
initSockets(io);

// Make io available globally for services
global.io = io;

// Middleware
// app.use(cors({
//   origin: process.env.FRONTEND_URL || 'http://localhost:5173',
//   credentials: true
// }));
app.use(cors({
  origin: (origin, callback) => {
    callback(null, origin || '*'); // allow all origins dynamically
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Increase timeout for long-running operations (like generating all timetables)
server.timeout = 300000; // 5 minutes

// Attach io to req object
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Smart Campus API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Database connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smartcampus')
  .then(() => {
    console.log('✅ MongoDB connected');
    
    // Initialize room status scheduler
    const roomScheduler = new RoomStatusScheduler(io);
    
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Socket.IO server ready`);
      console.log(`⏰ Room status scheduler initialized`);
    });
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

module.exports = { app, server, io };

