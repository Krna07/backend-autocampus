const emailjs = require('@emailjs/nodejs');

class EmailService {
  constructor() {
    this.serviceId = process.env.EMAILJS_SERVICE_ID;
    this.templateId = process.env.EMAILJS_TEMPLATE_ID;
    this.publicKey = process.env.EMAILJS_PUBLIC_KEY;
    this.privateKey = process.env.EMAILJS_PRIVATE_KEY;
    
    // Check if EmailJS is configured
    this.isConfigured = !!(this.serviceId && this.templateId && this.publicKey && this.privateKey);
    
    if (!this.isConfigured) {
      console.warn('⚠️ EmailJS not configured. Emails will be simulated.');
      console.warn('Add EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, and EMAILJS_PRIVATE_KEY to .env');
    } else {
      console.log('✅ EmailJS configured and ready');
    }
  }

  /**
   * Send email using EmailJS
   */
  async sendEmail(toEmail, toName, templateParams) {
    try {
      if (!this.isConfigured) {
        console.log(`[Email Simulation] To: ${toEmail} (${toName})`);
        console.log(`[Email Simulation] Subject: ${templateParams.room_code} Status Alert`);
        console.log(`[Email Simulation] Affected Sessions: ${templateParams.affected_count}`);
        return { success: true, simulated: true };
      }

      // Add recipient info to template params
      const emailParams = {
        to_email: toEmail,
        to_name: toName,
        ...templateParams
      };

      // Send email via EmailJS
      const response = await emailjs.send(
        this.serviceId,
        this.templateId,
        emailParams,
        {
          publicKey: this.publicKey,
          privateKey: this.privateKey,
        }
      );

      console.log(`✅ Email sent to ${toEmail}: ${response.status} ${response.text}`);
      
      return { 
        success: true, 
        messageId: response.text,
        status: response.status 
      };
      
    } catch (error) {
      console.error(`❌ Email send error to ${toEmail}:`, error);
      return { 
        success: false, 
        error: error.message || error.text || 'Unknown error' 
      };
    }
  }

  /**
   * Send room status change notification email
   */
  async sendRoomStatusChangeEmail(userEmail, userName, room, affectedSessions, affectedSections, affectedSubjects, affectedFaculty) {
    try {
      // Format affected sessions for email
      const sessionsText = affectedSessions.length > 0
        ? affectedSessions.map(session => 
            `• ${session.sectionName} - ${session.subjectName}\n  Faculty: ${session.facultyName}\n  ${session.day}, Period ${session.period} (${session.startTime}-${session.endTime})`
          ).join('\n\n')
        : 'No sessions affected';

      // Prepare template parameters
      const templateParams = {
        room_code: room.code,
        room_name: room.name,
        room_type: room.type,
        room_capacity: room.capacity,
        room_status: room.status,
        timestamp: new Date().toLocaleString(),
        affected_count: affectedSessions.length,
        sections_count: Array.from(affectedSections).length,
        affected_sessions: sessionsText,
        sections_list: Array.from(affectedSections).join(', ') || 'None',
        subjects_list: Array.from(affectedSubjects).join(', ') || 'None',
        faculty_list: Array.from(affectedFaculty).join(', ') || 'None',
        frontend_url: process.env.FRONTEND_URL || 'http://localhost:5173'
      };

      // Send email
      const result = await this.sendEmail(userEmail, userName, templateParams);
      
      return result;
      
    } catch (error) {
      console.error('Error sending room status change email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send bulk emails to multiple recipients
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

        // Small delay to avoid rate limiting (EmailJS free tier)
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

module.exports = new EmailService();
