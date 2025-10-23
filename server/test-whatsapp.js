#!/usr/bin/env node
/**
 * Test WhatsApp notification via Twilio
 */

require('dotenv').config();

async function testWhatsApp() {
  console.log('\n🧪 Testing WhatsApp notification via Twilio...\n');

  // Check environment variables
  console.log('Environment check:');
  console.log(`  TWILIO_ACCOUNT_SID: ${process.env.TWILIO_ACCOUNT_SID ? '✓ Set' : '✗ Not set'}`);
  console.log(`  TWILIO_AUTH_TOKEN: ${process.env.TWILIO_AUTH_TOKEN ? '✓ Set' : '✗ Not set'}`);
  console.log(`  TWILIO_WHATSAPP_FROM: ${process.env.TWILIO_WHATSAPP_FROM || '✗ Not set'}`);
  console.log(`  TWILIO_WHATSAPP_CONTENT_SID: ${process.env.TWILIO_WHATSAPP_CONTENT_SID || '✗ Not set'}`);
  console.log();

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error('❌ Missing Twilio credentials in .env file');
    process.exit(1);
  }

  if (process.env.TWILIO_AUTH_TOKEN === '[AuthToken]') {
    console.error('❌ TWILIO_AUTH_TOKEN is still set to placeholder [AuthToken]');
    console.error('   Please update it with your actual Twilio auth token');
    process.exit(1);
  }

  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    // Get phone number to send to
    const toNumber = process.argv[2] || 'whatsapp:+14158198919';

    console.log(`Sending test WhatsApp message to: ${toNumber}\n`);

    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      contentSid: process.env.TWILIO_WHATSAPP_CONTENT_SID,
      contentVariables: JSON.stringify({
        "1": "Test User",
        "2": "now"
      }),
      to: toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`
    });

    console.log('✅ WhatsApp message sent successfully!\n');
    console.log('Message details:');
    console.log(`  SID: ${message.sid}`);
    console.log(`  Status: ${message.status}`);
    console.log(`  To: ${message.to}`);
    console.log(`  From: ${message.from}`);
    console.log(`  Date: ${message.dateCreated}`);
    console.log();

  } catch (error) {
    console.error('❌ Failed to send WhatsApp message:\n');
    if (error.code) {
      console.error(`  Error Code: ${error.code}`);
    }
    console.error(`  Error Message: ${error.message}`);
    if (error.moreInfo) {
      console.error(`  More Info: ${error.moreInfo}`);
    }
    console.error();
    process.exit(1);
  }
}

// Show usage
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node test-whatsapp.js [phone_number]

Examples:
  node test-whatsapp.js                           # Uses default test number
  node test-whatsapp.js +14158198919             # Send to specific number
  node test-whatsapp.js whatsapp:+14158198919    # Send to WhatsApp number

Note: The phone number must be:
1. Registered with Twilio WhatsApp sandbox (for testing), OR
2. An approved WhatsApp Business number (for production)
`);
  process.exit(0);
}

testWhatsApp();
