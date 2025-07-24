const express = require('express');
const axios = require('axios');
const app = express();

// Middleware to parse different content types
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));

// Your Telnyx Configuration  
const TELNYX_API_KEY = process.env.TELNYX_API_KEY || 'YOUR_TELNYX_API_KEY'; // Railway will provide this as environment variable
const FROM_NUMBER = '+18553970447'; // Your new toll-free number
const TO_NUMBER = '+14133205677'; // Your phone number
const MESSAGING_PROFILE_ID = '400182ac-67c2-4110-9ad3-8db53f27cc9c';

// The email address to monitor
const TARGET_EMAIL = 'tampa@gulfstreamboatclub.com';

// Main webhook endpoint that Gmail will forward emails to
app.post('/email-webhook', async (req, res) => {
  try {
    console.log('Received webhook request');
    console.log('Headers:', req.headers);
    console.log('Body type:', typeof req.body);
    
    let emailData;
    
    // Handle different content types that Gmail might send
    if (typeof req.body === 'string') {
      // If it's a string, try to parse it as email content
      emailData = parseEmailContent(req.body);
    } else if (typeof req.body === 'object') {
      // If it's already parsed JSON
      emailData = req.body;
    } else {
      console.log('Raw body:', req.body.toString());
      emailData = parseEmailContent(req.body.toString());
    }
    
    console.log('Parsed email data:', emailData);
    
    // Check if this email is from the target address
    const fromEmail = emailData.from || emailData.sender || '';
    const subject = emailData.subject || 'No Subject';
    
    console.log(`Checking if "${fromEmail}" contains "${TARGET_EMAIL}"`);
    
    if (fromEmail.toLowerCase().includes(TARGET_EMAIL.toLowerCase())) {
      console.log('✅ Email is from target address, sending SMS...');
      
      // Create SMS message
      const smsMessage = `🏖️ New email from Gulfstream Boat Club!\n\nFrom: ${fromEmail}\nSubject: ${subject}`;
      
      await sendSMS(smsMessage);
      console.log('SMS sent successfully!');
      
      res.status(200).json({ 
        success: true, 
        message: 'SMS notification sent',
        from: fromEmail,
        subject: subject
      });
    } else {
      console.log('❌ Email not from target address, ignoring');
      res.status(200).json({ 
        success: true, 
        message: 'Email ignored (not from target address)',
        from: fromEmail
      });
    }
    
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Test endpoint to verify the server is working
app.get('/test', (req, res) => {
  res.json({ 
    status: 'Server is working!',
    timestamp: new Date().toISOString(),
    target_email: TARGET_EMAIL,
    from_number: FROM_NUMBER,
    to_number: TO_NUMBER
  });
});

// Test SMS endpoint
app.post('/test-sms', async (req, res) => {
  try {
    await sendSMS('🧪 Test SMS from your email webhook server!');
    res.json({ success: true, message: 'Test SMS sent!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Function to parse email content from forwarded emails
function parseEmailContent(emailText) {
  const email = {};
  
  // Try to extract basic email information
  // This is a simple parser - Gmail forwarding format can vary
  
  const lines = emailText.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for common email headers
    if (line.toLowerCase().startsWith('from:')) {
      email.from = line.substring(5).trim();
    } else if (line.toLowerCase().startsWith('subject:')) {
      email.subject = line.substring(8).trim();
    } else if (line.toLowerCase().startsWith('to:')) {
      email.to = line.substring(3).trim();
    }
    
    // Also check for forwarded email patterns
    if (line.includes('---------- Forwarded message ---------')) {
      // Gmail forward format
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const forwardLine = lines[j].trim();
        if (forwardLine.toLowerCase().startsWith('from:')) {
          email.from = forwardLine.substring(5).trim();
        } else if (forwardLine.toLowerCase().startsWith('subject:')) {
          email.subject = forwardLine.substring(8).trim();
        }
      }
    }
  }
  
  // If we couldn't parse it, store the raw content for debugging
  if (!email.from && !email.subject) {
    email.raw_content = emailText.substring(0, 500) + '...';
    email.from = 'Unknown sender';
    email.subject = 'Could not parse subject';
  }
  
  return email;
}

// Function to send SMS via Telnyx
async function sendSMS(message) {
  try {
    // Trim message to SMS length limit (1600 chars to be safe)
    const trimmedMessage = message.length > 1500 ? 
      message.substring(0, 1500) + '...' : message;
    
    const response = await axios.post('https://api.telnyx.com/v2/messages', {
      from: FROM_NUMBER,
      to: TO_NUMBER,
      text: trimmedMessage,
      messaging_profile_id: MESSAGING_PROFILE_ID
    }, {
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Telnyx SMS Response:', response.data);
    return response.data;
    
  } catch (error) {
    console.error('❌ Telnyx SMS Error:', error.response?.data || error.message);
    throw new Error(`SMS failed: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Email-to-SMS webhook server running on port ${PORT}`);
  console.log(`📧 Monitoring emails from: ${TARGET_EMAIL}`);
  console.log(`📱 Sending SMS alerts to: ${TO_NUMBER}`);
  console.log(`📞 Using Telnyx number: ${FROM_NUMBER}`);
  console.log(`\n🔗 Webhook URL will be: http://your-domain.com/email-webhook`);
  console.log(`🧪 Test endpoint: http://your-domain.com/test`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});
