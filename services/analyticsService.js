const Room = require('../models/Room');
const Timetable = require('../models/Timetable');
const Occupancy = require('../models/Occupancy');
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

class AnalyticsService {
  async calculateUtilization(startDate, endDate) {
    try {
      const rooms = await Room.find({ status: 'active' });
      const timetables = await Timetable.find({ isPublished: true })
        .populate('schedule.roomRef')
        .populate('schedule.subjectRef')
        .populate('schedule.facultyRef');

      const occupancies = await Occupancy.find({
        timestamp: { $gte: startDate, $lte: endDate }
      }).populate('roomRef');

      const heatmap = {};
      const roomStats = {};
      const idleRooms = [];
      const overloadedRooms = [];

      // Initialize heatmap and stats for all rooms
      rooms.forEach(room => {
        heatmap[room._id.toString()] = {};
        DAYS.forEach(day => {
          heatmap[room._id.toString()][day] = {};
          for (let period = 1; period <= 8; period++) {
            heatmap[room._id.toString()][day][period] = 0;
          }
        });
        roomStats[room._id.toString()] = {
          totalMinutes: 0,
          occupiedMinutes: 0,
          utilization: 0,
          room: room
        };
      });

      // Calculate from timetables
      const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      const minutesPerPeriod = 50;
      const totalPeriodsPerWeek = 6 * 8; // 6 days, 8 periods
      const totalAvailableMinutes = totalDays * totalPeriodsPerWeek * minutesPerPeriod;

      timetables.forEach(timetable => {
        timetable.schedule.forEach(session => {
          const roomId = session.roomRef._id.toString();
          const day = session.day;
          const period = session.period;

          if (heatmap[roomId] && heatmap[roomId][day]) {
            // Calculate occupancy percentage for this slot
            const weeks = Math.ceil(totalDays / 7);
            const occupiedMinutes = weeks * minutesPerPeriod;
            heatmap[roomId][day][period] = Math.min(100, (occupiedMinutes / totalAvailableMinutes) * 100);
            
            roomStats[roomId].occupiedMinutes += occupiedMinutes;
          }
        });
      });

      // Calculate from occupancy logs
      occupancies.forEach(occupancy => {
        const roomId = occupancy.roomRef._id.toString();
        if (roomStats[roomId]) {
          roomStats[roomId].occupiedMinutes += 10; // Assume 10 minutes per log entry
        }
      });

      // Calculate utilization percentages
      Object.keys(roomStats).forEach(roomId => {
        const stats = roomStats[roomId];
        stats.totalMinutes = totalAvailableMinutes;
        stats.utilization = (stats.occupiedMinutes / stats.totalMinutes) * 100;
        
        if (stats.utilization < 20) {
          idleRooms.push({
            room: stats.room,
            utilization: stats.utilization.toFixed(2)
          });
        }
        
        if (stats.utilization > 90) {
          overloadedRooms.push({
            room: stats.room,
            utilization: stats.utilization.toFixed(2)
          });
        }
      });

      // Generate suggestions
      const suggestions = this.generateSuggestions(roomStats, timetables);

      return {
        heatmap,
        roomStats,
        idleRooms: idleRooms.sort((a, b) => parseFloat(a.utilization) - parseFloat(b.utilization)),
        overloadedRooms: overloadedRooms.sort((a, b) => parseFloat(b.utilization) - parseFloat(a.utilization)),
        suggestions
      };
    } catch (error) {
      throw new Error(`Analytics calculation failed: ${error.message}`);
    }
  }

  generateSuggestions(roomStats, timetables) {
    const suggestions = [];
    
    // Find underutilized and overutilized rooms
    const underutilized = Object.values(roomStats)
      .filter(s => s.utilization < 30)
      .sort((a, b) => a.utilization - b.utilization);
    
    const overutilized = Object.values(roomStats)
      .filter(s => s.utilization > 85)
      .sort((a, b) => b.utilization - a.utilization);

    // Suggest moving sessions from overutilized to underutilized
    if (overutilized.length > 0 && underutilized.length > 0) {
      const fromRoom = overutilized[0].room;
      const toRoom = underutilized[0].room;

      // Find sessions in overutilized room
      const sessionsToMove = [];
      timetables.forEach(timetable => {
        timetable.schedule.forEach(session => {
          if (session.roomRef._id.toString() === fromRoom._id.toString()) {
            sessionsToMove.push({
              section: timetable.sectionRef,
              subject: session.subjectRef,
              day: session.day,
              period: session.period
            });
          }
        });
      });

      if (sessionsToMove.length > 0) {
        suggestions.push({
          fromRoom: fromRoom.code,
          toRoom: toRoom.code,
          reason: `Redistribute load: ${fromRoom.code} is ${overutilized[0].utilization.toFixed(2)}% utilized, ${toRoom.code} is ${underutilized[0].utilization.toFixed(2)}% utilized`,
          sessionsAffected: sessionsToMove.length
        });
      }
    }

    // Suggest consolidating similar rooms
    const similarRooms = this.findSimilarRooms(roomStats);
    if (similarRooms.length > 0) {
      suggestions.push({
        fromRoom: similarRooms[0].code,
        toRoom: similarRooms[1].code,
        reason: 'Similar capacity and type - consider consolidating',
        sessionsAffected: 0
      });
    }

    return suggestions;
  }

  findSimilarRooms(roomStats) {
    const rooms = Object.values(roomStats).map(s => s.room);
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        if (rooms[i].type === rooms[j].type &&
            Math.abs(rooms[i].capacity - rooms[j].capacity) <= 5) {
          return [rooms[i], rooms[j]];
        }
      }
    }
    return [];
  }

  async getRoomHistory(roomId, days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const occupancies = await Occupancy.find({
        roomRef: roomId,
        timestamp: { $gte: startDate }
      }).sort({ timestamp: 1 });

      return occupancies;
    } catch (error) {
      throw new Error(`Failed to fetch room history: ${error.message}`);
    }
  }

  // New method for predictive analytics
  async getPredictiveAnalytics(startDate, endDate) {
    try {
      const currentAnalytics = await this.calculateUtilization(startDate, endDate);
      
      // Predict future demand based on historical patterns
      const predictions = await this.predictFutureDemand(currentAnalytics);
      
      // Identify optimization opportunities
      const optimizations = await this.identifyOptimizations(currentAnalytics);
      
      // Calculate cost savings potential
      const costSavings = this.calculateCostSavings(currentAnalytics, optimizations);

      return {
        ...currentAnalytics,
        predictions,
        optimizations,
        costSavings,
        insights: this.generateInsights(currentAnalytics, predictions)
      };
    } catch (error) {
      throw new Error(`Predictive analytics failed: ${error.message}`);
    }
  }

  async predictFutureDemand(currentAnalytics) {
    const predictions = {
      nextWeekDemand: {},
      peakHours: [],
      lowDemandPeriods: [],
      seasonalTrends: {}
    };

    // Analyze current patterns to predict next week
    Object.keys(currentAnalytics.roomStats).forEach(roomId => {
      const stats = currentAnalytics.roomStats[roomId];
      const room = stats.room;
      
      // Simple prediction based on current utilization
      let predictedUtilization = stats.utilization;
      
      // Adjust based on room type
      if (room.type === 'Lab') {
        predictedUtilization *= 1.1; // Labs tend to increase in demand
      } else {
        predictedUtilization *= 0.95; // Classrooms might decrease slightly
      }
      
      predictions.nextWeekDemand[roomId] = {
        roomCode: room.code,
        currentUtilization: stats.utilization,
        predictedUtilization: Math.min(100, predictedUtilization),
        trend: predictedUtilization > stats.utilization ? 'increasing' : 'decreasing'
      };
    });

    // Identify peak hours based on heatmap
    const hourlyDemand = {};
    Object.values(currentAnalytics.heatmap).forEach(roomData => {
      Object.values(roomData).forEach(dayData => {
        Object.entries(dayData).forEach(([period, utilization]) => {
          if (!hourlyDemand[period]) hourlyDemand[period] = 0;
          hourlyDemand[period] += utilization;
        });
      });
    });

    predictions.peakHours = Object.entries(hourlyDemand)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([period, demand]) => ({
        period: parseInt(period),
        demandLevel: demand,
        timeSlot: this.getPeriodTimeSlot(parseInt(period))
      }));

    predictions.lowDemandPeriods = Object.entries(hourlyDemand)
      .sort(([,a], [,b]) => a - b)
      .slice(0, 3)
      .map(([period, demand]) => ({
        period: parseInt(period),
        demandLevel: demand,
        timeSlot: this.getPeriodTimeSlot(parseInt(period))
      }));

    return predictions;
  }

  async identifyOptimizations(analytics) {
    const optimizations = [];

    // Room consolidation opportunities
    const underutilizedRooms = analytics.idleRooms.filter(r => parseFloat(r.utilization) < 15);
    if (underutilizedRooms.length > 0) {
      optimizations.push({
        type: 'consolidation',
        priority: 'high',
        description: `${underutilizedRooms.length} rooms are severely underutilized (<15%)`,
        potentialSavings: underutilizedRooms.length * 1000, // Estimated monthly savings per room
        rooms: underutilizedRooms.map(r => r.room.code),
        action: 'Consider consolidating classes or repurposing these rooms'
      });
    }

    // Capacity mismatch optimization
    const timetables = await Timetable.find({ isPublished: true })
      .populate('schedule.roomRef')
      .populate('sectionRef');

    const capacityMismatches = [];
    timetables.forEach(timetable => {
      const sectionSize = timetable.sectionRef?.strength || 30;
      timetable.schedule.forEach(session => {
        const room = session.roomRef;
        if (room && room.capacity > sectionSize * 1.5) {
          capacityMismatches.push({
            room: room.code,
            capacity: room.capacity,
            sectionSize: sectionSize,
            wastedCapacity: room.capacity - sectionSize
          });
        }
      });
    });

    if (capacityMismatches.length > 0) {
      optimizations.push({
        type: 'capacity_optimization',
        priority: 'medium',
        description: `${capacityMismatches.length} sessions are using oversized rooms`,
        potentialSavings: capacityMismatches.length * 200,
        mismatches: capacityMismatches.slice(0, 5),
        action: 'Move small classes to appropriately sized rooms'
      });
    }

    // Equipment utilization
    const rooms = await Room.find({ status: 'active' });
    const equipmentUnderutilized = rooms.filter(room => 
      room.equipment && room.equipment.length > 0 && 
      analytics.roomStats[room._id.toString()]?.utilization < 30
    );

    if (equipmentUnderutilized.length > 0) {
      optimizations.push({
        type: 'equipment_optimization',
        priority: 'low',
        description: `${equipmentUnderutilized.length} rooms with special equipment are underutilized`,
        potentialSavings: equipmentUnderutilized.length * 500,
        rooms: equipmentUnderutilized.map(r => ({
          code: r.code,
          equipment: r.equipment,
          utilization: analytics.roomStats[r._id.toString()]?.utilization || 0
        })),
        action: 'Schedule more classes requiring this equipment or relocate equipment'
      });
    }

    return optimizations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  calculateCostSavings(analytics, optimizations) {
    const totalPotentialSavings = optimizations.reduce((sum, opt) => sum + opt.potentialSavings, 0);
    
    return {
      monthly: totalPotentialSavings,
      annual: totalPotentialSavings * 12,
      breakdown: optimizations.map(opt => ({
        type: opt.type,
        monthlySavings: opt.potentialSavings,
        description: opt.description
      }))
    };
  }

  generateInsights(analytics, predictions) {
    const insights = [];

    // Utilization insights
    const avgUtilization = Object.values(analytics.roomStats)
      .reduce((sum, stat) => sum + stat.utilization, 0) / Object.keys(analytics.roomStats).length;

    insights.push({
      type: 'utilization',
      title: 'Overall Room Utilization',
      value: `${avgUtilization.toFixed(1)}%`,
      description: avgUtilization < 50 ? 
        'Rooms are significantly underutilized. Consider consolidation.' :
        avgUtilization > 80 ?
        'Rooms are highly utilized. Consider expansion or optimization.' :
        'Room utilization is at a healthy level.',
      trend: 'stable'
    });

    // Peak demand insights
    if (predictions.peakHours.length > 0) {
      const peakPeriod = predictions.peakHours[0];
      insights.push({
        type: 'demand',
        title: 'Peak Demand Period',
        value: `Period ${peakPeriod.period}`,
        description: `Highest demand occurs during ${peakPeriod.timeSlot}. Consider scheduling flexibility.`,
        trend: 'peak'
      });
    }

    // Efficiency insights
    const efficientRooms = Object.values(analytics.roomStats)
      .filter(stat => stat.utilization >= 60 && stat.utilization <= 85).length;
    
    insights.push({
      type: 'efficiency',
      title: 'Efficiently Used Rooms',
      value: `${efficientRooms}/${Object.keys(analytics.roomStats).length}`,
      description: `${efficientRooms} rooms are operating at optimal efficiency (60-85% utilization).`,
      trend: 'optimal'
    });

    return insights;
  }

  getPeriodTimeSlot(period) {
    const timeSlots = {
      1: '08:00-08:50',
      2: '09:00-09:50', 
      3: '10:10-10:30',
      4: '10:30-11:20',
      5: '12:40-13:40',
      6: '13:40-14:30',
      7: '14:30-15:20',
      8: '15:30-16:20'
    };
    return timeSlots[period] || 'Unknown';
  }

  // New method for attendance analytics
  async getAttendanceAnalytics(startDate, endDate) {
    try {
      const Attendance = require('../models/Attendance');
      
      const attendanceRecords = await Attendance.find({
        date: { $gte: startDate, $lte: endDate }
      })
      .populate('roomId', 'code name')
      .populate('subjectId', 'name')
      .populate('studentId', 'name');

      const analytics = {
        totalSessions: 0,
        totalStudents: new Set(),
        attendanceRate: 0,
        roomAttendance: {},
        subjectAttendance: {},
        dailyTrends: {},
        lateArrivals: 0
      };

      // Process attendance data
      attendanceRecords.forEach(record => {
        analytics.totalStudents.add(record.studentId._id.toString());
        
        // Room-wise attendance
        const roomCode = record.roomId.code;
        if (!analytics.roomAttendance[roomCode]) {
          analytics.roomAttendance[roomCode] = { present: 0, total: 0 };
        }
        analytics.roomAttendance[roomCode].total++;
        if (record.status === 'present' || record.status === 'late') {
          analytics.roomAttendance[roomCode].present++;
        }

        // Subject-wise attendance
        const subjectName = record.subjectId.name;
        if (!analytics.subjectAttendance[subjectName]) {
          analytics.subjectAttendance[subjectName] = { present: 0, total: 0 };
        }
        analytics.subjectAttendance[subjectName].total++;
        if (record.status === 'present' || record.status === 'late') {
          analytics.subjectAttendance[subjectName].present++;
        }

        // Daily trends
        const dateKey = record.date.toISOString().split('T')[0];
        if (!analytics.dailyTrends[dateKey]) {
          analytics.dailyTrends[dateKey] = { present: 0, total: 0 };
        }
        analytics.dailyTrends[dateKey].total++;
        if (record.status === 'present' || record.status === 'late') {
          analytics.dailyTrends[dateKey].present++;
        }

        // Late arrivals
        if (record.status === 'late') {
          analytics.lateArrivals++;
        }
      });

      // Calculate rates
      analytics.totalStudents = analytics.totalStudents.size;
      analytics.totalSessions = attendanceRecords.length;
      analytics.attendanceRate = analytics.totalSessions > 0 ? 
        ((attendanceRecords.filter(r => r.status !== 'absent').length / analytics.totalSessions) * 100).toFixed(1) : 0;

      // Calculate room attendance rates
      Object.keys(analytics.roomAttendance).forEach(room => {
        const data = analytics.roomAttendance[room];
        data.rate = ((data.present / data.total) * 100).toFixed(1);
      });

      // Calculate subject attendance rates
      Object.keys(analytics.subjectAttendance).forEach(subject => {
        const data = analytics.subjectAttendance[subject];
        data.rate = ((data.present / data.total) * 100).toFixed(1);
      });

      return analytics;
    } catch (error) {
      throw new Error(`Attendance analytics failed: ${error.message}`);
    }
  }
}

module.exports = new AnalyticsService();

