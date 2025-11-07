const express = require('express');
const Block = require('../models/Block');

const router = express.Router();

// Create new block
router.post("/", async (req, res) => {
  try {
    const block = new Block(req.body);
    await block.save();
    res.status(201).json(block);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all blocks
router.get("/", async (req, res) => {
  try {
    const blocks = await Block.find();
    res.json(blocks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit block details
router.put("/:blockId", async (req, res) => {
  try {
    const updated = await Block.findByIdAndUpdate(req.params.blockId, req.body, { new: true });
    if (!updated) {
      return res.status(404).json({ error: "Block not found" });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete block
router.delete("/:blockId", async (req, res) => {
  try {
    const deleted = await Block.findByIdAndDelete(req.params.blockId);
    if (!deleted) {
      return res.status(404).json({ error: "Block not found" });
    }
    res.json({ message: "Block deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new floor
router.post("/:blockId/floor", async (req, res) => {
  try {
    const { floorNumber } = req.body;
    const block = await Block.findById(req.params.blockId);
    
    if (!block) {
      return res.status(404).json({ error: "Block not found" });
    }
    
    block.floors.push({ floorNumber, rooms: [] });
    await block.save();
    res.json(block);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Edit floor (rename, etc.)
router.put("/:blockId/floor/:floorNumber", async (req, res) => {
  try {
    const { blockId, floorNumber } = req.params;
    const block = await Block.findById(blockId);
    
    if (!block) {
      return res.status(404).json({ error: "Block not found" });
    }
    
    const floor = block.floors.find(f => f.floorNumber == floorNumber);
    if (!floor) {
      return res.status(404).json({ error: "Floor not found" });
    }
    
    Object.assign(floor, req.body);
    await block.save();
    res.json(block);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete floor
router.delete("/:blockId/floor/:floorNumber", async (req, res) => {
  try {
    const { blockId, floorNumber } = req.params;
    const block = await Block.findById(blockId);
    
    if (!block) {
      return res.status(404).json({ error: "Block not found" });
    }
    
    block.floors = block.floors.filter(f => f.floorNumber != floorNumber);
    await block.save();
    res.json(block);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add room
router.post("/:blockId/floor/:floorNumber/room", async (req, res) => {
  try {
    const { blockId, floorNumber } = req.params;
    const block = await Block.findById(blockId);
    
    if (!block) {
      return res.status(404).json({ error: "Block not found" });
    }
    
    const floor = block.floors.find(f => f.floorNumber == floorNumber);
    if (!floor) {
      return res.status(404).json({ error: "Floor not found" });
    }
    
    floor.rooms.push(req.body);
    await block.save();
    res.json(block);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Edit room
router.put("/:blockId/floor/:floorNumber/room/:roomCode", async (req, res) => {
  try {
    const { blockId, floorNumber, roomCode } = req.params;
    const block = await Block.findById(blockId);
    
    if (!block) {
      return res.status(404).json({ error: "Block not found" });
    }
    
    const floor = block.floors.find(f => f.floorNumber == floorNumber);
    if (!floor) {
      return res.status(404).json({ error: "Floor not found" });
    }
    
    const room = floor.rooms.find(r => r.code == roomCode);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    
    Object.assign(room, req.body);
    await block.save();
    res.json(block);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete room
router.delete("/:blockId/floor/:floorNumber/room/:roomCode", async (req, res) => {
  try {
    const { blockId, floorNumber, roomCode } = req.params;
    const block = await Block.findById(blockId);
    
    if (!block) {
      return res.status(404).json({ error: "Block not found" });
    }
    
    const floor = block.floors.find(f => f.floorNumber == floorNumber);
    if (!floor) {
      return res.status(404).json({ error: "Floor not found" });
    }
    
    floor.rooms = floor.rooms.filter(r => r.code != roomCode);
    await block.save();
    res.json(block);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
