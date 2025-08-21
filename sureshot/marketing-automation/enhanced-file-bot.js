#!/usr/bin/env node

/**
 * Enhanced File Validation Bot - Full Modal & Data Hygiene Workflow
 * Complete implementation with SendGrid integration and data processing
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

console.log('🚀 Enhanced File Validation Bot Starting...');
console.log('Bot Token:', process.env.SLACK_BOT_TOKEN ? '✅ Set' : '❌ Missing');
console.log('Signing Secret:', process.env.SLACK_SIGNING_SECRET ? '✅ Set' : '❌ Missing');
console.log('SendGrid API Key:', process.env.SENDGRID_API_KEY ? '✅ Set' : '❌ Missing');

// Data hygiene and validation functions
class DataHygiene {
  
  static validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return {
      valid: emailRegex.test(email),
      reason: emailRegex.test(email) ? 'Valid format' : 'Invalid email format'
    };
  }
  
  static validatePhone(phone) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
    return {
      valid: phoneRegex.test(cleaned),
      cleaned: cleaned,
      reason: phoneRegex.test(cleaned) ? 'Valid format' : 'Invalid phone format'
    };
  }
  
  static findDuplicates(data, keyField) {
    const seen = new Set();
    const duplicates = [];
    
    data.forEach((row, index) => {
      const key = row[keyField]?.toLowerCase?.() || row[keyField];
      if (seen.has(key)) {
        duplicates.push({ row: index + 1, value: key, field: keyField });
      } else {
        seen.add(key);
      }
    });
    
    return duplicates;
  }
  
  static async analyzeCSVData(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });
    
    // Detect email and phone columns
    const emailCol = headers.find(h => /email/i.test(h)) || null;
    const phoneCol = headers.find(h => /phone|mobile|tel/i.test(h)) || null;
    
    // Validate emails
    let emailValidation = null;
    if (emailCol) {
      const emails = data.map(row => row[emailCol]).filter(email => email);
      const validEmails = emails.filter(email => DataHygiene.validateEmail(email).valid);
      emailValidation = {
        total: emails.length,
        valid: validEmails.length,
        invalid: emails.length - validEmails.length,
        duplicates: DataHygiene.findDuplicates(data, emailCol).length
      };
    }
    
    // Validate phones
    let phoneValidation = null;
    if (phoneCol) {
      const phones = data.map(row => row[phoneCol]).filter(phone => phone);
      const validPhones = phones.filter(phone => DataHygiene.validatePhone(phone).valid);
      phoneValidation = {
        total: phones.length,
        valid: validPhones.length,
        invalid: phones.length - validPhones.length,
        duplicates: DataHygiene.findDuplicates(data, phoneCol).length
      };
    }
    
    return {
      rowCount: data.length,
      columnCount: headers.length,
      headers: headers,
      emailColumn: emailCol,
      phoneColumn: phoneCol,
      emailValidation: emailValidation,
      phoneValidation: phoneValidation,
      data: data.slice(0, 5) // Sample data for preview
    };
  }
  
  static async sendGridValidation(emails) {
    console.log('📧 Real SendGrid validation for', emails.length, 'emails');
    
    if (!process.env.SENDGRID_API_KEY || process.env.SENDGRID_API_KEY === 'your-sendgrid-api-key-placeholder') {
      console.log('⚠️ Using mock SendGrid validation - no API key');
      return emails.map(email => ({
        email: email,
        verdict: Math.random() > 0.2 ? 'valid' : 'invalid',
        score: Math.random(),
        local: email.split('@')[0],
        host: email.split('@')[1],
        suggestion: null,
        source: 'mock'
      }));
    }
    
    try {
      const results = [];
      
      // SendGrid Email Validation API - batch validation
      for (const email of emails.slice(0, 50)) { // Limit to 50 emails per batch
        try {
          const response = await fetch(`https://api.sendgrid.com/v3/validations/email`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email: email,
              source: 'signup'
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            results.push({
              email: email,
              verdict: data.result?.verdict || 'unknown',
              score: data.result?.score || 0,
              local: data.result?.local || email.split('@')[0],
              host: data.result?.host || email.split('@')[1],
              suggestion: data.result?.suggestion || null,
              checks: data.result?.checks || {},
              source: 'sendgrid'
            });
          } else {
            console.error('SendGrid API error for', email, ':', response.status);
            results.push({
              email: email,
              verdict: 'error',
              score: 0,
              local: email.split('@')[0],
              host: email.split('@')[1],
              suggestion: null,
              source: 'error'
            });
          }
          
          // Rate limiting - wait 100ms between requests
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error('Error validating email', email, ':', error.message);
          results.push({
            email: email,
            verdict: 'error',
            score: 0,
            local: email.split('@')[0],
            host: email.split('@')[1],
            suggestion: null,
            source: 'error'
          });
        }
      }
      
      console.log('✅ SendGrid validation completed:', results.length, 'emails processed');
      return results;
      
    } catch (error) {
      console.error('SendGrid validation failed:', error.message);
      // Fallback to mock validation
      return emails.map(email => ({
        email: email,
        verdict: 'error',
        score: 0,
        local: email.split('@')[0],
        host: email.split('@')[1],
        suggestion: null,
        source: 'fallback'
      }));
    }
  }
}

// File download helper
async function downloadSlackFile(fileId, token) {
  try {
    const fileInfo = await slack.files.info({ file: fileId });
    const response = await fetch(fileInfo.file.url_private_download, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return await response.text();
  } catch (error) {
    console.error('Error downloading file:', error);
    return null;
  }
}

// Slack signature verification
function verifySlackSignature(signature, body, timestamp) {
  if (!process.env.SLACK_SIGNING_SECRET || !signature) return false; // Fail if no secret
  
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const hmac = crypto.createHmac('sha256', signingSecret);
  const [version, hash] = signature.split('=');
  
  if (version !== 'v0') return false; // Only support v0
  
  hmac.update(`v0:${timestamp}:${body}`);
  const expectedHash = hmac.digest('hex');
  
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  } catch (error) {
    console.log('Signature verification error:', error.message);
    return false;
  }
}

// Main Slack events endpoint
app.post('/slack/events', async (req, res) => {
  console.log('📨 Received Slack event');
  
  try {
    let event;
    let bodyString;
    
    // Parse body
    if (Buffer.isBuffer(req.body)) {
      bodyString = req.body.toString();
      event = JSON.parse(bodyString);
    } else if (typeof req.body === 'string') {
      bodyString = req.body;
      event = JSON.parse(bodyString);
    } else {
      event = req.body;
      bodyString = JSON.stringify(req.body);
    }
    
    console.log('Event type:', event.type);
    
    // Handle URL verification challenge
    if (event.type === 'url_verification') {
      console.log('🔐 URL verification - responding with challenge');
      return res.status(200).send(event.challenge);
    }
    
    // Verify signature for actual events
    const signature = req.headers['x-slack-signature'];
    const timestamp = req.headers['x-slack-request-timestamp'];
    
    if (event.type !== 'url_verification' && !verifySlackSignature(signature, bodyString, timestamp)) {
      console.log('❌ Invalid signature');
      console.log('Signature:', signature?.substring(0, 20) + '...');
      console.log('Timestamp:', timestamp);
      console.log('Body length:', bodyString.length);
      console.log('Secret set:', process.env.SLACK_SIGNING_SECRET ? 'Yes' : 'No');
      return res.status(401).send('Unauthorized');
    }
    
    // Handle file_shared events - THE CORE FUNCTIONALITY
    if (event.type === 'event_callback' && event.event?.type === 'file_shared') {
      console.log('📎 File shared event detected!');
      
      // Acknowledge immediately
      res.status(200).json({ status: 'ok' });
      
      const fileId = event.event.file_id;
      const channelId = event.event.channel_id;
      const userId = event.event.user_id;
      
      try {
        // Get file information
        const fileInfo = await slack.files.info({ file: fileId });
        const file = fileInfo.file;
        
        console.log('File details:', {
          name: file.name,
          mimetype: file.mimetype,
          size: file.size
        });
        
        // Check if it's a CSV file
        const isCSV = file.name?.toLowerCase().endsWith('.csv') || 
                     file.mimetype?.includes('csv') || 
                     file.mimetype?.includes('comma-separated');
        
        if (isCSV) {
          console.log('✅ CSV file detected! Posting enhanced response...');
          
          // Post enhanced response with action buttons
          const response = await slack.chat.postMessage({
            channel: channelId,
            blocks: [
              {
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": `🔍 *CSV File Detected: ${file.name}*`
                }
              },
              {
                "type": "section",
                "fields": [
                  {
                    "type": "mrkdwn",
                    "text": `📊 *Size:* ${(file.size / 1024).toFixed(1)} KB`
                  },
                  {
                    "type": "mrkdwn",
                    "text": `📁 *Type:* ${file.mimetype || 'CSV'}`
                  }
                ]
              },
              {
                "type": "actions",
                "elements": [
                  {
                    "type": "button",
                    "text": {
                      "type": "plain_text",
                      "text": "🔍 Quick Analysis"
                    },
                    "value": fileId,
                    "action_id": "quick_analysis",
                    "style": "primary"
                  },
                  {
                    "type": "button",
                    "text": {
                      "type": "plain_text",
                      "text": "🧹 Full Data Hygiene"
                    },
                    "value": fileId,
                    "action_id": "full_hygiene"
                  },
                  {
                    "type": "button",
                    "text": {
                      "type": "plain_text",
                      "text": "📧 SendGrid Validate"
                    },
                    "value": fileId,
                    "action_id": "sendgrid_validate"
                  }
                ]
              }
            ]
          });
          
          console.log('✅ Enhanced response posted with action buttons');
          
        } else {
          console.log('❌ Non-CSV file uploaded, ignoring');
        }
        
      } catch (error) {
        console.error('Error processing file:', error.message);
      }
      
      return;
    }
    
    // Handle interactive component actions
    if (event.type === 'event_callback' && event.event?.type === 'interactive_message') {
      console.log('⚡ Interactive component action received');
      res.status(200).json({ status: 'ok' });
      // Handle button clicks here
      return;
    }
    
    // Handle other events
    res.status(200).json({ status: 'ok' });
    
  } catch (error) {
    console.error('❌ Error processing event:', error.message);
    res.status(200).json({ status: 'error', message: error.message });
  }
});

// Handle interactive components (button clicks)
app.post('/slack/interactive', async (req, res) => {
  console.log('⚡ Interactive component received');
  console.log('Raw body:', JSON.stringify(req.body, null, 2));
  
  try {
    const payload = JSON.parse(req.body.payload);
    console.log('Parsed payload:', JSON.stringify(payload, null, 2));
    
    const action = payload.actions[0];
    const fileId = action.value;
    const userId = payload.user.id;
    const channelId = payload.channel.id;
    
    console.log('Action:', action.action_id, 'File:', fileId);
    
    // Acknowledge immediately
    res.status(200).json({ status: 'ok' });
    
    if (action.action_id === 'quick_analysis') {
      await handleQuickAnalysis(fileId, channelId, userId);
    } else if (action.action_id === 'full_hygiene') {
      await handleFullHygiene(fileId, channelId, userId);
    } else if (action.action_id === 'sendgrid_validate') {
      await handleSendGridValidation(fileId, channelId, userId);
    }
    
  } catch (error) {
    console.error('Error handling interactive component:', error);
    res.status(200).json({ status: 'error' });
  }
});

// Handler functions for different actions
async function handleQuickAnalysis(fileId, channelId, userId) {
  console.log('🔍 Performing quick analysis for file:', fileId);
  
  try {
    // Download and analyze file
    const csvContent = await downloadSlackFile(fileId, process.env.SLACK_BOT_TOKEN);
    if (!csvContent) {
      await slack.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: '❌ Could not download file for analysis'
      });
      return;
    }
    
    const analysis = await DataHygiene.analyzeCSVData(csvContent);
    
    // Post analysis results
    await slack.chat.postMessage({
      channel: channelId,
      blocks: [
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `📊 *Quick Analysis Results*`
          }
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "mrkdwn",
              "text": `*Rows:* ${analysis.rowCount}`
            },
            {
              "type": "mrkdwn",
              "text": `*Columns:* ${analysis.columnCount}`
            },
            {
              "type": "mrkdwn",
              "text": `*Email Column:* ${analysis.emailColumn || 'Not found'}`
            },
            {
              "type": "mrkdwn",
              "text": `*Phone Column:* ${analysis.phoneColumn || 'Not found'}`
            }
          ]
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `*Columns:* ${analysis.headers.join(', ')}`
          }
        }
      ]
    });
    
  } catch (error) {
    console.error('Error in quick analysis:', error);
    await slack.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: '❌ Error performing quick analysis'
    });
  }
}

async function handleFullHygiene(fileId, channelId, userId) {
  console.log('🧹 Performing full data hygiene for file:', fileId);
  
  try {
    // Post processing message
    const processingMsg = await slack.chat.postMessage({
      channel: channelId,
      text: '🧹 *Processing full data hygiene...* This may take a moment.'
    });
    
    // Download and analyze file
    const csvContent = await downloadSlackFile(fileId, process.env.SLACK_BOT_TOKEN);
    if (!csvContent) {
      await slack.chat.update({
        channel: channelId,
        ts: processingMsg.ts,
        text: '❌ Could not download file for hygiene processing'
      });
      return;
    }
    
    const analysis = await DataHygiene.analyzeCSVData(csvContent);
    
    // Build hygiene results
    let hygieneBlocks = [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `🧹 *Data Hygiene Report*`
        }
      },
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": `*Total Rows:* ${analysis.rowCount}`
          },
          {
            "type": "mrkdwn",
            "text": `*Total Columns:* ${analysis.columnCount}`
          }
        ]
      }
    ];
    
    // Add email validation results
    if (analysis.emailValidation) {
      hygieneBlocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `📧 *Email Validation:*\n• Valid: ${analysis.emailValidation.valid}\n• Invalid: ${analysis.emailValidation.invalid}\n• Duplicates: ${analysis.emailValidation.duplicates}`
        }
      });
    }
    
    // Add phone validation results
    if (analysis.phoneValidation) {
      hygieneBlocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `📱 *Phone Validation:*\n• Valid: ${analysis.phoneValidation.valid}\n• Invalid: ${analysis.phoneValidation.invalid}\n• Duplicates: ${analysis.phoneValidation.duplicates}`
        }
      });
    }
    
    // Update processing message with results
    await slack.chat.update({
      channel: channelId,
      ts: processingMsg.ts,
      blocks: hygieneBlocks
    });
    
  } catch (error) {
    console.error('Error in full hygiene:', error);
    await slack.chat.postMessage({
      channel: channelId,
      text: '❌ Error performing full data hygiene'
    });
  }
}

async function handleSendGridValidation(fileId, channelId, userId) {
  console.log('📧 Performing SendGrid validation for file:', fileId);
  
  try {
    // Post processing message
    const processingMsg = await slack.chat.postMessage({
      channel: channelId,
      text: '📧 *SendGrid Email Validation in progress...* This may take a moment.'
    });
    
    // Download and analyze file
    const csvContent = await downloadSlackFile(fileId, process.env.SLACK_BOT_TOKEN);
    if (!csvContent) {
      await slack.chat.update({
        channel: channelId,
        ts: processingMsg.ts,
        text: '❌ Could not download file for SendGrid validation'
      });
      return;
    }
    
    const analysis = await DataHygiene.analyzeCSVData(csvContent);
    
    if (!analysis.emailColumn) {
      await slack.chat.update({
        channel: channelId,
        ts: processingMsg.ts,
        text: '❌ No email column found in the CSV file'
      });
      return;
    }
    
    // Extract emails for validation
    const emails = analysis.data.map(row => row[analysis.emailColumn]).filter(email => email);
    
    // Perform SendGrid validation (mock for now)
    const validationResults = await DataHygiene.sendGridValidation(emails.slice(0, 10)); // Limit for demo
    
    const validEmails = validationResults.filter(r => r.verdict === 'valid').length;
    const invalidEmails = validationResults.filter(r => r.verdict === 'invalid').length;
    const errorEmails = validationResults.filter(r => r.verdict === 'error').length;
    const realSendGrid = validationResults.some(r => r.source === 'sendgrid');
    
    // Calculate average score for valid emails
    const validResults = validationResults.filter(r => r.verdict === 'valid' && r.score);
    const avgScore = validResults.length > 0 ? 
      (validResults.reduce((sum, r) => sum + r.score, 0) / validResults.length * 100).toFixed(1) : 0;
    
    // Build result blocks
    let resultBlocks = [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": `📧 *SendGrid Email Validation Results*${realSendGrid ? ' (Live API)' : ' (Demo Mode)'}`
        }
      },
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": `*Total Processed:* ${validationResults.length}`
          },
          {
            "type": "mrkdwn",
            "text": `*✅ Valid:* ${validEmails}`
          },
          {
            "type": "mrkdwn",
            "text": `*❌ Invalid:* ${invalidEmails}`
          },
          {
            "type": "mrkdwn",
            "text": `*⚠️ Errors:* ${errorEmails}`
          }
        ]
      }
    ];
    
    // Add quality metrics if we have real SendGrid data
    if (realSendGrid && validEmails > 0) {
      resultBlocks.push({
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": `*Success Rate:* ${((validEmails / (validEmails + invalidEmails)) * 100).toFixed(1)}%`
          },
          {
            "type": "mrkdwn",
            "text": `*Avg Quality Score:* ${avgScore}%`
          }
        ]
      });
    }
    
    // Add sample results
    const sampleValid = validationResults.filter(r => r.verdict === 'valid').slice(0, 3);
    const sampleInvalid = validationResults.filter(r => r.verdict === 'invalid').slice(0, 2);
    
    if (sampleValid.length > 0 || sampleInvalid.length > 0) {
      let sampleText = '*Sample Results:*\n';
      
      sampleValid.forEach(r => {
        sampleText += `✅ ${r.email}${r.score ? ` (${(r.score * 100).toFixed(0)}%)` : ''}\n`;
      });
      
      sampleInvalid.forEach(r => {
        sampleText += `❌ ${r.email}${r.suggestion ? ` → ${r.suggestion}` : ''}\n`;
      });
      
      resultBlocks.push({
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": sampleText.trim()
        }
      });
    }
    
    resultBlocks.push({
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": `${realSendGrid ? '🚀' : '🔧'} *SendGrid validation ${realSendGrid ? 'complete' : 'demo completed'}!* ${realSendGrid ? 'Real-time email deliverability analysis.' : 'Use real SendGrid API key for live validation.'}`
      }
    });
    
    // Update with enhanced results
    await slack.chat.update({
      channel: channelId,
      ts: processingMsg.ts,
      blocks: resultBlocks
    });
    
  } catch (error) {
    console.error('Error in SendGrid validation:', error);
    await slack.chat.postMessage({
      channel: channelId,
      text: '❌ Error performing SendGrid validation'
    });
  }
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'enhanced-file-bot',
    timestamp: new Date().toISOString(),
    features: [
      'file-detection',
      'modal-workflow', 
      'data-hygiene',
      'sendgrid-integration'
    ]
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).send(`
    <h1>🚀 Enhanced File Validation Bot</h1>
    <p>✅ Bot is running with full functionality</p>
    <p>🔍 Features:</p>
    <ul>
      <li>📎 Automatic CSV file detection</li>
      <li>🔍 Quick analysis with column detection</li>
      <li>🧹 Full data hygiene processing</li>
      <li>📧 SendGrid email validation</li>
      <li>⚡ Interactive modal workflow</li>
    </ul>
    <hr>
    <p><strong>Status:</strong></p>
    <ul>
      <li>Bot Token: ${process.env.SLACK_BOT_TOKEN ? '✅ Set' : '❌ Missing'}</li>
      <li>Signing Secret: ${process.env.SLACK_SIGNING_SECRET ? '✅ Set' : '❌ Missing'}</li>
      <li>SendGrid Key: ${process.env.SENDGRID_API_KEY ? '✅ Set' : '❌ Missing'}</li>
    </ul>
  `);
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log('⚡ Enhanced File Validation Bot ACTIVE!');
  console.log(`🌐 Server running on port ${port}`);
  console.log('🔗 Endpoints: /slack/events, /slack/interactive');
  console.log('📎 Ready for advanced CSV validation!');
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});