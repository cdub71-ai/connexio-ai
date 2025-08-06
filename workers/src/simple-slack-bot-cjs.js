const { App } = require('@slack/bolt');

const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || '')
};

class SimpleSlackBot {
  constructor() {
    this.app = new App({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      socketMode: false, // Use HTTP mode instead of socket mode
    });

    this.setupCommands();
    this.setupEvents();
    
    logger.info('Simple Slack Bot initialized');
  }

  setupCommands() {
    // /connexio command
    this.app.command('/connexio', async ({ command, ack, respond }) => {
      await ack();
      
      try {
        const userMessage = command.text || 'help';
        
        // Simple AI-like responses based on keywords
        let response = this.generateResponse(userMessage);
        
        await respond({
          text: `🤖 **Connexio AI Assistant**\n\n${response}`,
          response_type: 'ephemeral',
        });

        logger.info('Connexio command processed', {
          userId: command.user_id,
          command: command.text,
        });

      } catch (error) {
        logger.error('Connexio command error:', error);
        await respond({
          text: 'Sorry, I encountered an error processing your request. Please try again.',
          response_type: 'ephemeral',
        });
      }
    });

    // /create-campaign command
    this.app.command('/create-campaign', async ({ command, ack, respond }) => {
      await ack();
      
      try {
        const campaignDetails = command.text || 'general campaign';
        
        await respond({
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🚀 **Campaign Creation Request**\n\nI'll help you create a campaign: *${campaignDetails}*\n\n**Next Steps:**\n• Analyzing your request\n• Setting up campaign parameters\n• Preparing audience targeting\n\n_This is a simplified response. Full campaign creation coming soon!_`,
              },
            },
          ],
          response_type: 'ephemeral',
        });
        
        logger.info('Create campaign command processed', {
          userId: command.user_id,
          details: campaignDetails,
        });
        
      } catch (error) {
        logger.error('Create campaign error:', error);
        await respond('Error processing campaign creation request.');
      }
    });

    // /campaign-status command
    this.app.command('/campaign-status', async ({ command, ack, respond }) => {
      await ack();
      
      const campaignId = command.text?.trim() || 'sample-campaign';
      
      try {
        await respond({
          text: `📊 **Campaign Status: ${campaignId}**\n\n` +
                `**Status:** Active\n` +
                `**Created:** ${new Date().toLocaleDateString()}\n` +
                `**Sent:** 150\n` +
                `**Opens:** 45 (30%)\n` +
                `**Clicks:** 12 (8%)\n\n` +
                `_This is sample data. Real campaign tracking coming soon!_`,
          response_type: 'ephemeral',
        });
        
        logger.info('Campaign status requested', {
          userId: command.user_id,
          campaignId: campaignId,
        });
        
      } catch (error) {
        logger.error('Campaign status error:', error);
        await respond('Error retrieving campaign status.');
      }
    });
  }

  setupEvents() {
    // App mentions
    this.app.event('app_mention', async ({ event, say }) => {
      try {
        const response = this.generateResponse(event.text);
        
        await say({
          text: `🤖 ${response}`,
          thread_ts: event.ts,
        });
        
        logger.info('App mention processed', {
          userId: event.user,
          channelId: event.channel,
        });
        
      } catch (error) {
        logger.error('App mention error:', error);
        await say('Sorry, I encountered an error processing your message.');
      }
    });

    // Global error handler
    this.app.error((error) => {
      logger.error('Slack app error:', error);
    });
  }

  generateResponse(message) {
    const msg = message.toLowerCase();
    
    if (msg.includes('help') || msg.includes('?')) {
      return `**Available Commands:**\n• \`/connexio [request]\` - Ask me anything about marketing\n• \`/create-campaign [details]\` -  Create a new campaign\n• \`/campaign-status [id]\` - Check campaign status\n• **@connexio-ai** - Mention me for assistance\n\n**Example:** \`/connexio create email campaign for new leads\``;
    }
    
    if (msg.includes('campaign') || msg.includes('email') || msg.includes('marketing')) {
      return `I can help you create and manage marketing campaigns! Here are some things I can assist with:\n\n• **Email Campaigns** - Design and send targeted emails\n• **Audience Segmentation** - Find the right people\n• **Campaign Analytics** - Track performance\n• **A/B Testing** - Optimize your messaging\n\nWhat specific campaign would you like to create?`;
    }
    
    if (msg.includes('sureshot') || msg.includes('eloqua')) {
      return `I can integrate with SureShot and Eloqua to:\n\n• Create automated campaigns\n• Sync audience data\n• Track campaign performance\n• Generate reports\n\nWhat would you like me to help you with?`;
    }
    
    if (msg.includes('status') || msg.includes('analytics') || msg.includes('report')) {
      return `📊 I can provide campaign insights including:\n\n• **Performance Metrics** - Opens, clicks, conversions\n• **Audience Analytics** - Engagement patterns\n• **Campaign Comparisons** - A/B test results\n• **ROI Analysis** - Return on investment\n\nUse \`/campaign-status [campaign-id]\` to check specific campaigns.`;
    }
    
    // Default response
    return `I'm your AI marketing assistant! I can help with:\n\n• Creating targeted campaigns\n• Analyzing performance data\n• Managing audience segments\n• Integrating with marketing tools\n\nTry asking me to create a campaign or check on campaign performance. What can I help you with today?`;
  }

  async start(port = 3000) {
    try {
      await this.app.start(port);
      logger.info(`🚀 Simple Slack Bot is running on port ${port}!`);
      
    } catch (error) {
      logger.error('Failed to start Simple Slack Bot:', error);
      throw error;
    }
  }

  async shutdown() {
    try {
      await this.app.stop();
      logger.info('Simple Slack Bot shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }
}

module.exports = SimpleSlackBot;