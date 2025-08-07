#!/usr/bin/env node
/**
 * Production Startup Script
 * Starts the complete production file delivery system
 */

require('dotenv').config();
const ProductionBot = require('./production-bot.js');

async function startProductionSystem() {
  console.log('🚀 Starting Connexio AI Production File Delivery System...\n');

  // Validate required environment variables
  const requiredEnvVars = [
    'SLACK_BOT_TOKEN',
    'SLACK_SIGNING_SECRET'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\nPlease configure these variables in your .env file');
    process.exit(1);
  }

  // Configuration
  const config = {
    storageDir: process.env.STORAGE_DIR || './storage',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB
    retentionDays: parseInt(process.env.RETENTION_DAYS) || 30,
    downloadPort: parseInt(process.env.DOWNLOAD_PORT) || 3001,
    
    // Optional Enterprise API configuration
    validationApiKey: process.env.VALIDATION_API_KEY,
    aiApiKey: process.env.AI_API_KEY
  };

  console.log('📋 Configuration:');
  console.log(`   Storage Directory: ${config.storageDir}`);
  console.log(`   Max File Size: ${Math.round(config.maxFileSize / (1024 * 1024))}MB`);
  console.log(`   File Retention: ${config.retentionDays} days`);
  console.log(`   Download Port: ${config.downloadPort}`);
  console.log(`   Validation API: ${config.validationApiKey ? '✅ Configured' : '⚠️  Not configured (demo mode)'}`);
  console.log(`   AI API: ${config.aiApiKey ? '✅ Configured' : '⚠️  Not configured (demo mode)'}\n`);

  try {
    // Create production bot instance
    const bot = new ProductionBot(config);

    // Start the production system
    await bot.start();

    console.log('\n✅ Production file delivery system is running successfully!');
    console.log('\n📖 Usage Instructions:');
    console.log('   1. Upload a CSV file to any Slack channel where the bot is installed');
    console.log('   2. Use /validate-file start to begin processing');
    console.log('   3. Receive secure download link with validated results');
    console.log('\n💡 Available Commands:');
    console.log('   /connexio - Meet your AI assistant');
    console.log('   /validate-file - Production file validation service');
    console.log('   /validate-file start - Process uploaded files');
    console.log('   /validate-file status - Check processing status');
    console.log('\n🔧 System Features:');
    console.log('   • Enterprise email validation');
    console.log('   • AI-powered deduplication');
    console.log('   • Secure encrypted file storage');
    console.log('   • Temporary download links with expiration');
    console.log('   • Rate limiting and access controls');
    console.log('   • Automatic file cleanup and monitoring');

  } catch (error) {
    console.error('❌ Failed to start production system:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Verify Slack credentials in .env file');
    console.error('   2. Ensure bot has proper permissions in Slack');
    console.error('   3. Check network connectivity');
    console.error('   4. Verify storage directory permissions');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Gracefully shutting down production system...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Gracefully shutting down production system...');
  process.exit(0);
});

// Start the production system
if (require.main === module) {
  startProductionSystem();
}

module.exports = startProductionSystem;