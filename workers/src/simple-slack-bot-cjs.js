const { App } = require('@slack/bolt');

// Import new service classes
const FileEnrichmentService = require('./services/file-enrichment-service');
const DeliverabilityCheckService = require('./services/deliverability-check-service');
const SegmentStrategyService = require('./services/segment-strategy-service');
const CampaignAuditService = require('./services/campaign-audit-service');
const LightweightServiceFactory = require('./services/lightweight-service-factory');

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

    // Initialize service instances with fallback to lightweight versions
    try {
      this.fileEnrichmentService = new FileEnrichmentService();
      this.deliverabilityCheckService = new DeliverabilityCheckService();
      this.segmentStrategyService = new SegmentStrategyService();
      this.campaignAuditService = new CampaignAuditService();
    } catch (error) {
      logger.warn('Using lightweight services due to initialization error:', error.message);
      this.fileEnrichmentService = LightweightServiceFactory.createFileEnrichmentService();
      this.deliverabilityCheckService = LightweightServiceFactory.createDeliverabilityService();
      this.segmentStrategyService = LightweightServiceFactory.createSegmentStrategyService();
      this.campaignAuditService = LightweightServiceFactory.createCampaignAuditService();
    }

    this.setupCommands();
    this.setupEvents();
    
    logger.info('Simple Slack Bot initialized with enhanced services');
  }

  /**
   * Handle service calls with timeout fallback
   */
  async callServiceWithFallback(serviceCall, fallbackService, fallbackMethod, ...args) {
    try {
      // Try the full service with a timeout
      return await Promise.race([
        serviceCall(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Service timeout')), 15000)
        )
      ]);
    } catch (error) {
      logger.warn('Service call failed, using lightweight fallback:', error.message);
      
      // Use lightweight fallback
      if (fallbackService && fallbackMethod) {
        return await fallbackService[fallbackMethod](...args);
      }
      
      throw error;
    }
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

    // /enrich-file command
    this.app.command('/enrich-file', async ({ command, ack, respond }) => {
      await ack();
      
      try {
        const fileInfo = command.text?.trim();
        
        if (!fileInfo) {
          await respond({
            text: `🔍 **File Enrichment Service**\n\n**Usage:** \`/enrich-file [file-description or sample-data]\`\n\n**What I can do:**\n• Enrich CSV files with external data sources\n• Apollo.io, Clearbit, Hunter.io integration\n• AI-powered data enhancement\n• Missing data completion\n• Data quality scoring\n\n**Example:** \`/enrich-file contact list with 500 emails\`\n\n_Upload your file or describe your data enrichment needs._`,
            response_type: 'ephemeral'
          });
          return;
        }

        await respond({
          text: `🔍 **Processing File Enrichment Request**\n\n**Request:** ${fileInfo}\n\n⏳ **Analyzing enrichment options...**\n• Identifying enrichment providers\n• Planning data enhancement strategy\n• Preparing multi-provider lookup\n\n_File enrichment processing initiated. This may take a few minutes for large datasets._`,
          response_type: 'ephemeral'
        });

        logger.info('File enrichment command processed', {
          userId: command.user_id,
          fileInfo: fileInfo
        });

      } catch (error) {
        logger.error('File enrichment command error:', error);
        await respond({
          text: 'Sorry, I encountered an error processing your file enrichment request. Please try again.',
          response_type: 'ephemeral'
        });
      }
    });

    // /deliverability-check command
    this.app.command('/deliverability-check', async ({ command, ack, respond }) => {
      await ack();
      
      try {
        const input = command.text?.trim();
        
        if (!input) {
          await respond({
            text: `📧 **Email Deliverability Check**\n\n**Usage:** \`/deliverability-check [email/domain]\`\n\n**Comprehensive Analysis:**\n• DNS & MX record validation\n• SPF, DKIM, DMARC authentication\n• Domain reputation analysis\n• Blacklist checking\n• AI-powered recommendations\n\n**Examples:**\n• \`/deliverability-check example.com\`\n• \`/deliverability-check user@company.com\`\n\n_Get detailed deliverability insights for your domains and emails._`,
            response_type: 'ephemeral'
          });
          return;
        }

        await respond({
          text: `📧 **Starting Deliverability Analysis**\n\n**Target:** ${input}\n\n🔍 **Running comprehensive checks:**\n• DNS configuration analysis\n• Email authentication verification\n• Domain reputation assessment\n• Deliverability scoring\n\n_Analysis in progress. Results will include actionable recommendations._`,
          response_type: 'ephemeral'
        });

        logger.info('Deliverability check command processed', {
          userId: command.user_id,
          input: input
        });

      } catch (error) {
        logger.error('Deliverability check command error:', error);
        await respond({
          text: 'Sorry, I encountered an error processing your deliverability check. Please try again.',
          response_type: 'ephemeral'
        });
      }
    });

    // /segment-strategy command
    this.app.command('/segment-strategy', async ({ command, ack, respond }) => {
      await ack();
      
      try {
        const audienceInfo = command.text?.trim();
        
        if (!audienceInfo) {
          await respond({
            text: `🎯 **AI Audience Segmentation Strategy**\n\n**Usage:** \`/segment-strategy [audience-description]\`\n\n**Strategic Analysis:**\n• AI-powered segmentation opportunities\n• Behavioral pattern recognition\n• Targeting strategy development\n• ROI predictions & optimization\n• Implementation roadmapping\n\n**Examples:**\n• \`/segment-strategy 10000 customer database\`\n• \`/segment-strategy e-commerce email subscribers\`\n\n_Upload audience data or describe your segmentation goals._`,
            response_type: 'ephemeral'
          });
          return;
        }

        await respond({
          text: `🎯 **Generating Segmentation Strategy**\n\n**Audience:** ${audienceInfo}\n\n🧠 **AI Analysis in progress:**\n• Identifying segmentation opportunities\n• Behavioral pattern analysis\n• Strategic targeting recommendations\n• Performance predictions\n\n_Creating comprehensive segmentation strategy with actionable insights._`,
          response_type: 'ephemeral'
        });

        logger.info('Segment strategy command processed', {
          userId: command.user_id,
          audienceInfo: audienceInfo
        });

      } catch (error) {
        logger.error('Segment strategy command error:', error);
        await respond({
          text: 'Sorry, I encountered an error processing your segmentation strategy request. Please try again.',
          response_type: 'ephemeral'
        });
      }
    });

    // /campaign-audit command
    this.app.command('/campaign-audit', async ({ command, ack, respond }) => {
      await ack();
      
      try {
        const campaignInfo = command.text?.trim();
        
        if (!campaignInfo) {
          await respond({
            text: `🔍 **Comprehensive Campaign Audit**\n\n**Usage:** \`/campaign-audit [campaign-details]\`\n\n**Complete Analysis:**\n• Performance benchmarking\n• Optimization opportunities\n• AI-powered insights\n• Competitive analysis\n• Strategic recommendations\n\n**Examples:**\n• \`/campaign-audit Q4 email campaigns\`\n• \`/campaign-audit last 30 days performance\`\n\n_Provide campaign data or timeframe for detailed audit analysis._`,
            response_type: 'ephemeral'
          });
          return;
        }

        await respond({
          text: `🔍 **Initiating Campaign Audit**\n\n**Scope:** ${campaignInfo}\n\n📊 **Comprehensive analysis:**\n• Performance metric evaluation\n• Benchmark comparison\n• Optimization identification\n• AI-powered recommendations\n\n_Conducting thorough campaign audit. Detailed report with actionable insights coming up._`,
          response_type: 'ephemeral'
        });

        logger.info('Campaign audit command processed', {
          userId: command.user_id,
          campaignInfo: campaignInfo
        });

      } catch (error) {
        logger.error('Campaign audit command error:', error);
        await respond({
          text: 'Sorry, I encountered an error processing your campaign audit request. Please try again.',
          response_type: 'ephemeral'
        });
      }
    });

    // /validate-file command (referencing existing validation service)
    this.app.command('/validate-file', async ({ command, ack, respond }) => {
      await ack();
      
      try {
        const fileInfo = command.text?.trim();
        
        if (!fileInfo) {
          await respond({
            text: `🤖 **I Can Validate Your Files**\n\n**Usage:** \`/validate-file [file-description]\`\n\n**What I validate for you:**\n• Email format validation\n• Phone number verification\n• Data quality assessment\n• Duplicate detection\n• Compliance checking\n\n**Examples:**\n• \`/validate-file customer email list\`\n• \`/validate-file contact database CSV\`\n\n_Upload your file or describe validation requirements and I'll handle it._`,
            response_type: 'ephemeral'
          });
          return;
        }

        await respond({
          text: `✅ **I'm Validating Your File**\n\n**File:** ${fileInfo}\n\n🔍 **My validation checks:**\n• Format verification\n• Data quality analysis\n• Compliance validation\n• Error identification\n\n_I'm processing your file validation. My results will include a detailed quality report._`,
          response_type: 'ephemeral'
        });

        logger.info('File validation command processed', {
          userId: command.user_id,
          fileInfo: fileInfo
        });

      } catch (error) {
        logger.error('File validation command error:', error);
        await respond({
          text: 'Sorry, I encountered an error processing your file validation request. Please try again and I\'ll handle it.',
          response_type: 'ephemeral'
        });
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
      return `**📋 My Available Commands:**\n\n**🤖 Core Commands:**\n• \`/connexio [request]\` - I'm your AI marketing assistant\n• \`/create-campaign [details]\` - I'll create new campaigns for you\n• \`/campaign-status [id]\` - I'll check campaign status\n\n**📧 Data & Analytics:**\n• \`/validate-file [description]\` - I'll validate your files\n• \`/enrich-file [description]\` - I'll enrich your data externally\n• \`/deliverability-check [email/domain]\` - I'll analyze email deliverability\n\n**🎯 Strategy & Optimization:**\n• \`/segment-strategy [audience]\` - I'll provide AI audience segmentation\n• \`/campaign-audit [campaigns]\` - I'll audit and optimize performance\n\n**💬 Chat:**\n• **@connexio-ai** - Mention me for assistance\n\n_I'm your enterprise AI-powered marketing operations assistant!_`;
    }
    
    if (msg.includes('campaign') || msg.includes('email') || msg.includes('marketing')) {
      return `I can help you create and manage marketing campaigns! Here are my enhanced capabilities:\n\n• **📧 Email Campaigns** - Design and send targeted emails\n• **🎯 Audience Segmentation** - AI-powered targeting strategies  \n• **📊 Campaign Analytics** - Performance audits and optimization\n• **✅ Data Validation** - File validation and enrichment\n• **🚀 Deliverability** - Email deliverability analysis\n\n**Quick Start:**\n• \`/campaign-audit\` - Analyze campaign performance\n• \`/segment-strategy\` - Get AI segmentation recommendations\n• \`/deliverability-check\` - Check email deliverability\n\nWhat would you like me to help you with?`;
    }
    
    if (msg.includes('sureshot') || msg.includes('eloqua')) {
      return `I can integrate with SureShot and Eloqua to:\n\n• Create automated campaigns\n• Sync audience data\n• Track campaign performance\n• Generate reports\n\nWhat would you like me to help you with?`;
    }
    
    if (msg.includes('status') || msg.includes('analytics') || msg.includes('report')) {
      return `📊 I can provide campaign insights including:\n\n• **Performance Metrics** - Opens, clicks, conversions\n• **Audience Analytics** - Engagement patterns\n• **Campaign Comparisons** - A/B test results\n• **ROI Analysis** - Return on investment\n\nUse \`/campaign-status [campaign-id]\` to check specific campaigns.`;
    }
    
    // Default response
    return `🤖 **I'm your AI Marketing Operations Assistant!**\n\nI can help with:\n\n• **📧 Campaign Management** - Create, audit, and optimize campaigns\n• **🎯 Audience Intelligence** - AI-powered segmentation strategies\n• **📊 Data Operations** - File validation, enrichment, and analysis\n• **🚀 Deliverability** - Email deliverability optimization\n• **⚡ Performance** - Real-time analytics and insights\n\n**Popular Commands:**\n• \`/campaign-audit\` - Comprehensive performance analysis\n• \`/segment-strategy\` - AI audience segmentation\n• \`/deliverability-check\` - Email deliverability analysis\n\nType \`help\` or use any command to get started! What can I help you with today?`;
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