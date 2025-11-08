const analyticsService = require('../services/analyticsService');

exports.getAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const analytics = await analyticsService.calculateUtilization(start, end);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPredictiveAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const analytics = await analyticsService.getPredictiveAnalytics(start, end);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAttendanceAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const analytics = await analyticsService.getAttendanceAnalytics(start, end);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getRoomHistory = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { days } = req.query;
    const history = await analyticsService.getRoomHistory(roomId, parseInt(days) || 7);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getFacultyWorkload = async (req, res) => {
  try {
    const workload = await analyticsService.getFacultyWorkload();
    res.json(workload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getRoomUsageRanking = async (req, res) => {
  try {
    const ranking = await analyticsService.getRoomUsageRanking();
    res.json(ranking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

