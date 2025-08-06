#!/usr/bin/env node

/**
 * Extract Xceleration Client Threads for Claude Training
 * Run this script to extract and process marketing conversations
 */

const { SlackThreadExtractor } = require('./services/slack-thread-extractor');

async function main() {
  console.log('🎯 Anonymized Client Thread Extraction for Marketing Expertise');
  console.log('================================================================\n');

  // Check for required environment variables
  if (!process.env.SLACK_BOT_TOKEN) {
    console.error('❌ Missing SLACK_BOT_TOKEN environment variable');
    console.log('💡 Set your Slack bot token:');
    console.log('   export SLACK_BOT_TOKEN=xoxb-your-token-here');
    process.exit(1);
  }

  try {
    const extractor = new SlackThreadExtractor(process.env.SLACK_BOT_TOKEN);
    const result = await extractor.extractAndProcess();

    if (result) {
      console.log('\n✅ SUCCESS! Thread data extracted and processed.');
      console.log('\n📋 Next Steps:');
      console.log('1. Review the generated files in:', result.outputDir);
      console.log('2. Examine marketing tactics and client patterns');
      console.log('3. Integrate insights into Connexio AI training');
      console.log('4. Test enhanced marketing expertise');
      
      console.log('\n🤖 Integration Options:');
      console.log('• Add real-world marketing expertise to Claude system prompts');
      console.log('• Create client-agency conversation templates');
      console.log('• Use persona patterns for better response targeting');
      console.log('• Enhance file validation with actual client pain points');
      console.log('\n🔒 Privacy Features:');
      console.log('• Names anonymized to persona references');
      console.log('• Personal data (emails, phones) removed');
      console.log('• Focus on marketing tactics and strategies');
    } else {
      console.log('\n❌ Extraction failed. Check permissions and channel access.');
    }

  } catch (error) {
    console.error('\n💥 Error during extraction:', error.message);
    console.log('\n🔍 Troubleshooting:');
    console.log('• Verify bot has access to client-xceleration channel');
    console.log('• Check if bot has conversations:history permission');
    console.log('• Ensure bot is added to the private channel');
    console.log('• Verify SLACK_BOT_TOKEN is correct and active');
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Xceleration Thread Extractor

Usage:
  node src/extract-xceleration-threads.js

Environment Variables:
  SLACK_BOT_TOKEN    Your Slack bot token (required)

Features:
  • Finds client-xceleration channel automatically
  • Anonymizes participants as CLIENT_PROGRAM_MANAGER, SURESHOT_PROGRAM_MANAGER, MARKETING_OPS_EXPERT
  • Extracts all messages and thread replies with privacy protection
  • Processes for marketing insights and real-world tactics
  • Exports anonymized training data for Claude AI enhancement

Output Files:
  • xceleration-insights-YYYY-MM-DD.json    - Full conversation data
  • claude-training-YYYY-MM-DD.txt         - Training format for AI
  • conversation-summary-YYYY-MM-DD.md     - Human-readable summary

Example:
  export SLACK_BOT_TOKEN=your-slack-bot-token
  node src/extract-xceleration-threads.js
  `);
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };