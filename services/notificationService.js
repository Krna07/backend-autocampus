const User = require('../models/User');
const Notification = require('../models/Notification');
const emailService = require('./emailService');

class NotificationService {
  constructor() {
    // EmailJS is now handled by emailService
    console.log('✅ NotificationService initialized with EmailJS');
  }

  // Helper method to create and send notifications
  async createAndSendNotification(userId, title, message, type = 'general', data = {}, priority = 'medium', io = null) {
    try {
      // Save notification to database
      const notification = await Notification.createNotification(userId, title, message, type, data, priority);

      // Send real-time notification via Socket.IO
      if (io) {
        const userIdStr = userId.toString();
        console.log(`Sending notification to user_${userIdStr}: ${title}`);

        io.to(`user_${userIdStr}`).emit('notification:new', {
          id: notification._id,
          title,
          message,
          type,
          data,
          priority,
          timestamp: notification.createdAt
        });

        // Also emit unread count update
        const unreadCount = await Notification.countDocuments({
          userId,
          isRead: false
        });

        io.to(`user_${userIdStr}`).emit('notification:unread-count', {
          unreadCount
        });
      }

      return { success: true, notification };
    } catch (error) {
      console.error('Error creating notification:', error);
      return { success: false, error: error.message };
    }
  }

  async notifyTimetablePublished(timetable, io) {
    try {
      const section = await require('../models/Section').findById(timetable.sectionRef);
      if (!section) {
        console.error('Section not found for timetable:', timetable.sectionRef);
        return { success: false, error: 'Section not found' };
      }

      // Get all users in this section (students and faculty)
      const users = await User.find({
        $or: [
          { sectionRef: timetable.sectionRef },
          { role: 'faculty' }
        ]
      });

      if (users.length === 0) {
        console.log('No users found to notify for timetable publication');
        return { success: true, notified: 0 };
      }

      const subject = `Timetable Published - ${section.name}`;
      const html = `
        <h2>Timetable Published</h2>
        <p>The timetable for <strong>${section.name}</strong> has been published.</p>
        <p>Please check your dashboard for the updated schedule.</p>
        <p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/timetable">View Timetable</a></p>
      `;

      // Send emails and create notifications
      let emailsSent = 0;
      let notificationsCreated = 0;

      const title = `Timetable Published - ${section.name}`;
      const message = `Timetable for ${section.name} has been published`;
      const notificationData = {
        sectionName: section.name,
        sectionId: section._id,
        timetableId: timetable._id
      };

      for (const user of users) {
        if (user.email) {
          const result = await this.sendEmail(user.email, subject, html);
          if (result.success) emailsSent++;
        }

        // Create and send notification
        const notificationResult = await this.createAndSendNotification(
          user._id,
          title,
          message,
          'timetable_published',
          notificationData,
          'high',
          io
        );

        if (notificationResult.success) {
          notificationsCreated++;
        }
      }

      // Emit Socket.IO events
      if (io) {

        // Broadcast timetable update
        io.emit('timetable:update', {
          sectionId: timetable.sectionRef,
          change: 'published',
          timetable: timetable
        });
      }

      console.log(`Notified ${users.length} users about timetable publication (${emailsSent} emails, ${notificationsCreated} notifications created)`);
      return { success: true, notified: users.length, emailsSent, notificationsCreated };
    } catch (error) {
      console.error('Notification error:', error);
      return { success: false, error: error.message };
    }
  }

  async notifyFacultySchedulesOnGenerate(timetable, io) {
    try {
      // Build sessions by faculty
      const sessionsByFaculty = new Map();
      for (const session of timetable.schedule) {
        const fid = session.facultyRef?.toString?.() || (session.facultyRef && session.facultyRef._id?.toString?.());
        if (!fid) continue;
        if (!sessionsByFaculty.has(fid)) sessionsByFaculty.set(fid, []);
        sessionsByFaculty.get(fid).push({
          day: session.day,
          period: session.period,
          startTime: session.startTime,
          endTime: session.endTime,
          subjectId: session.subjectRef,
          roomId: session.roomRef
        });
      }

      const User = require('../models/User');
      const Faculty = require('../models/Faculty');
      const Room = require('../models/Room');
      const Subject = require('../models/Subject');

      for (const [facultyId, sessions] of sessionsByFaculty.entries()) {
        const faculty = await Faculty.findById(facultyId);
        if (!faculty) continue;
        const user = await User.findOne({ email: faculty.email, role: 'faculty' });

        // Hydrate subject/room names minimally for email
        const subjectIds = [...new Set(sessions.map(s => s.subjectId))];
        const roomIds = [...new Set(sessions.map(s => s.roomId))];
        const subjects = await Subject.find({ _id: { $in: subjectIds } }).select('_id name');
        const rooms = await Room.find({ _id: { $in: roomIds } }).select('_id code name');
        const subjectMap = new Map(subjects.map(s => [s._id.toString(), s.name]));
        const roomMap = new Map(rooms.map(r => [r._id.toString(), `${r.code} - ${r.name}`]));

        const sorted = sessions.sort((a, b) => a.day.localeCompare(b.day) || a.period - b.period);
        const htmlRows = sorted.map(s => `
          <tr>
            <td style="padding:6px 8px;border:1px solid #eee">${s.day}</td>
            <td style="padding:6px 8px;border:1px solid #eee">${s.period}</td>
            <td style="padding:6px 8px;border:1px solid #eee">${s.startTime} - ${s.endTime}</td>
            <td style="padding:6px 8px;border:1px solid #eee">${subjectMap.get(String(s.subjectId)) || 'Subject'}</td>
            <td style="padding:6px 8px;border:1px solid #eee">${roomMap.get(String(s.roomId)) || 'Room'}</td>
          </tr>
        `).join('');

        const html = `
          <h2>Your Generated Schedule</h2>
          <p>Here is your latest generated timetable. It may be updated when published.</p>
          <table style="border-collapse:collapse;border:1px solid #eee">
            <thead>
              <tr>
                <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Day</th>
                <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Period</th>
                <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Time</th>
                <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Subject</th>
                <th style="padding:6px 8px;border:1px solid #eee;text-align:left">Room</th>
              </tr>
            </thead>
            <tbody>${htmlRows}</tbody>
          </table>
        `;

        if (faculty.email) {
          await this.sendEmail(faculty.email, 'Your Generated Timetable', html);
        }

        if (io && user) {
          const userIdStr = user._id.toString();
          const notificationMessage = `Your timetable has been generated with ${sessions.length} assigned period${sessions.length !== 1 ? 's' : ''}`;

          console.log(`Sending timetable notification to user_${userIdStr} for faculty ${faculty.name}`);

          // Emit notification:new for the NotificationCard component
          io.to(`user_${userIdStr}`).emit('notification:new', {
            message: notificationMessage,
            type: 'timetable_generated',
            timestamp: new Date()
          });

          // Also emit timetable:faculty-generated for specific handling
          io.to(`user_${userIdStr}`).emit('timetable:faculty-generated', {
            message: 'Your timetable has been generated',
            sessions: sorted,
            timestamp: new Date()
          });
        } else if (io && !user) {
          console.warn(`User not found for faculty ${faculty.name} (${faculty.email})`);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('notifyFacultySchedulesOnGenerate error:', error);
      return { success: false, error: error.message };
    }
  }

  async notifyRoomStatusChange(room, io) {
    try {
      const Timetable = require('../models/Timetable');
      const Section = require('../models/Section');
      const Subject = require('../models/Subject');
      const Faculty = require('../models/Faculty');
      
      // Find all timetables that use this room
      const affectedTimetables = await Timetable.find({
        'schedule.roomRef': room._id,
        isPublished: true
      })
      .populate('sectionRef', 'name year')
      .populate('schedule.subjectRef', 'name code')
      .populate('schedule.facultyRef', 'name email');

      // Get detailed information about affected sessions
      const affectedSessions = [];
      const affectedSections = new Set();
      const affectedSubjects = new Set();
      const affectedFaculty = new Set();

      affectedTimetables.forEach(timetable => {
        timetable.schedule.forEach(session => {
          if (session.roomRef && session.roomRef.toString() === room._id.toString()) {
            affectedSessions.push({
              timetableId: timetable._id,
              sectionName: timetable.sectionRef?.name || 'Unknown',
              sectionYear: timetable.sectionRef?.year || 'Unknown',
              subjectName: session.subjectRef?.name || 'Unknown',
              subjectCode: session.subjectRef?.code || 'Unknown',
              facultyName: session.facultyRef?.name || 'Unknown',
              facultyEmail: session.facultyRef?.email || 'Unknown',
              day: session.day,
              period: session.period,
              startTime: session.startTime,
              endTime: session.endTime
            });
            
            if (timetable.sectionRef?.name) affectedSections.add(timetable.sectionRef.name);
            if (session.subjectRef?.name) affectedSubjects.add(session.subjectRef.name);
            if (session.facultyRef?.name) affectedFaculty.add(session.facultyRef.name);
          }
        });
      });

      // Always notify all admins (they need to know about all room changes)
      const allAdmins = await User.find({ role: 'admin' });
      
      // Get ONLY affected faculty and students (not all)
      let affectedFacultyUsers = [];
      let affectedStudents = [];
      
      if (affectedSessions.length > 0) {
        // Get unique faculty IDs from affected sessions
        const affectedFacultyIds = [...new Set(
          affectedTimetables.flatMap(t => 
            t.schedule
              .filter(s => s.roomRef && s.roomRef.toString() === room._id.toString())
              .map(s => s.facultyRef?._id)
              .filter(id => id)
          )
        )];
        
        // Get affected faculty records to get their emails
        if (affectedFacultyIds.length > 0) {
          const Faculty = require('../models/Faculty');
          const affectedFacultyRecords = await Faculty.find({
            _id: { $in: affectedFacultyIds }
          });
          
          // Get faculty emails
          const facultyEmails = affectedFacultyRecords.map(f => f.email).filter(e => e);
          
          // Find User records by matching emails
          if (facultyEmails.length > 0) {
            affectedFacultyUsers = await User.find({
              email: { $in: facultyEmails },
              role: 'faculty'
            });
          }
        }
        
        // Get unique section IDs from affected sessions
        const affectedSectionIds = [...new Set(
          affectedTimetables.map(t => t.sectionRef?._id).filter(id => id)
        )];
        
        // Get students from affected sections
        if (affectedSectionIds.length > 0) {
          affectedStudents = await User.find({
            role: 'student',
            sectionRef: { $in: affectedSectionIds }
          });
        }
      }
      
      const title = `🚨 Room Status Alert: ${room.code}`;
      
      // Create detailed message with session breakdown
      let message = '';
      if (affectedSessions.length > 0) {
        const sectionsArray = Array.from(affectedSections);
        const subjectsArray = Array.from(affectedSubjects);
        const facultyArray = Array.from(affectedFaculty);
        
        message = `Room ${room.code} status changed to "${room.status}". ${affectedSessions.length} scheduled sessions affected across ${affectedSections.size} sections.\n\n`;
        message += `📋 Affected Details:\n`;
        message += `• Sections: ${sectionsArray.join(', ')}\n`;
        message += `• Subjects: ${subjectsArray.join(', ')}\n`;
        message += `• Faculty: ${facultyArray.join(', ')}\n\n`;
        message += `📅 Sessions:\n`;
        affectedSessions.forEach((session, index) => {
          message += `${index + 1}. ${session.sectionName} - ${session.subjectName} (${session.facultyName})\n`;
          message += `   ${session.day}, Period ${session.period} (${session.startTime}-${session.endTime})\n`;
        });
      } else {
        message = `Room ${room.code} status changed to "${room.status}". No active timetables affected.`;
      }
      
      // Create detailed notification data
      const notificationData = {
        type: 'room_status_change_detailed',
        title,
        message,
        data: {
          roomId: room._id,
          roomCode: room.code,
          roomName: room.name,
          roomType: room.type,
          roomCapacity: room.capacity,
          newStatus: room.status,
          timestamp: new Date(),
          affectedSessions: affectedSessions,
          affectedCount: affectedSessions.length,
          affectedSections: Array.from(affectedSections),
          affectedSubjects: Array.from(affectedSubjects),
          affectedFaculty: Array.from(affectedFaculty),
          requiresAction: affectedSessions.length > 0 && room.status !== 'active'
        }
      };

      let notificationsSent = 0;
      let emailsSent = 0;

      // Combine admins and affected faculty for email recipients
      const emailRecipientUsers = [...allAdmins, ...affectedFacultyUsers];
      
      // Prepare recipients for bulk email (admins + affected faculty only)
      const emailRecipients = emailRecipientUsers
        .filter(user => user.email)
        .map(user => ({
          email: user.email,
          name: user.name || (user.role === 'admin' ? 'Admin' : 'Faculty')
        }));

      // Send bulk emails using EmailJS (ONLY to admins and affected faculty)
      if (emailRecipients.length > 0) {
        const emailResults = await emailService.sendBulkEmails(
          emailRecipients,
          room,
          affectedSessions,
          affectedSections,
          affectedSubjects,
          affectedFaculty
        );
        emailsSent = emailResults.sent + emailResults.simulated;
      }

      // Create in-app notifications and send Socket.IO for admins and affected faculty
      for (const user of emailRecipientUsers) {
        // Create in-app notification
        const notification = new Notification({
          userId: user._id,
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
          data: notificationData.data
        });
        await notification.save();
        notificationsSent++;

        // Send Socket.IO notification
        if (io) {
          const userIdStr = user._id.toString();
          io.to(`user_${userIdStr}`).emit('notification:new', {
            ...notificationData,
            _id: notification._id,
            createdAt: notification.createdAt
          });
        }
      }

      // Create in-app notifications for students (NO EMAIL, only notification)
      if (affectedStudents.length > 0) {
        const studentTitle = `📢 Room Change Notice: ${room.code}`;
        const studentMessage = `Room ${room.code} status changed to "${room.status}". Your class schedule may be affected. Check with your faculty for updates.`;
        
        const studentNotificationData = {
          type: 'room_status_change',
          title: studentTitle,
          message: studentMessage,
          data: {
            roomId: room._id,
            roomCode: room.code,
            roomName: room.name,
            newStatus: room.status,
            timestamp: new Date(),
            affectedSections: Array.from(affectedSections)
          }
        };

        for (const student of affectedStudents) {
          // Create in-app notification for student
          const notification = new Notification({
            userId: student._id,
            type: studentNotificationData.type,
            title: studentNotificationData.title,
            message: studentNotificationData.message,
            data: studentNotificationData.data
          });
          await notification.save();
          notificationsSent++;

          // Send Socket.IO notification to student
          if (io) {
            const userIdStr = student._id.toString();
            io.to(`user_${userIdStr}`).emit('notification:new', {
              ...studentNotificationData,
              _id: notification._id,
              createdAt: notification.createdAt
            });
          }
        }
      }

      console.log(`📧 Room Status Change: ${room.code}`);
      console.log(`   ├─ Admins: ${allAdmins.length} (Email ✅ + Notification ✅)`);
      console.log(`   ├─ Affected Faculty: ${affectedFacultyUsers.length} (Email ✅ + Notification ✅)`);
      console.log(`   ├─ Affected Students: ${affectedStudents.length} (Notification only ✅)`);
      console.log(`   ├─ Total Notifications: ${notificationsSent}`);
      console.log(`   └─ Emails Sent: ${emailsSent}`);
      console.log(`📊 Impact: ${affectedSessions.length} sessions, ${affectedSections.size} sections, ${affectedSubjects.size} subjects`);
      
      return {
        success: true,
        notificationsSent,
        emailsSent,
        affectedSessions: affectedSessions.length,
        affectedSections: affectedSections.size
      };
    } catch (error) {
      console.error('Error sending room status change notifications:', error);
      return { success: false, error: error.message };
    }
  }

  // Helper method to generate detailed email HTML
  generateRoomStatusChangeEmailHtml(room, affectedSessions, affectedSections, affectedSubjects, affectedFaculty) {
    const sectionsArray = Array.from(affectedSections);
    const subjectsArray = Array.from(affectedSubjects);
    const facultyArray = Array.from(affectedFaculty);
    
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🚨 Room Status Alert</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Immediate attention required</p>
        </div>
        
        <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="margin: 0 0 10px 0; color: #1f2937;">Room Information</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 5px 0; font-weight: bold; color: #374151;">Room Code:</td>
                <td style="padding: 5px 0; color: #1f2937;">${room.code}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold; color: #374151;">Room Name:</td>
                <td style="padding: 5px 0; color: #1f2937;">${room.name}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold; color: #374151;">Type:</td>
                <td style="padding: 5px 0; color: #1f2937;">${room.type}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold; color: #374151;">Capacity:</td>
                <td style="padding: 5px 0; color: #1f2937;">${room.capacity} students</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold; color: #374151;">New Status:</td>
                <td style="padding: 5px 0;">
                  <span style="background: ${room.status === 'active' ? '#10b981' : '#ef4444'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; text-transform: uppercase;">
                    ${room.status}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold; color: #374151;">Changed At:</td>
                <td style="padding: 5px 0; color: #1f2937;">${new Date().toLocaleString()}</td>
              </tr>
            </table>
          </div>

          ${affectedSessions.length > 0 ? `
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
              <h3 style="margin: 0 0 10px 0; color: #92400e;">⚠️ Impact Assessment</h3>
              <p style="margin: 0; color: #92400e;">
                <strong>${affectedSessions.length} scheduled sessions</strong> are affected across 
                <strong>${sectionsArray.length} sections</strong>.
              </p>
            </div>

            <div style="margin-bottom: 20px;">
              <h3 style="color: #1f2937; margin-bottom: 15px;">📅 Affected Sessions</h3>
              <div style="max-height: 300px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background: #f9fafb;">
                      <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">Section</th>
                      <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">Subject</th>
                      <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">Faculty</th>
                      <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">Day</th>
                      <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #374151;">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${affectedSessions.map(session => `
                      <tr>
                        <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; color: #1f2937;">${session.sectionName}</td>
                        <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; color: #1f2937;">${session.subjectName}</td>
                        <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; color: #1f2937;">${session.facultyName}</td>
                        <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; color: #1f2937;">${session.day}</td>
                        <td style="padding: 8px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; color: #1f2937;">${session.startTime}-${session.endTime}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
              <div style="background: #eff6ff; padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 18px; font-weight: bold; color: #1d4ed8;">${sectionsArray.length}</div>
                <div style="font-size: 12px; color: #1e40af; margin-top: 2px;">Sections</div>
                <div style="font-size: 10px; color: #3b82f6; margin-top: 4px;">${sectionsArray.join(', ')}</div>
              </div>
              <div style="background: #f0fdf4; padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 18px; font-weight: bold; color: #166534;">${subjectsArray.length}</div>
                <div style="font-size: 12px; color: #15803d; margin-top: 2px;">Subjects</div>
                <div style="font-size: 10px; color: #22c55e; margin-top: 4px;">${subjectsArray.slice(0, 3).join(', ')}${subjectsArray.length > 3 ? '...' : ''}</div>
              </div>
              <div style="background: #fdf4ff; padding: 12px; border-radius: 8px; text-align: center;">
                <div style="font-size: 18px; font-weight: bold; color: #7c2d12;">${facultyArray.length}</div>
                <div style="font-size: 12px; color: #92400e; margin-top: 2px;">Faculty</div>
                <div style="font-size: 10px; color: #a855f7; margin-top: 4px;">${facultyArray.slice(0, 2).join(', ')}${facultyArray.length > 2 ? '...' : ''}</div>
              </div>
            </div>
          ` : `
            <div style="background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
              <h3 style="margin: 0 0 5px 0; color: #065f46;">✅ No Impact</h3>
              <p style="margin: 0; color: #065f46;">This room is not currently assigned to any published timetables.</p>
            </div>
          `}

          ${room.status !== 'active' && affectedSessions.length > 0 ? `
            <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
              <h3 style="margin: 0 0 10px 0; color: #991b1b;">🚨 Action Required</h3>
              <p style="margin: 0 0 10px 0; color: #991b1b;">
                Since this room is now <strong>${room.status}</strong>, the affected sessions need to be reassigned to alternative rooms.
              </p>
              <div style="margin-top: 15px;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/conflicts" 
                   style="background: #dc2626; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  🔧 Resolve Conflicts
                </a>
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/rooms" 
                   style="background: #6b7280; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin-left: 10px;">
                  🏫 Manage Rooms
                </a>
              </div>
            </div>
          ` : ''}
        </div>
        
        <div style="background: #f9fafb; padding: 15px; border-radius: 0 0 10px 10px; text-align: center; border: 1px solid #e5e7eb; border-top: none;">
          <p style="margin: 0; font-size: 12px; color: #6b7280;">
            This is an automated notification from Smart Campus Management System<br>
            Generated at ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    `;
  }

  // New method for room change notifications
  async notifyRoomChange(oldRoomId, newRoomId, day, period, subjectId, sectionId, io) {
    try {
      const [oldRoom, newRoom, subject, section] = await Promise.all([
        require('../models/Room').findById(oldRoomId),
        require('../models/Room').findById(newRoomId),
        require('../models/Subject').findById(subjectId),
        require('../models/Section').findById(sectionId)
      ]);

      if (!oldRoom || !newRoom || !subject || !section) {
        return { success: false, error: 'Required data not found' };
      }

      // Get all students in the section
      const students = await User.find({
        sectionRef: sectionId,
        role: 'student'
      });

      // Get faculty teaching this subject
      const faculty = await User.find({
        role: 'faculty'
      });

      const message = `Room changed for ${subject.name} on ${day} Period ${period}: ${oldRoom.code} → ${newRoom.code}`;

      const emailSubject = `Room Change Alert - ${subject.name}`;
      const emailHtml = `
        <h2>Room Change Notification</h2>
        <p><strong>Subject:</strong> ${subject.name}</p>
        <p><strong>Section:</strong> ${section.name}</p>
        <p><strong>Day:</strong> ${day}</p>
        <p><strong>Period:</strong> ${period}</p>
        <p><strong>Old Room:</strong> ${oldRoom.code} - ${oldRoom.name}</p>
        <p><strong>New Room:</strong> ${newRoom.code} - ${newRoom.name}</p>
        <p>Please note this change for your upcoming class.</p>
      `;

      // Notify students
      for (const student of students) {
        if (student.email) {
          await this.sendEmail(student.email, emailSubject, emailHtml);
        }

        if (io) {
          const userIdStr = student._id.toString();
          io.to(`user_${userIdStr}`).emit('notification:new', {
            message: message,
            type: 'room_change',
            day: day,
            period: period,
            oldRoom: oldRoom.code,
            newRoom: newRoom.code,
            subject: subject.name,
            timestamp: new Date()
          });
        }
      }

      // Notify relevant faculty
      for (const facultyMember of faculty) {
        if (facultyMember.email) {
          await this.sendEmail(facultyMember.email, emailSubject, emailHtml);
        }

        if (io) {
          const userIdStr = facultyMember._id.toString();
          io.to(`user_${userIdStr}`).emit('notification:new', {
            message: message,
            type: 'room_change',
            day: day,
            period: period,
            oldRoom: oldRoom.code,
            newRoom: newRoom.code,
            subject: subject.name,
            timestamp: new Date()
          });
        }
      }

      return {
        success: true,
        notified: students.length + faculty.length,
        studentsNotified: students.length,
        facultyNotified: faculty.length
      };
    } catch (error) {
      console.error('Room change notification error:', error);
      return { success: false, error: error.message };
    }
  }

  // New method for session cancellation notifications
  async notifySessionCancellation(roomId, day, period, subjectId, sectionId, reason, io) {
    try {
      const [room, subject, section] = await Promise.all([
        require('../models/Room').findById(roomId),
        require('../models/Subject').findById(subjectId),
        require('../models/Section').findById(sectionId)
      ]);

      if (!room || !subject || !section) {
        return { success: false, error: 'Required data not found' };
      }

      // Get all students in the section
      const students = await User.find({
        sectionRef: sectionId,
        role: 'student'
      });

      const message = `Class cancelled: ${subject.name} on ${day} Period ${period} in ${room.code}${reason ? ` - ${reason}` : ''}`;

      const emailSubject = `Class Cancellation - ${subject.name}`;
      const emailHtml = `
        <h2>Class Cancellation Notice</h2>
        <p><strong>Subject:</strong> ${subject.name}</p>
        <p><strong>Section:</strong> ${section.name}</p>
        <p><strong>Day:</strong> ${day}</p>
        <p><strong>Period:</strong> ${period}</p>
        <p><strong>Room:</strong> ${room.code} - ${room.name}</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>This class has been cancelled. Please check for updates.</p>
      `;

      // Notify students
      for (const student of students) {
        if (student.email) {
          await this.sendEmail(student.email, emailSubject, emailHtml);
        }

        if (io) {
          const userIdStr = student._id.toString();
          io.to(`user_${userIdStr}`).emit('notification:new', {
            message: message,
            type: 'session_cancelled',
            day: day,
            period: period,
            room: room.code,
            subject: subject.name,
            reason: reason,
            timestamp: new Date()
          });
        }
      }

      return {
        success: true,
        notified: students.length
      };
    } catch (error) {
      console.error('Session cancellation notification error:', error);
      return { success: false, error: error.message };
    }
  }

  // New method for timetable deletion notifications
  async notifyTimetableDeleted(timetableInfo, deletedByUser, io) {
    try {
      // Get all users who might be affected by this timetable deletion
      const users = await User.find({
        $or: [
          { sectionRef: timetableInfo.sectionId }, // Students in the section
          { role: 'faculty' }, // All faculty members
          { role: 'admin' } // All admin users
        ]
      });

      if (users.length === 0) {
        console.log('No users found to notify for timetable deletion');
        return { success: true, notified: 0 };
      }

      const subject = `Timetable Deleted - ${timetableInfo.sectionName}`;
      const statusText = timetableInfo.isPublished ? 'published' : 'draft';

      const html = `
        <h2>Timetable Deleted</h2>
        <p>The ${statusText} timetable for <strong>${timetableInfo.sectionName}</strong> has been deleted.</p>
        <p><strong>Deleted by:</strong> ${deletedByUser.name || deletedByUser.email}</p>
        <p><strong>Version:</strong> ${timetableInfo.version}</p>
        <p><strong>Generated on:</strong> ${new Date(timetableInfo.generatedAt).toLocaleString()}</p>
        ${timetableInfo.isPublished ?
          '<p><strong>Note:</strong> This was a published timetable. Please check for a new timetable or contact administration.</p>' :
          '<p><strong>Note:</strong> This was a draft timetable. The deletion should not affect your current schedule.</p>'
        }
        <p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/timetable">Check Current Timetable</a></p>
      `;

      const message = `Timetable for ${timetableInfo.sectionName} has been deleted by ${deletedByUser.name || deletedByUser.email}`;

      // Send notifications to all affected users
      let emailsSent = 0;
      let notificationsCreated = 0;

      const title = `Timetable Deleted - ${timetableInfo.sectionName}`;
      const notificationData = {
        sectionName: timetableInfo.sectionName,
        sectionId: timetableInfo.sectionId,
        deletedBy: deletedByUser.name || deletedByUser.email,
        wasPublished: timetableInfo.isPublished,
        version: timetableInfo.version,
        deletedAt: new Date()
      };

      for (const user of users) {
        // Send email notification
        if (user.email) {
          const result = await this.sendEmail(user.email, subject, html);
          if (result.success) emailsSent++;
        }

        // Create and send notification
        const notificationResult = await this.createAndSendNotification(
          user._id,
          title,
          message,
          'timetable_deleted',
          notificationData,
          timetableInfo.isPublished ? 'high' : 'medium',
          io
        );

        if (notificationResult.success) {
          notificationsCreated++;
        }
      }

      console.log(`Notified ${users.length} users about timetable deletion (${emailsSent} emails, ${notificationsCreated} notifications created)`);

      return {
        success: true,
        notified: users.length,
        emailsSent: emailsSent,
        notificationsCreated: notificationsCreated
      };
    } catch (error) {
      console.error('Timetable deletion notification error:', error);
      return { success: false, error: error.message };
    }
  }

  // New method for bulk notifications
  async sendBulkNotification(userIds, message, type, emailSubject, emailHtml, io) {
    try {
      const users = await User.find({
        _id: { $in: userIds }
      });

      let emailsSent = 0;
      let socketNotificationsSent = 0;

      for (const user of users) {
        // Send email if provided
        if (user.email && emailSubject && emailHtml) {
          const result = await this.sendEmail(user.email, emailSubject, emailHtml);
          if (result.success) emailsSent++;
        }

        // Send socket notification
        if (io) {
          const userIdStr = user._id.toString();
          io.to(`user_${userIdStr}`).emit('notification:new', {
            message: message,
            type: type,
            timestamp: new Date()
          });
          socketNotificationsSent++;
        }
      }

      return {
        success: true,
        emailsSent: emailsSent,
        socketNotificationsSent: socketNotificationsSent,
        totalUsers: users.length
      };
    } catch (error) {
      console.error('Bulk notification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notify admins about room conflict
   * Called when a room status change creates scheduling conflicts
   */
  async notifyRoomConflict(conflict, room, io = null) {
    try {
      console.log(`[NotificationService] Notifying admins about conflict for room ${room.code}`);

      // Get all admin users
      const admins = await User.find({ role: 'admin' });

      if (admins.length === 0) {
        console.log('[NotificationService] No admin users found');
        return { success: false, error: 'No admin users found' };
      }

      const title = `Room Conflict Detected - ${room.code}`;
      const affectedCount = conflict.affectedEntries.length;

      // Build affected slots summary
      const affectedSlots = conflict.affectedEntries
        .slice(0, 3) // Show first 3
        .map(entry => `${entry.day} ${entry.startTime}-${entry.endTime}`)
        .join(', ');

      const moreText = affectedCount > 3 ? ` and ${affectedCount - 3} more` : '';

      const message = `⚠️ Room ${room.code} is now ${room.status.replace('_', ' ')}. ${affectedCount} session(s) affected: ${affectedSlots}${moreText}. Click to auto-adjust or manually reassign rooms.`;

      // Email HTML template
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">⚠️ Room Conflict Detected</h2>
          <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; font-weight: bold;">Room: ${room.code} - ${room.name}</p>
            <p style="margin: 8px 0 0 0;">Status changed to: <strong>${room.status.replace('_', ' ').toUpperCase()}</strong></p>
          </div>
          
          <h3 style="color: #374151;">Affected Sessions (${affectedCount})</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Subject</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Section</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Day</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">Time</th>
              </tr>
            </thead>
            <tbody>
              ${conflict.affectedEntries.map(entry => `
                <tr>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${entry.subjectName}</td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${entry.sectionName}</td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${entry.day}</td>
                  <td style="padding: 8px; border: 1px solid #e5e7eb;">${entry.startTime}-${entry.endTime}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div style="margin: 24px 0;">
            <p style="margin-bottom: 12px;"><strong>Action Required:</strong></p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/conflicts" 
               style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-right: 8px;">
              View Conflicts Dashboard
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            You can auto-adjust the timetable or manually reassign rooms from the conflicts dashboard.
          </p>
        </div>
      `;

      const notificationData = {
        conflictId: conflict._id,
        roomId: room._id,
        roomCode: room.code,
        roomName: room.name,
        status: room.status,
        affectedCount: affectedCount,
        affectedSessions: conflict.affectedEntries.map(entry => ({
          subject: entry.subjectName,
          section: entry.sectionName,
          faculty: entry.facultyName,
          day: entry.day,
          period: entry.period,
          time: `${entry.startTime}-${entry.endTime}`
        })),
        actions: ['auto_adjust', 'manual_adjust', 'view_details']
      };

      let emailsSent = 0;
      let notificationsCreated = 0;

      // Send notifications to all admins
      for (const admin of admins) {
        // Send email
        if (admin.email) {
          const emailResult = await this.sendEmail(admin.email, title, emailHtml);
          if (emailResult.success) emailsSent++;
        }

        // Create and send notification
        const notifResult = await this.createAndSendNotification(
          admin._id,
          title,
          message,
          'room_status_conflict',
          notificationData,
          'high',
          io
        );

        if (notifResult.success) notificationsCreated++;
      }

      console.log(`[NotificationService] Notified ${admins.length} admins (${emailsSent} emails, ${notificationsCreated} notifications)`);

      return {
        success: true,
        notified: admins.length,
        emailsSent,
        notificationsCreated
      };
    } catch (error) {
      console.error('[NotificationService] Error notifying room conflict:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notify users about room change
   * Called when a timetable entry is reassigned to a new room
   */
  async notifyRoomChange(oldRoom, newRoom, entry, io = null) {
    try {
      console.log(`[NotificationService] Notifying users about room change: ${oldRoom.code} -> ${newRoom.code}`);

      // Get affected users (faculty and students in the section)
      const [faculty, students] = await Promise.all([
        User.findById(entry.facultyId),
        User.find({ sectionRef: entry.sectionId, role: 'student' })
      ]);

      const users = [faculty, ...students].filter(u => u);

      if (users.length === 0) {
        console.log('[NotificationService] No users found to notify');
        return { success: false, error: 'No users found' };
      }

      const title = `Room Change - ${entry.subjectName}`;
      const message = `Your class has been moved from ${oldRoom.code} to ${newRoom.code} on ${entry.day} at ${entry.startTime}`;

      // Email HTML template
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">📍 Room Change Notification</h2>
          <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; font-size: 18px; font-weight: bold;">${entry.subjectName}</p>
            <p style="margin: 8px 0 0 0;">Section: ${entry.sectionName}</p>
          </div>
          
          <table style="width: 100%; margin: 16px 0;">
            <tr>
              <td style="padding: 8px; font-weight: bold;">Day:</td>
              <td style="padding: 8px;">${entry.day}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Time:</td>
              <td style="padding: 8px;">${entry.startTime} - ${entry.endTime}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Old Room:</td>
              <td style="padding: 8px; text-decoration: line-through; color: #dc2626;">${oldRoom.code} - ${oldRoom.name}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">New Room:</td>
              <td style="padding: 8px; color: #16a34a; font-weight: bold;">${newRoom.code} - ${newRoom.name}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Building:</td>
              <td style="padding: 8px;">${newRoom.building}, Floor ${newRoom.floor}</td>
            </tr>
          </table>
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 16px 0;">
            <p style="margin: 0; color: #92400e;">
              <strong>⚠️ Important:</strong> Please note the new room location for your upcoming class.
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
            Reason: Room ${oldRoom.code} is currently ${oldRoom.status.replace('_', ' ')}.
          </p>
        </div>
      `;

      const notificationData = {
        subjectName: entry.subjectName,
        sectionName: entry.sectionName,
        facultyName: entry.facultyName,
        oldRoomId: oldRoom._id,
        oldRoomCode: oldRoom.code,
        oldRoomName: oldRoom.name,
        newRoomId: newRoom._id,
        newRoomCode: newRoom.code,
        newRoomName: newRoom.name,
        day: entry.day,
        period: entry.period,
        startTime: entry.startTime,
        endTime: entry.endTime,
        reason: `Room ${oldRoom.code} is ${oldRoom.status.replace('_', ' ')}`
      };

      let emailsSent = 0;
      let notificationsCreated = 0;

      // Send notifications to all affected users
      for (const user of users) {
        // Send email
        if (user.email) {
          const emailResult = await this.sendEmail(user.email, title, emailHtml);
          if (emailResult.success) emailsSent++;
        }

        // Create and send notification
        const notifResult = await this.createAndSendNotification(
          user._id,
          title,
          message,
          'room_change',
          notificationData,
          'high',
          io
        );

        if (notifResult.success) notificationsCreated++;
      }

      console.log(`[NotificationService] Notified ${users.length} users about room change (${emailsSent} emails, ${notificationsCreated} notifications)`);

      return {
        success: true,
        notified: users.length,
        emailsSent,
        notificationsCreated
      };
    } catch (error) {
      console.error('[NotificationService] Error notifying room change:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send conflict resolution summary to admin
   * Called after auto-regeneration or manual adjustment completes
   */
  async sendResolutionSummary(adminId, conflict, results, io = null) {
    try {
      const admin = await User.findById(adminId);
      if (!admin) {
        return { success: false, error: 'Admin not found' };
      }

      const title = `Conflict Resolution Complete - Room ${conflict.roomCode}`;
      const message = `Resolved ${results.resolved} of ${results.total} affected sessions. ${results.failed} require manual attention.`;

      // Email HTML template
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #16a34a;">✅ Conflict Resolution Summary</h2>
          <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; font-weight: bold;">Room: ${conflict.roomCode} - ${conflict.roomName}</p>
            <p style="margin: 8px 0 0 0;">Resolution Method: ${results.method}</p>
          </div>
          
          <h3 style="color: #374151;">Results</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Total Affected:</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">${results.total}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold; color: #16a34a;">Successfully Resolved:</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; color: #16a34a; font-weight: bold;">${results.resolved}</td>
            </tr>
            <tr style="background-color: #f3f4f6;">
              <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold; color: #dc2626;">Requires Manual Attention:</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">${results.failed}</td>
            </tr>
          </table>
          
          ${results.failedEntries && results.failedEntries.length > 0 ? `
            <h3 style="color: #374151;">Sessions Requiring Manual Assignment</h3>
            <ul style="list-style: none; padding: 0;">
              ${results.failedEntries.map(entry => `
                <li style="padding: 8px; background-color: #fef2f2; margin: 4px 0; border-left: 3px solid #dc2626;">
                  ${entry.subjectName} - ${entry.sectionName} (${entry.day} ${entry.startTime})
                </li>
              `).join('')}
            </ul>
          ` : ''}
          
          <div style="margin: 24px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/conflicts/${conflict._id}" 
               style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View Conflict Details
            </a>
          </div>
        </div>
      `;

      const notificationData = {
        conflictId: conflict._id,
        roomCode: conflict.roomCode,
        method: results.method,
        total: results.total,
        resolved: results.resolved,
        failed: results.failed,
        failedEntries: results.failedEntries || []
      };

      // Send email
      if (admin.email) {
        await this.sendEmail(admin.email, title, emailHtml);
      }

      // Create and send notification
      await this.createAndSendNotification(
        admin._id,
        title,
        message,
        'conflict_resolution_summary',
        notificationData,
        'medium',
        io
      );

      return { success: true };
    } catch (error) {
      console.error('[NotificationService] Error sending resolution summary:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Consolidate multiple room changes into single notification
   * Used when multiple classes in same section are reassigned
   */
  async consolidateRoomChangeNotifications(sectionId, changes, io = null) {
    try {
      const section = await require('../models/Section').findById(sectionId);
      if (!section) {
        return { success: false, error: 'Section not found' };
      }

      // Get all students in the section
      const students = await User.find({ sectionRef: sectionId, role: 'student' });

      if (students.length === 0) {
        return { success: false, error: 'No students found' };
      }

      const title = `Multiple Room Changes - ${section.name}`;
      const message = `${changes.length} of your classes have been moved to different rooms. Check details below.`;

      // Email HTML template
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">📍 Multiple Room Changes</h2>
          <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 16px; margin: 16px 0;">
            <p style="margin: 0; font-size: 18px; font-weight: bold;">Section: ${section.name}</p>
            <p style="margin: 8px 0 0 0;">${changes.length} classes have been moved to different rooms</p>
          </div>
          
          <h3 style="color: #374151;">Room Changes</h3>
          ${changes.map(change => `
            <div style="background-color: #f9fafb; padding: 12px; margin: 8px 0; border-radius: 6px;">
              <p style="margin: 0; font-weight: bold;">${change.subjectName}</p>
              <p style="margin: 4px 0; font-size: 14px;">${change.day} at ${change.startTime}</p>
              <p style="margin: 4px 0; font-size: 14px;">
                <span style="text-decoration: line-through; color: #dc2626;">${change.oldRoomCode}</span>
                →
                <span style="color: #16a34a; font-weight: bold;">${change.newRoomCode}</span>
              </p>
            </div>
          `).join('')}
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 16px 0;">
            <p style="margin: 0; color: #92400e;">
              <strong>⚠️ Important:</strong> Please note the new room locations for your upcoming classes.
            </p>
          </div>
        </div>
      `;

      const notificationData = {
        sectionId: section._id,
        sectionName: section.name,
        changesCount: changes.length,
        changes: changes
      };

      let emailsSent = 0;
      let notificationsCreated = 0;

      // Send consolidated notification to all students
      for (const student of students) {
        // Send email
        if (student.email) {
          const emailResult = await this.sendEmail(student.email, title, emailHtml);
          if (emailResult.success) emailsSent++;
        }

        // Create and send notification
        const notifResult = await this.createAndSendNotification(
          student._id,
          title,
          message,
          'room_change_consolidated',
          notificationData,
          'high',
          io
        );

        if (notifResult.success) notificationsCreated++;
      }

      console.log(`[NotificationService] Sent consolidated notifications to ${students.length} students`);

      return {
        success: true,
        notified: students.length,
        emailsSent,
        notificationsCreated
      };
    } catch (error) {
      console.error('[NotificationService] Error sending consolidated notifications:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new NotificationService();
