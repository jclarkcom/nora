require('dotenv').config();

// Email sending helper using Innerscene Secure API
async function sendEmail({ to, subject, html, text }) {
  const fetch = (await import('node-fetch')).default;

  try {
    const response = await fetch('https://api.innerscene.com/api/email/send-secure-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        to,
        subject,
        html: html || text,
        text: text || ''
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('Email API error response:', responseText);
      throw new Error(`Failed to send email: ${response.status} ${response.statusText}`);
    }

    try {
      const result = JSON.parse(responseText);
      return result;
    } catch (parseError) {
      console.error('Failed to parse response as JSON:', responseText.substring(0, 200));
      throw new Error('Invalid response from email API');
    }
  } catch (error) {
    console.error('Error sending email via Innerscene Secure API:', error);
    throw error;
  }
}

// Test the email sending
async function testEmail() {
  console.log('Testing Innerscene Secure Email API...');
  console.log('API Key:', process.env.INTERNAL_API_KEY ? 'Set ✓' : 'Missing ✗');
  console.log('Recipient:', process.env.EMAIL_USER);
  console.log('');

  try {
    const result = await sendEmail({
      to: process.env.EMAIL_USER,
      subject: 'Nora is calling you!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #ffffff;">
          <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <div style="font-size: 80px; line-height: 1;">👶</div>
              <h1 style="color: #333; margin: 20px 0 10px 0; font-size: 32px;">Nora is calling!</h1>
              <p style="font-size: 18px; color: #666; margin: 0;">Someone wants to see you 💕</p>
            </div>
            <div style="text-align: center; margin: 40px 0;">
              <a href="http://localhost:4001/join.html?room=test123"
                 style="background: #2196F3;
                        color: white;
                        padding: 18px 50px;
                        text-decoration: none;
                        border-radius: 8px;
                        display: inline-block;
                        font-size: 20px;
                        font-weight: bold;">
                📹 Join Video Call
              </a>
            </div>
            <div style="background: #f5f5f5; padding: 20px; margin-top: 30px;">
              <p style="color: #666; font-size: 14px; margin: 0 0 10px 0; text-align: center;">
                <strong>Quick tip:</strong> Make sure your camera and microphone are enabled!
              </p>
              <p style="color: #999; font-size: 12px; margin: 0; text-align: center;">
                Emoji test: 🎉 ✅ 📹 👶 💕 🎯
              </p>
            </div>
          </div>
        </div>
      `,
      text: 'Nora is calling! Join the video call at: http://localhost:4001/join.html?room=test123'
    });

    console.log('✅ Success!');
    console.log('Message ID:', result.messageId);
    console.log('Response:', result);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testEmail();
