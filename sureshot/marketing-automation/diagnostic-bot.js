#!/usr/bin/env node

/**
 * DIAGNOSTIC BOT - Comprehensive Testing Tool
 * Tests all aspects of Slack integration step by step
 */

import express from 'express';
import pkg from '@slack/web-api';
const { WebClient } = pkg;
import crypto from 'crypto';

const app = express();
const port = process.env.PORT || 3000;

// Initialize Slack Web API client
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// Parse JSON bodies
app.use(express.json());
app.use('/slack/events', express.raw({ type: 'application/json' }));
app.use('/slack/interactive', express.urlencoded({ extended: true }));

console.log('🔧 DIAGNOSTIC BOT Starting...');
console.log('Bot Token:', process.env.SLACK_BOT_TOKEN ? '✅ Set (length: ' + process.env.SLACK_BOT_TOKEN.length + ')' : '❌ Missing');
console.log('Signing Secret:', process.env.SLACK_SIGNING_SECRET ? '✅ Set (length: ' + process.env.SLACK_SIGNING_SECRET.length + ')' : '❌ Missing');
console.log('SendGrid API Key:', process.env.SENDGRID_API_KEY ? '✅ Set' : '❌ Missing');

// Test 1: Health Check Endpoint
app.get('/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    credentials: {
      slack_bot_token: !!process.env.SLACK_BOT_TOKEN,
      slack_signing_secret: !!process.env.SLACK_SIGNING_SECRET,
      sendgrid_api_key: !!process.env.SENDGRID_API_KEY
    }
  });
});

// Test 2: Signature Verification Function
function verifySlackSignature(signature, body, timestamp) {
  console.log('🔐 Testing signature verification...');
  console.log('Signature received:', signature?.substring(0, 20) + '...');
  console.log('Timestamp:', timestamp);
  console.log('Body length:', body.length);
  console.log('Secret available:', !!process.env.SLACK_SIGNING_SECRET);
  
  if (!process.env.SLACK_SIGNING_SECRET || !signature) {
    console.log('❌ Missing signing secret or signature');
    return false;
  }
  
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const hmac = crypto.createHmac('sha256', signingSecret);
  const [version, hash] = signature.split('=');
  
  console.log('Signature version:', version);
  console.log('Hash length:', hash?.length);
  
  if (version !== 'v0') {
    console.log('❌ Invalid signature version:', version);
    return false;
  }
  
  const baseString = `v0:${timestamp}:${body}`;
  console.log('Base string length:', baseString.length);
  
  hmac.update(baseString);
  const expectedHash = hmac.digest('hex');
  
  console.log('Expected hash:', expectedHash.substring(0, 20) + '...');
  console.log('Received hash:', hash?.substring(0, 20) + '...');
  
  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
    console.log('Signature verification result:', isValid ? '✅ VALID' : '❌ INVALID');
    return isValid;
  } catch (error) {
    console.log('❌ Signature verification error:', error.message);
    return false;
  }
}

// Test 3: Main Slack Events Endpoint with Comprehensive Logging
app.post('/slack/events', async (req, res) => {
  console.log('\n🚨 === SLACK EVENT RECEIVED ===');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  let bodyString;
  let event;
  
  try {
    if (Buffer.isBuffer(req.body)) {
      bodyString = req.body.toString('utf8');
      event = JSON.parse(bodyString);
    } else {
      event = req.body;
      bodyString = JSON.stringify(req.body);
    }
    
    console.log('📋 Event parsed successfully');
    console.log('Event type:', event.type);
    console.log('Event data:', JSON.stringify(event, null, 2));
    
    // Test URL verification challenge
    if (event.type === 'url_verification') {
      console.log('🔐 URL verification challenge detected');
      console.log('Challenge:', event.challenge);
      return res.status(200).send(event.challenge);
    }
    
    // Test signature verification
    const signature = req.headers['x-slack-signature'];
    const timestamp = req.headers['x-slack-request-timestamp'];
    
    console.log('\n🔒 === SIGNATURE VERIFICATION TEST ===');
    const isValidSignature = verifySlackSignature(signature, bodyString, timestamp);
    
    if (!isValidSignature) {
      console.log('❌ SIGNATURE VERIFICATION FAILED - Rejecting request');
      return res.status(401).send('Unauthorized');
    }
    
    console.log('✅ SIGNATURE VERIFICATION PASSED');
    
    // Test file_shared event detection
    if (event.type === 'event_callback' && event.event?.type === 'file_shared') {
      console.log('\n📎 === FILE SHARED EVENT DETECTED ===');
      console.log('File event data:', JSON.stringify(event.event, null, 2));
      
      const fileId = event.event.file_id;
      const channelId = event.event.channel_id;
      
      console.log('File ID:', fileId);
      console.log('Channel ID:', channelId);
      
      // Acknowledge immediately
      res.status(200).json({ status: 'received' });
      
      try {
        // Test file info retrieval
        console.log('🔍 Testing file info retrieval...');
        const fileInfo = await slack.files.info({ file: fileId });
        console.log('File info retrieved:', {
          name: fileInfo.file.name,
          mimetype: fileInfo.file.mimetype,
          size: fileInfo.file.size,
          url: fileInfo.file.url_private_download?.substring(0, 50) + '...'
        });
        
        const file = fileInfo.file;
        const isCSV = file.name?.toLowerCase().endsWith('.csv') || file.mimetype?.includes('csv');
        
        console.log('Is CSV file?', isCSV);
        
        if (isCSV) {
          console.log('✅ CSV FILE DETECTED - Testing response...');
          
          // Test basic message posting
          const response = await slack.chat.postMessage({
            channel: channelId,
            text: `🧪 **DIAGNOSTIC TEST SUCCESSFUL**\n\n` +
                  `✅ CSV File Detected: ${file.name}\n` +
                  `✅ Signature Verification: PASSED\n` +
                  `✅ File Info Retrieval: WORKING\n` +
                  `✅ Message Posting: WORKING\n\n` +
                  `🎯 Ready for enhanced modal testing!`,
            blocks: [
              {
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": `🧪 **DIAGNOSTIC TEST SUCCESSFUL**\n\n✅ CSV File: ${file.name}\n✅ All systems working!`
                }
              },
              {
                "type": "actions",
                "elements": [
                  {
                    "type": "button",
                    "text": { "type": "plain_text", "text": "🧪 Test Interactive" },
                    "action_id": "diagnostic_test",
                    "style": "primary"
                  }
                ]
              }
            ]
          });
          
          console.log('Message posted successfully, message TS:', response.ts);
        } else {
          console.log('ℹ️  Not a CSV file, ignoring');
        }
        
      } catch (error) {
        console.log('❌ Error during file processing:', error.message);
        console.log('Error details:', error);
      }
      
      return;
    }
    
    // Test other event types
    console.log('ℹ️  Other event type received:', event.type);
    res.status(200).json({ status: 'received' });
    
  } catch (error) {
    console.log('❌ Error processing event:', error.message);
    console.log('Error stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
  
  console.log('=== END SLACK EVENT ===\n');
});

// Test 4: Interactive Components Endpoint
app.post('/slack/interactive', async (req, res) => {
  console.log('\n🎮 === INTERACTIVE COMPONENT RECEIVED ===');
  console.log('Raw body:', JSON.stringify(req.body, null, 2));
  
  try {
    const payload = JSON.parse(req.body.payload);
    console.log('Parsed payload:', JSON.stringify(payload, null, 2));
    
    if (payload.actions?.[0]?.action_id === 'diagnostic_test') {
      console.log('🧪 Diagnostic test button clicked');
      
      // Acknowledge quickly
      res.status(200).send('');
      
      // Test modal opening
      await slack.views.open({
        trigger_id: payload.trigger_id,
        view: {
          type: 'modal',
          title: { type: 'plain_text', text: '🧪 Diagnostic Test' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*🎉 Interactive Components Working!*\n\n✅ Button click detected\n✅ Modal opened successfully\n✅ All systems operational'
              }
            }
          ]
        }
      });
      
      console.log('✅ Modal opened successfully');
      return;
    }
    
    res.status(200).send('');
    
  } catch (error) {
    console.log('❌ Error processing interactive component:', error.message);
    res.status(500).send('Error');
  }
  
  console.log('=== END INTERACTIVE COMPONENT ===\n');
});

// Start server
app.listen(port, () => {
  console.log(`\n🚀 DIAGNOSTIC BOT ACTIVE ON PORT ${port}`);
  console.log(`🔗 Health Check: http://localhost:${port}/health`);
  console.log(`🔗 Slack Events: http://localhost:${port}/slack/events`);
  console.log(`🔗 Interactive: http://localhost:${port}/slack/interactive`);
  console.log(`📋 Ready for comprehensive testing!\n`);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Diagnostic bot shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Diagnostic bot terminated...');
  process.exit(0);
});