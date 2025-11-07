const Room = require('../models/Room');
const Block = require('../models/Block');
const notificationService = require('../services/notificationService');

exports.getAllRooms = async (req, res) => {
  try {
    // Fetch all blocks and flatten rooms
    const blocks = await Block.find();
    
    // Flatten all rooms from all blocks with block context
    const allRooms = [];
    
    blocks.forEach(block => {
      block.floors.forEach(floor => {
        floor.rooms.forEach(room => {
          // Transform room to match Room model format expected by frontend
          allRooms.push({
            _id: room._id,
            code: room.code,
            name: room.name,
            building: block.name, // Use block name as building
            floor: floor.floorNumber,
            type: room.type,
            capacity: room.capacity,
            equipment: room.equipment || [],
            status: room.status || 'active',
            allowTheoryClass: room.allowTheoryClass !== undefined ? room.allowTheoryClass : true,
            allowLabClass: room.allowLabClass !== undefined ? room.allowLabClass : true,
            blockId: block._id,
            blockCode: block.buildingCode,
            floorNumber: floor.floorNumber,
            createdAt: block.createdAt,
            updatedAt: block.updatedAt
          });
        });
      });
    });
    
    // Also include any legacy Room model entries (for backward compatibility)
    const legacyRooms = await Room.find({});
    legacyRooms.forEach(room => {
      allRooms.push({
        _id: room._id,
        code: room.code,
        name: room.name,
        building: room.building,
        floor: room.floor,
        type: room.type,
        capacity: room.capacity,
        equipment: room.equipment || [],
        status: room.status || 'active',
        allowTheoryClass: room.allowTheoryClass,
        allowLabClass: room.allowLabClass,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt
      });
    });
    
    // Sort by building, floor, and code
    allRooms.sort((a, b) => {
      if (a.building !== b.building) return a.building.localeCompare(b.building);
      if (a.floor !== b.floor) return a.floor - b.floor;
      return a.code.localeCompare(b.code);
    });
    
    res.json(allRooms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getRoomById = async (req, res) => {
  try {
    // First try to find in Block model
    const blocks = await Block.find();
    let foundRoom = null;
    let blockContext = null;
    let floorContext = null;
    
    for (const block of blocks) {
      for (const floor of block.floors) {
        const room = floor.rooms.id(req.params.id);
        if (room) {
          foundRoom = room;
          blockContext = block;
          floorContext = floor;
          break;
        }
      }
      if (foundRoom) break;
    }
    
    if (foundRoom) {
      // Transform to match Room model format
      const roomData = {
        _id: foundRoom._id,
        code: foundRoom.code,
        name: foundRoom.name,
        building: blockContext.name,
        floor: floorContext.floorNumber,
        type: foundRoom.type,
        capacity: foundRoom.capacity,
        equipment: foundRoom.equipment || [],
        status: foundRoom.status || 'active',
        allowTheoryClass: foundRoom.allowTheoryClass !== undefined ? foundRoom.allowTheoryClass : true,
        allowLabClass: foundRoom.allowLabClass !== undefined ? foundRoom.allowLabClass : true,
        blockId: blockContext._id,
        blockCode: blockContext.buildingCode,
        floorNumber: floorContext.floorNumber
      };
      return res.json(roomData);
    }
    
    // Fallback to legacy Room model
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createRoom = async (req, res) => {
  try {
    const room = new Room(req.body);
    await room.save();
    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateRoom = async (req, res) => {
  try {
    // First, try to find room in Block model
    const blocks = await Block.find();
    let foundRoom = null;
    let blockContext = null;
    let floorContext = null;
    
    for (const block of blocks) {
      for (const floor of block.floors) {
        const room = floor.rooms.id(req.params.id);
        if (room) {
          foundRoom = room;
          blockContext = block;
          floorContext = floor;
          break;
        }
      }
      if (foundRoom) break;
    }
    
    if (foundRoom) {
      // Update room in Block model - only update room-specific fields
      // Filter out fields that shouldn't be updated (building, floor, blockId, etc.)
      const { building, floor, blockId, blockCode, floorNumber, ...roomUpdateData } = req.body;
      Object.assign(foundRoom, roomUpdateData);
      await blockContext.save();
      
      // Transform to match Room model format for response
      const updatedRoom = {
        _id: foundRoom._id,
        code: foundRoom.code,
        name: foundRoom.name,
        building: blockContext.name,
        floor: floorContext.floorNumber,
        type: foundRoom.type,
        capacity: foundRoom.capacity,
        equipment: foundRoom.equipment || [],
        status: foundRoom.status || 'active',
        allowTheoryClass: foundRoom.allowTheoryClass !== undefined ? foundRoom.allowTheoryClass : true,
        allowLabClass: foundRoom.allowLabClass !== undefined ? foundRoom.allowLabClass : true,
        blockId: blockContext._id,
        blockCode: blockContext.buildingCode,
        floorNumber: floorContext.floorNumber
      };
      
      // Notify about status changes
      if (req.body.status) {
        await notificationService.notifyRoomStatusChange(updatedRoom, req.io);
      }
      
      return res.json(updatedRoom);
    }
    
    // Fallback to legacy Room model
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Notify about status changes
    if (req.body.status) {
      await notificationService.notifyRoomStatusChange(room, req.io);
    }

    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteRoom = async (req, res) => {
  try {
    // First, try to find room in Block model
    const blocks = await Block.find();
    let foundRoom = null;
    let blockContext = null;
    let floorContext = null;
    
    for (const block of blocks) {
      for (const floor of block.floors) {
        const room = floor.rooms.id(req.params.id);
        if (room) {
          foundRoom = room;
          blockContext = block;
          floorContext = floor;
          break;
        }
      }
      if (foundRoom) break;
    }
    
    if (foundRoom) {
      // Delete room from Block model
      floorContext.rooms = floorContext.rooms.filter(r => r._id.toString() !== req.params.id);
      await blockContext.save();
      return res.json({ message: 'Room deleted successfully' });
    }
    
    // Fallback to legacy Room model
    const room = await Room.findByIdAndDelete(req.params.id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

