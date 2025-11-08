const nodemailer = require('nodemailer');

class NodemailerService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    
    // Check if Nodemailer is configured
    if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
      this.setupTransporter();
    } else {
      console.warn('⚠️ Nodemailer not configured. Add EMAIL_USER and EMAIL_APP_PASSWORD to .env');
    }
  }

  setupTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_APP_PASSWORD
        }
      });
      
      this.isConfigured = true;
      console.log('✅ Nodemailer configured and ready');
      
      // Verify connection
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('❌ Nodemailer verification failed:', error.message);
          this.isConfigured = false;
        } else {
          console.log('✅ Nodemailer SMTP connection verified');
        }
      });
      
    } catch (error) {
      console.error('❌ Nodemailer setup failed:', error.message);
      this.isConfigured = false;
    }
  }

  /**
   * Generate HTML email for room status change
   */
  generateRoomStatusEmailHTML(room, affectedSessions, affectedSections, affectedSubjects, affectedFaculty) {
    const sectionsArray = Array.from(affectedSections);
    const subjectsArray = Array.from(affectedSubjects);
    const facultyArray = Array.from(affectedFaculty);
    
    const sessionsHTML = affectedSessions.length > 0
      ? affectedSessions.map(session => `
          <div style="background: #f9fafb; padding: 10px; margin: 5px 0; border-left: 3px solid #3b82f6; border-radius: 4px;">
            <strong>${session.sectionName}</strong> - ${session.subjectName}<br>
            <span style="color: #6b7280;">Faculty: ${session.facultyName}</span><br>
            <span style="color: #6b7280;">${session.day}, Period ${session.period} (${session.startTime}-${session.endTime})</span>
          </div>
        `).join('')
      : '<p style="color: #6b7280;">No sessions affected</p>';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">🚨 Room Status Alert</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 14px;">Immediate attention required</p>
          </div>
          
          <!-- Content -->
          <div style="padding: 30px 20px;">
            <!-- Room Info -->
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="margin: 0 0 15px 0; color: #1f2937; font-size: 20px;">Room Information</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #374151; width: 40%;">Room Code:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${room.code}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #374151;">Room Name:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${room.name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #374151;">Type:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${room.type}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #374151;">Capacity:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${room.capacity} students</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #374151;">New Status:</td>
                  <td style="padding: 8px 0;">
                    <span style="background: #ef4444; color: white; padding: 6px 12px; border-radius: 4px; font-size: 12px; text-transform: uppercase; font-weight: bold;">
                      ${room.status}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #374151;">Changed At:</td>
                  <td style="padding: 8px 0; color: #1f2937;">${new Date().toLocaleString()}</td>
                </tr>
              </table>
            </div>

            <!-- Impact Assessment -->
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
              <h3 style="margin: 0 0 10px 0; color: #92400e; font-size: 16px;">⚠️ Impact Assessment</h3>
              <p style="margin: 0; color: #92400e;">
                <strong>${affectedSessions.length} scheduled sessions</strong> are affected across 
                <strong>${sectionsArray.length} sections</strong>.
              </p>
            </div>

            <!-- Affected Sessions -->
            <div style="margin-bottom: 20px;">
              <h3 style="color: #1f2937; margin-bottom: 15px; font-size: 18px;">📅 Affected Sessions</h3>
              ${sessionsHTML}
            </div>

            <!-- Summary -->
            <div style="margin-bottom: 20px;">
              <h3 style="color: #1f2937; margin-bottom: 10px; font-size: 18px;">📊 Summary</h3>
              <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
                <p style="margin: 5px 0; color: #374151;"><strong>Sections:</strong> ${sectionsArray.join(', ') || 'None'}</p>
                <p style="margin: 5px 0; color: #374151;"><strong>Subjects:</strong> ${subjectsArray.join(', ') || 'None'}</p>
                <p style="margin: 5px 0; color: #374151;"><strong>Faculty:</strong> ${facultyArray.join(', ') || 'None'}</p>
              </div>
            </div>

            <!-- Action Required -->
            <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
              <h3 style="margin: 0 0 10px 0; color: #991b1b; font-size: 16px;">🚨 Action Required</h3>
              <p style="margin: 0 0 15px 0; color: #991b1b;">
                Since this room is now <strong>${room.status}</strong>, the affected sessions need to be reassigned to alternative rooms.
              </p>
              <div style="margin-top: 15px;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/conflicts" 
                   style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin-right: 10px;">
                  🔧 Resolve Conflicts
                </a>
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/rooms" 
                   style="background: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  🏫 Manage Rooms
                </a>
              </div>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">
              This is an automated notification from Smart Campus Management System<br>
              Generated at ${new Date().toLocaleString()}
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Send room status change email
   */
  async sendRoomStatusChangeEmail(toEmail, toName, room, affectedSessions, affectedSections, affectedSubjects, affectedFaculty) {
    try {
      if (!this.isConfigured) {
        console.log(`[Email Simulation] To: ${toEmail} (${toName})`);
        console.log(`[Email Simulation] Subject: Room ${room.code} Status Alert`);
        return { success: true, simulated: true };
      }

      const html = this.generateRoomStatusEmailHTML(room, affectedSessions, affectedSections, affectedSubjects, affectedFaculty);

      const mailOptions = {
        from: `"Smart Campus System" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: `🚨 Room Status Alert: ${room.code} - ${room.status}`,
        html: html
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      console.log(`✅ Email sent to ${toEmail}: ${info.messageId}`);
      
      return {
        success: true,
        messageId: info.messageId,
        response: info.response
      };
      
    } catch (error) {
      console.error(`❌ Email send error to ${toEmail}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send bulk emails
   */
  async sendBulkEmails(recipients, room, affectedSessions, affectedSections, affectedSubjects, affectedFaculty) {
    const results = {
      total: recipients.length,
      sent: 0,
      failed: 0,
      simulated: 0,
      errors: []
    };

    for (const recipient of recipients) {
      try {
        const result = await this.sendRoomStatusChangeEmail(
          recipient.email,
          recipient.name,
          room,
          affectedSessions,
          affectedSections,
          affectedSubjects,
          affectedFaculty
        );

        if (result.success) {
          if (result.simulated) {
            results.simulated++;
          } else {
            results.sent++;
          }
        } else {
          results.failed++;
          results.errors.push({
            email: recipient.email,
            error: result.error
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        results.failed++;
        results.errors.push({
          email: recipient.email,
          error: error.message
        });
      }
    }

    return results;
  }
}

module.exports = new NodemailerService();
