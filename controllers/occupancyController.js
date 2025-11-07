const Occupancy = require('../models/Occupancy');

exports.createOccupancy = async (req, res) => {
  try {
    const occupancy = new Occupancy(req.body);
    await occupancy.save();
    await occupancy.populate('roomRef');
    
    // Emit Socket.IO update
    if (req.io) {
      req.io.emit('occupancy:update', {
        roomId: occupancy.roomRef._id,
        count: occupancy.count,
        timestamp: occupancy.timestamp
      });
    }

    res.status(201).json(occupancy);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getOccupancy = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { limit = 100 } = req.query;
    
    const query = roomId ? { roomRef: roomId } : {};
    const occupancies = await Occupancy.find(query)
      .populate('roomRef')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));
    
    res.json(occupancies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.simulateOccupancy = async (req, res) => {
  try {
    const Room = require('../models/Room');
    const rooms = await Room.find({ status: 'active' }).limit(5);
    
    const occupancies = [];
    for (const room of rooms) {
      const count = Math.floor(Math.random() * room.capacity * 0.8);
      const occupancy = new Occupancy({
        roomRef: room._id,
        count,
        source: 'manual',
        timestamp: new Date()
      });
      await occupancy.save();
      await occupancy.populate('roomRef');
      occupancies.push(occupancy);
      
      // Emit Socket.IO update
      if (req.io) {
        req.io.emit('occupancy:update', {
          roomId: room._id,
          count,
          timestamp: occupancy.timestamp
        });
      }
    }

    res.json({ message: 'Occupancy simulated', occupancies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

