const Room = require('../models/Room');

class RoomStatusScheduler {
  constructor(io) {
    this.io = io;
    this.intervalId = null;
    this.init();
  }

  init() {
    try {
      // Use setInterval as a fallback if cron fails
      this.intervalId = setInterval(() => {
        this.checkExpiredSessions();
      }, 60000); // Check every minute (60000ms)

      console.log('Room status scheduler initialized with setInterval');
      
      // Also try to use cron if available
      try {
        const cron = require('node-cron');
        cron.schedule('* * * * *', () => {
          this.checkExpiredSessions();
        });
        console.log('Cron scheduler also initialized');
      } catch (cronError) {
        console.log('Cron not available, using setInterval only:', cronError.message);
      }
    } catch (error) {
      console.error('Error initializing room status scheduler:', error);
    }
  }

  destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async checkExpiredSessions() {
    try {
      const now = new Date();
      
      // Find rooms with expired sessions
      const expiredRooms = await Room.find({
        occupancyStatus: 'occupied',
        'currentSession.endTime': { $lte: now }
      });

      for (const room of expiredRooms) {
        await this.resetRoomStatus(room);
      }
    } catch (error) {
      console.error('Error checking expired sessions:', error);
    }
  }

  async resetRoomStatus(room) {
    try {
      const previousSession = { ...room.currentSession };
      
      // Reset room status
      room.occupancyStatus = 'idle';
      room.currentSession = {
        facultyId: null,
        subjectId: null,
        startTime: null,
        endTime: null,
        day: null,
        period: null
      };

      await room.save();

      console.log(`Room ${room.code} automatically reset to idle status`);

      // Emit Socket.IO update
      if (this.io) {
        this.io.emit('room:session-expired', {
          roomId: room._id,
          roomCode: room.code,
          previousSession: previousSession,
          resetTime: new Date()
        });
      }
    } catch (error) {
      console.error(`Error resetting room ${room.code} status:`, error);
    }
  }

  // Manual method to schedule a specific room reset
  scheduleRoomReset(roomId, endTime) {
    const delay = endTime.getTime() - Date.now();
    
    if (delay > 0) {
      setTimeout(async () => {
        try {
          const room = await Room.findById(roomId);
          if (room && room.occupancyStatus === 'occupied' && 
              room.currentSession.endTime && 
              new Date() >= room.currentSession.endTime) {
            
            await this.resetRoomStatus(room);
          }
        } catch (error) {
          console.error('Error in scheduled room reset:', error);
        }
      }, delay);
    }
  }

  // Get rooms that will expire soon (within next 10 minutes)
  async getRoomsExpiringSoon() {
    try {
      const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);
      
      const expiringSoonRooms = await Room.find({
        occupancyStatus: 'occupied',
        'currentSession.endTime': { 
          $gte: new Date(),
          $lte: tenMinutesFromNow 
        }
      })
      .populate('currentSession.facultyId')
      .populate('currentSession.subjectId')
      .select('_id name code currentSession');

      return expiringSoonRooms;
    } catch (error) {
      console.error('Error fetching rooms expiring soon:', error);
      return [];
    }
  }
}

module.exports = RoomStatusScheduler;