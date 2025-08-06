#!/usr/bin/env node

/**
 * Quick Slack App Configuration Update
 * Automates common Slack app configuration tasks
 */

import { WebClient } from '@slack/web-api';
import fs from 'fs/promises';
import path from 'path';

const FLY_APP_URL = 'https://connexio-slack-simple.fly.dev';

class SlackAppUpdater {
  constructor() {
    this.botToken = process.env.SLACK_BOT_TOKEN;
    this.userToken = process.env.SLACK_USER_TOKEN; // Needed for app management
    this.appId = process.env.SLACK_APP_ID;
    
    if (!this.botToken || !this.appId) {
      console.error('❌ Missing required environment variables:');
      console.error('   SLACK_BOT_TOKEN, SLACK_APP_ID');
      process.exit(1);
    }
    
    this.client = new WebClient(this.botToken);
    this.userClient = this.userToken ? new WebClient(this.userToken) : null;
  }

  async testConnection() {
    console.log('🔍 Testing Slack API connection...');
    
    try {
      const response = await this.client.auth.test();
      console.log(`✅ Connected as: ${response.user} (${response.team})`);
      return true;
    } catch (error) {
      console.error('❌ Slack API connection failed:', error.message);
      return false;
    }
  }

  async testBotEndpoints() {
    console.log('🧪 Testing bot endpoints...');
    
    const endpoints = [
      '/slack/events',
      '/health'
    ];
    
    for (const endpoint of endpoints) {
      const url = `${FLY_APP_URL}${endpoint}`;
      console.log(`  Testing: ${url}`);
      
      try {
        const response = await fetch(url, {
          method: endpoint === '/slack/events' ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: endpoint === '/slack/events' ? 
            JSON.stringify({ type: 'url_verification', challenge: 'test' }) : 
            undefined
        });
        
        if (response.ok) {
          console.log(`    ✅ OK (${response.status})`);
        } else {
          console.log(`    ⚠️  HTTP ${response.status}`);
        }
      } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
      }
    }
  }

  async updateAppManifest() {
    console.log('📋 Updating app manifest...');
    
    try {
      const manifestPath = path.join(process.cwd(), 'slack-app-manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);
      
      console.log('📝 Current manifest configuration:');
      console.log(`  - Slash commands: ${manifest.features.slash_commands?.length || 0}`);
      console.log(`  - Bot events: ${manifest.settings.event_subscriptions?.bot_events?.length || 0}`);
      console.log(`  - Request URL: ${manifest.settings.event_subscriptions?.request_url}`);
      
      // Note: Actual manifest update requires admin permissions and specific API calls
      console.log('');
      console.log('🔧 To update the manifest:');
      console.log(`1. Go to: https://api.slack.com/apps/${this.appId}/app-manifest`);
      console.log('2. Copy the contents of slack-app-manifest.json');
      console.log('3. Paste and save in the Slack App dashboard');
      
      return true;
    } catch (error) {
      console.error('❌ Manifest update failed:', error.message);
      return false;
    }
  }

  async validateSlashCommands() {
    console.log('⚡ Validating slash commands...');
    
    const expectedCommands = [
      { command: '/connexio', description: 'AI marketing assistant' },
      { command: '/validate-file', description: 'File validation service' },
      { command: '/help', description: 'Command help' }
    ];
    
    console.log('Expected commands:');
    expectedCommands.forEach(cmd => {
      console.log(`  ${cmd.command} - ${cmd.description}`);
    });
    
    console.log('');
    console.log('🔧 To verify/update slash commands:');
    console.log(`1. Go to: https://api.slack.com/apps/${this.appId}/slash-commands`);
    console.log(`2. Ensure all commands point to: ${FLY_APP_URL}/slack/events`);
    console.log('3. Test each command in your Slack workspace');
  }

  async generateUpdateInstructions() {
    console.log('');
    console.log('📋 SLACK APP UPDATE INSTRUCTIONS');
    console.log('==================================');
    console.log('');
    console.log('🔗 Slack App Dashboard:');
    console.log(`   https://api.slack.com/apps/${this.appId}`);
    console.log('');
    console.log('⚡ Slash Commands to Update:');
    console.log('   1. Go to "Slash Commands" section');
    console.log('   2. For each command, set Request URL to:');
    console.log(`      ${FLY_APP_URL}/slack/events`);
    console.log('');
    console.log('📡 Event Subscriptions:');
    console.log('   1. Go to "Event Subscriptions" section');
    console.log('   2. Set Request URL to:');
    console.log(`      ${FLY_APP_URL}/slack/events`);
    console.log('   3. Subscribe to bot events: file_shared, app_mention');
    console.log('');
    console.log('🔑 OAuth & Permissions:');
    console.log('   Required scopes: commands, chat:write, files:read, channels:history');
    console.log('');
    console.log('🧪 Testing Commands:');
    console.log('   - /connexio → Should show AI assistant greeting');
    console.log('   - /validate-file → Should show file validation help');
    console.log('   - Upload CSV → Bot should detect and offer to validate');
  }

  async run() {
    console.log('🤖 Connexio AI Slack App Configuration Update');
    console.log('==============================================');
    console.log('');
    
    const connected = await this.testConnection();
    if (!connected) return;
    
    await this.testBotEndpoints();
    await this.validateSlashCommands();
    await this.updateAppManifest();
    await this.generateUpdateInstructions();
    
    console.log('');
    console.log('✅ Configuration validation completed!');
    console.log('');
    console.log('🚀 Next steps:');
    console.log('1. Follow the update instructions above');
    console.log('2. Test commands in your Slack workspace');
    console.log('3. Upload a CSV file to test file validation');
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const updater = new SlackAppUpdater();
  updater.run().catch(console.error);
}

export default SlackAppUpdater;