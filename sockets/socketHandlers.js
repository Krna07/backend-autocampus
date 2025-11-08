const { verifyToken } = require('../utils/auth');
const User = require('../models/User');

let ioInstance = null;

const initSockets = (io) => {
  ioInstance = io;

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      
      if (!token) {
        console.log('[Socket.IO] Connection attempt without token');
        return next(new Error('Authentication error'));
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        console.log('[Socket.IO] Invalid token provided');
        return next(new Error('Invalid token'));
      }

      const user = await User.findById(decoded.userId);
      if (!user) {
        console.log(`[Socket.IO] User not found for userId: ${decoded.userId} - Token may be from old database. User should logout and login again.`);
        return next(new Error('User not found - Please logout and login again'));
      }

      socket.userId = user._id.toString();
      socket.userRole = user.role;
      next();
    } catch (error) {
      console.error('[Socket.IO] Authentication error:', error);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId}`);

    // Join user-specific room
    socket.join(`user_${socket.userId}`);

    // Join role-specific rooms
    socket.join(`role_${socket.userRole}`);

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
    });

    // Handle custom events if needed
    socket.on('timetable:subscribe', (sectionId) => {
      socket.join(`timetable_${sectionId}`);
    });

    socket.on('room:subscribe', (roomId) => {
      socket.join(`room_${roomId}`);
    });
  });
};

// Helper function to attach io to req object
const attachIO = (req, res, next) => {
  req.io = ioInstance;
  next();
};

module.exports = { initSockets, attachIO };

