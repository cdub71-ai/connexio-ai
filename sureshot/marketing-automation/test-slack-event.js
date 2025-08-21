#!/usr/bin/env node

/**
 * Test script to simulate a Slack file_shared event
 * This will help us test our endpoint with proper Slack signature
 */

import crypto from 'crypto';

const SLACK_SIGNING_SECRET = "1066af9b089f124d8f94b577bcad4801";
const timestamp = Math.floor(Date.now() / 1000).toString();

// Simulate a file_shared event
const eventPayload = {
  "token": "verification_token",
  "team_id": "T0001",
  "api_app_id": "A0001",
  "event": {
    "type": "file_shared",
    "file_id": "F123456789",
    "user_id": "U123456789",
    "channel_id": "C123456789",
    "ts": "1234567890.123456"
  },
  "type": "event_callback",
  "event_id": "Ev123456789",
  "event_time": 1234567890
};

const bodyString = JSON.stringify(eventPayload);

// Generate proper Slack signature
const hmac = crypto.createHmac('sha256', SLACK_SIGNING_SECRET);
const baseString = `v0:${timestamp}:${bodyString}`;
hmac.update(baseString);
const signature = `v0=${hmac.digest('hex')}`;

console.log('🧪 Testing Slack Event Simulation');
console.log('Timestamp:', timestamp);
console.log('Signature:', signature);
console.log('Body length:', bodyString.length);
console.log('Payload:', JSON.stringify(eventPayload, null, 2));

// Send the test event
const testEvent = async () => {
  try {
    const response = await fetch('https://connexio-file-bot.fly.dev/slack/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Slack-Signature': signature,
        'X-Slack-Request-Timestamp': timestamp,
        'X-Slack-Retry-Num': '1',
        'X-Slack-Retry-Reason': 'http_timeout'
      },
      body: bodyString
    });
    
    const responseText = await response.text();
    
    console.log('\n📡 Response:');
    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers));
    console.log('Body:', responseText);
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
};

testEvent();