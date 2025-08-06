/**
 * Email Delivery Service
 * Phase 1: SendGrid and Mailgun integration for marketing email delivery
 * Includes AI optimization, delivery tracking, and analytics
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');

class EmailDeliveryService {
  constructor(options = {}) {
    // Initialize Claude AI for email optimization
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Provider configurations
    this.providers = {
      sendgrid: {
        apiKey: process.env.SENDGRID_API_KEY,
        baseUrl: 'https://api.sendgrid.com/v3',
        fromEmail: process.env.SENDGRID_FROM_EMAIL,
        fromName: process.env.SENDGRID_FROM_NAME
      },
      mailgun: {
        apiKey: process.env.MAILGUN_API_KEY,
        domain: process.env.MAILGUN_DOMAIN,
        baseUrl: `https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}`,
        fromEmail: process.env.MAILGUN_FROM_EMAIL,
        fromName: process.env.MAILGUN_FROM_NAME
      }
    };

    this.config = {
      defaultProvider: options.defaultProvider || 'sendgrid',
      maxConcurrentSends: options.maxConcurrentSends || 10,
      rateLimitPerSecond: options.rateLimitPerSecond || 5,
      retryAttempts: options.retryAttempts || 3,
      webhookUrl: options.webhookUrl || process.env.EMAIL_WEBHOOK_URL
    };

    // Campaign tracking
    this.activeCampaigns = new Map();
    this.deliveryStats = new Map();
    this.emailValidationCache = new Map();

    // Performance metrics
    this.metrics = {
      totalEmails: 0,
      successfulEmails: 0,
      failedEmails: 0,
      deliveredEmails: 0,
      bouncedEmails: 0,
      openedEmails: 0,
      clickedEmails: 0,
      unsubscribedEmails: 0,
      campaigns: {
        total: 0,
        completed: 0,
        failed: 0
      },
      providerStats: {
        sendgrid: { sent: 0, delivered: 0, failed: 0 },
        mailgun: { sent: 0, delivered: 0, failed: 0 }
      }
    };

    console.log('📧 Email Delivery Service initialized');
  }

  /**
   * Execute email marketing campaign with AI optimization
   * @param {Object} campaign - Campaign configuration
   * @param {Array} recipients - Array of recipient objects
   * @param {Object} options - Campaign options
   * @returns {Object} Campaign execution results
   */
  async executeEmailCampaign(campaign, recipients, options = {}) {
    const campaignId = this.generateCampaignId();
    const startTime = Date.now();

    console.log(`📧 Starting email campaign ${campaignId}: ${campaign.name}`);
    
    const campaignData = {
      id: campaignId,
      name: campaign.name,
      status: 'running',
      startTime: startTime,
      recipients: recipients,
      subject: campaign.subject,
      htmlContent: campaign.htmlContent,
      textContent: campaign.textContent,
      provider: options.provider || this.config.defaultProvider,
      totalRecipients: recipients.length,
      sent: 0,
      failed: 0,
      delivered: 0,
      bounced: 0,
      opened: 0,
      clicked: 0,
      errors: []
    };

    this.activeCampaigns.set(campaignId, campaignData);
    this.metrics.campaigns.total++;

    try {
      // Step 1: AI-optimize email content
      console.log('🧠 Optimizing email content with Claude...');
      const optimizedContent = await this.optimizeEmailContent(
        campaign.subject,
        campaign.htmlContent,
        campaign.textContent,
        {
          audience: campaign.audience || 'general',
          campaignType: campaign.type || 'promotional',
          industry: campaign.industry || 'general'
        }
      );

      campaignData.optimizedContent = optimizedContent;
      
      // Step 2: Validate email addresses
      console.log('✉️  Validating email addresses...');
      const validationResults = await this.batchValidateEmails(
        recipients.map(r => r.email).filter(e => e)
      );

      const validRecipients = recipients.filter(recipient => {
        const validation = validationResults.find(v => v.email === recipient.email);
        return validation && validation.isValid;
      });

      campaignData.validRecipients = validRecipients.length;
      campaignData.invalidRecipients = recipients.length - validRecipients.length;

      console.log(`✅ ${validRecipients.length} valid recipients, ${campaignData.invalidRecipients} invalid`);

      // Step 3: Execute campaign with selected provider
      const sendResults = await this.sendEmailCampaignBatch(
        campaignId,
        validRecipients,
        optimizedContent,
        options
      );

      campaignData.status = 'completed';
      campaignData.endTime = Date.now();
      campaignData.totalExecutionTime = campaignData.endTime - campaignData.startTime;
      campaignData.sendResults = sendResults;

      // Step 4: Generate campaign insights
      const insights = await this.generateEmailCampaignInsights(campaignData);
      campaignData.insights = insights;

      this.metrics.campaigns.completed++;

      console.log(`🎉 Email campaign ${campaignId} completed in ${campaignData.totalExecutionTime}ms`);
      console.log(`📊 Sent: ${campaignData.sent}, Failed: ${campaignData.failed}`);

      return {
        campaignId: campaignId,
        status: 'completed',
        provider: campaignData.provider,
        totalRecipients: campaignData.totalRecipients,
        validRecipients: campaignData.validRecipients,
        sent: campaignData.sent,
        failed: campaignData.failed,
        executionTime: campaignData.totalExecutionTime,
        insights: insights,
        optimizedSubject: optimizedContent.optimizedSubject
      };

    } catch (error) {
      console.error(`❌ Email campaign ${campaignId} failed:`, error);
      
      campaignData.status = 'failed';
      campaignData.error = error.message;
      campaignData.endTime = Date.now();
      
      this.metrics.campaigns.failed++;
      
      throw new Error(`Email campaign execution failed: ${error.message}`);
    }
  }

  /**
   * AI-optimize email content for better engagement
   * @param {string} subject - Original subject line
   * @param {string} htmlContent - HTML content
   * @param {string} textContent - Text content
   * @param {Object} context - Campaign context
   * @returns {Object} Optimized content data
   */
  async optimizeEmailContent(subject, htmlContent, textContent, context) {
    const prompt = `As a marketing operations expert specializing in email campaigns, optimize this email for better engagement and deliverability:

**Original Email:**
- Subject: "${subject}"
- HTML Content: "${htmlContent?.substring(0, 500) || 'N/A'}..."
- Text Content: "${textContent?.substring(0, 300) || 'N/A'}..."

**Campaign Context:**
- Audience: ${context.audience}
- Campaign Type: ${context.campaignType}
- Industry: ${context.industry}

**Email Best Practices to Apply:**
1. **Subject Line**: Compelling, specific, avoid spam triggers
2. **Preheader**: Complement subject line effectively
3. **Content**: Clear value proposition, strong CTA
4. **Personalization**: Effective use of merge tags
5. **Mobile Optimization**: Mobile-friendly formatting
6. **Deliverability**: Avoid spam triggers, good text-to-image ratio
7. **A/B Testing**: Generate subject line variants

**Analysis Required:**
- Subject line optimization for open rates
- Content optimization for click rates
- Deliverability improvements
- Mobile-first considerations
- Personalization opportunities

**Respond with:**
{
  "optimizedSubject": "improved subject line",
  "optimizedPreheader": "preheader text",
  "optimizedHtmlContent": "improved HTML content",
  "optimizedTextContent": "improved text content",
  "improvements": ["improvement1", "improvement2"],
  "subjectVariants": ["variant1", "variant2", "variant3"],
  "deliverabilityScore": number (1-100),
  "engagementScore": number (1-100),
  "reasoning": "detailed explanation of changes"
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('Email content optimization failed:', error);
      return {
        optimizedSubject: subject,
        optimizedPreheader: '',
        optimizedHtmlContent: htmlContent,
        optimizedTextContent: textContent,
        improvements: [],
        subjectVariants: [subject],
        deliverabilityScore: 75,
        engagementScore: 70,
        reasoning: 'Using original content due to optimization failure'
      };
    }
  }

  /**
   * Batch validate email addresses
   * @param {Array} emailAddresses - Array of email addresses
   * @returns {Array} Validation results
   */
  async batchValidateEmails(emailAddresses) {
    const results = [];
    const uniqueEmails = [...new Set(emailAddresses.filter(e => e))];

    console.log(`📧 Validating ${uniqueEmails.length} unique email addresses...`);

    for (const email of uniqueEmails) {
      // Check cache first
      const cacheKey = email.toLowerCase();
      if (this.emailValidationCache.has(cacheKey)) {
        results.push(this.emailValidationCache.get(cacheKey));
        continue;
      }

      // Basic format validation
      const formatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      
      const validation = {
        email: email,
        isValid: formatValid,
        validationType: 'format_check',
        validationTimestamp: new Date().toISOString()
      };

      // Enhanced validation could integrate with validation services here
      if (formatValid) {
        // Check for disposable domains
        const disposableDomains = ['tempmail.com', '10minutemail.com', 'guerrillamail.com'];
        const domain = email.split('@')[1];
        validation.isDisposable = disposableDomains.includes(domain);
        validation.isValid = !validation.isDisposable;
      }

      this.emailValidationCache.set(cacheKey, validation);
      results.push(validation);
    }

    const validCount = results.filter(r => r.isValid).length;
    console.log(`✅ Email validation complete: ${validCount} valid addresses`);
    return results;
  }

  /**
   * Send email campaign batch with selected provider
   * @param {string} campaignId - Campaign ID
   * @param {Array} recipients - Valid recipients
   * @param {Object} optimizedContent - Optimized email content
   * @param {Object} options - Send options
   * @returns {Array} Send results
   */
  async sendEmailCampaignBatch(campaignId, recipients, optimizedContent, options) {
    const results = [];
    const campaignData = this.activeCampaigns.get(campaignId);
    const provider = campaignData.provider;
    
    // Setup delivery tracking
    this.deliveryStats.set(campaignId, {
      sent: 0,
      delivered: 0,
      bounced: 0,
      opened: 0,
      clicked: 0,
      unsubscribed: 0,
      failed: 0
    });

    console.log(`📤 Sending emails to ${recipients.length} recipients via ${provider}...`);

    for (let i = 0; i < recipients.length; i += this.config.maxConcurrentSends) {
      const batch = recipients.slice(i, i + this.config.maxConcurrentSends);
      
      const batchPromises = batch.map(async (recipient) => {
        try {
          // Personalize content
          const personalizedContent = this.personalizeEmailContent(optimizedContent, recipient);

          // Send email via selected provider
          let sendResult;
          if (provider === 'sendgrid') {
            sendResult = await this.sendViaSendGrid(personalizedContent, recipient, campaignId);
          } else if (provider === 'mailgun') {
            sendResult = await this.sendViaMailgun(personalizedContent, recipient, campaignId);
          } else {
            throw new Error(`Unsupported provider: ${provider}`);
          }

          campaignData.sent++;
          this.metrics.successfulEmails++;
          this.metrics.providerStats[provider].sent++;
          
          const result = {
            recipientId: recipient.id || recipient.email,
            email: recipient.email,
            messageId: sendResult.messageId,
            status: 'sent',
            provider: provider,
            timestamp: new Date().toISOString()
          };

          results.push(result);
          return result;

        } catch (error) {
          campaignData.failed++;
          campaignData.errors.push({
            recipient: recipient.email,
            error: error.message,
            timestamp: new Date().toISOString()
          });

          this.metrics.failedEmails++;
          this.metrics.providerStats[provider].failed++;

          const result = {
            recipientId: recipient.id || recipient.email,
            email: recipient.email,
            status: 'failed',
            error: error.message,
            provider: provider,
            timestamp: new Date().toISOString()
          };

          results.push(result);
          return result;
        }
      });

      await Promise.all(batchPromises);

      // Rate limiting between batches
      if (i + this.config.maxConcurrentSends < recipients.length) {
        await this.delay(1000 / this.config.rateLimitPerSecond);
      }

      // Progress update
      const progress = Math.min(i + this.config.maxConcurrentSends, recipients.length);
      console.log(`📊 Progress: ${progress}/${recipients.length} emails sent`);
    }

    this.metrics.totalEmails += results.length;
    return results;
  }

  /**
   * Send email via SendGrid
   * @param {Object} content - Email content
   * @param {Object} recipient - Recipient data
   * @param {string} campaignId - Campaign ID
   * @returns {Object} Send result
   */
  async sendViaSendGrid(content, recipient, campaignId) {
    const sendGridConfig = this.providers.sendgrid;
    
    const emailData = {
      personalizations: [{
        to: [{ email: recipient.email, name: recipient.name || '' }],
        subject: content.subject
      }],
      from: {
        email: sendGridConfig.fromEmail,
        name: sendGridConfig.fromName
      },
      content: [
        {
          type: 'text/plain',
          value: content.textContent
        },
        {
          type: 'text/html',
          value: content.htmlContent
        }
      ],
      custom_args: {
        campaign_id: campaignId,
        recipient_id: recipient.id || recipient.email
      },
      tracking_settings: {
        click_tracking: { enable: true },
        open_tracking: { enable: true },
        subscription_tracking: { enable: true }
      }
    };

    const response = await axios.post(
      `${sendGridConfig.baseUrl}/mail/send`,
      emailData,
      {
        headers: {
          'Authorization': `Bearer ${sendGridConfig.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      messageId: response.headers['x-message-id'] || `sg_${Date.now()}`,
      provider: 'sendgrid',
      status: 'sent'
    };
  }

  /**
   * Send email via Mailgun
   * @param {Object} content - Email content
   * @param {Object} recipient - Recipient data
   * @param {string} campaignId - Campaign ID
   * @returns {Object} Send result
   */
  async sendViaMailgun(content, recipient, campaignId) {
    const mailgunConfig = this.providers.mailgun;
    
    const formData = new URLSearchParams();
    formData.append('from', `${mailgunConfig.fromName} <${mailgunConfig.fromEmail}>`);
    formData.append('to', recipient.email);
    formData.append('subject', content.subject);
    formData.append('text', content.textContent);
    formData.append('html', content.htmlContent);
    formData.append('o:campaign', campaignId);
    formData.append('o:tag', 'marketing');
    formData.append('o:tracking', 'yes');
    formData.append('o:tracking-clicks', 'yes');
    formData.append('o:tracking-opens', 'yes');

    const response = await axios.post(
      `${mailgunConfig.baseUrl}/messages`,
      formData,
      {
        auth: {
          username: 'api',
          password: mailgunConfig.apiKey
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return {
      messageId: response.data.id,
      provider: 'mailgun',
      status: 'sent'
    };
  }

  /**
   * Handle delivery status webhook
   * @param {Object} eventData - Webhook event data
   * @returns {Object} Processing result
   */
  async handleDeliveryStatus(eventData) {
    try {
      // Extract campaign ID from event
      let campaignId;
      if (eventData.sg_event_id) {
        // SendGrid event
        campaignId = eventData.campaign_id || eventData['custom_args.campaign_id'];
      } else if (eventData['event-data']) {
        // Mailgun event
        campaignId = eventData['event-data']['user-variables']?.campaign_id;
      }

      if (!campaignId) {
        console.warn('No campaign ID in delivery event');
        return { processed: false, reason: 'no_campaign_id' };
      }

      const stats = this.deliveryStats.get(campaignId);
      if (!stats) {
        console.warn(`No delivery stats found for campaign ${campaignId}`);
        return { processed: false, reason: 'campaign_not_found' };
      }

      // Update statistics based on event type
      const eventType = eventData.event || eventData['event-data']?.event;
      switch (eventType) {
        case 'delivered':
          stats.delivered++;
          this.metrics.deliveredEmails++;
          break;
        case 'bounce':
        case 'dropped':
          stats.bounced++;
          this.metrics.bouncedEmails++;
          break;
        case 'open':
          stats.opened++;
          this.metrics.openedEmails++;
          break;
        case 'click':
          stats.clicked++;
          this.metrics.clickedEmails++;
          break;
        case 'unsubscribe':
          stats.unsubscribed++;
          this.metrics.unsubscribedEmails++;
          break;
      }

      console.log(`📧 Email event processed: ${eventType} for campaign ${campaignId}`);

      return {
        processed: true,
        campaignId: campaignId,
        eventType: eventType,
        email: eventData.email || eventData['event-data']?.recipient,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Email delivery status processing failed:', error);
      return {
        processed: false,
        error: error.message
      };
    }
  }

  /**
   * Generate AI-powered email campaign insights
   * @param {Object} campaignData - Campaign data
   * @returns {Object} Campaign insights
   */
  async generateEmailCampaignInsights(campaignData) {
    const deliveryStats = this.deliveryStats.get(campaignData.id) || {};
    
    const prompt = `Analyze this email marketing campaign performance and provide actionable insights:

**Campaign Performance:**
- Campaign Name: ${campaignData.name}
- Provider: ${campaignData.provider}
- Total Recipients: ${campaignData.totalRecipients}
- Valid Recipients: ${campaignData.validRecipients}
- Emails Sent: ${campaignData.sent}
- Failed Sends: ${campaignData.failed}
- Send Success Rate: ${campaignData.totalRecipients > 0 ? Math.round((campaignData.sent / campaignData.totalRecipients) * 100) : 0}%

**Content Optimization:**
- Original Subject: "${campaignData.subject}"
- Optimized Subject: "${campaignData.optimizedContent?.optimizedSubject || 'N/A'}"
- Deliverability Score: ${campaignData.optimizedContent?.deliverabilityScore || 'N/A'}
- Engagement Score: ${campaignData.optimizedContent?.engagementScore || 'N/A'}

**Delivery Metrics:**
- Delivered: ${deliveryStats.delivered || 0}
- Bounced: ${deliveryStats.bounced || 0}
- Opened: ${deliveryStats.opened || 0}
- Clicked: ${deliveryStats.clicked || 0}
- Unsubscribed: ${deliveryStats.unsubscribed || 0}

**Analysis Required:**
1. Campaign performance assessment vs industry benchmarks
2. Subject line optimization effectiveness
3. Deliverability analysis and improvements
4. Engagement optimization opportunities
5. Provider performance evaluation
6. A/B testing recommendations

Provide actionable insights for improving email campaign performance.

Return JSON with: performance_summary, subject_optimization, deliverability_analysis, engagement_insights, provider_performance, recommendations.`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1200,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('Email campaign insights generation failed:', error);
      return {
        performance_summary: { 
          send_success_rate: campaignData.sent / campaignData.totalRecipients,
          delivery_rate: (deliveryStats.delivered || 0) / Math.max(campaignData.sent, 1)
        },
        subject_optimization: 'optimization_applied',
        deliverability_analysis: 'pending_delivery_data',
        engagement_insights: 'monitor_open_click_rates',
        provider_performance: { provider: campaignData.provider, status: 'performing' },
        recommendations: ['Monitor delivery rates', 'A/B test subject lines', 'Analyze engagement patterns']
      };
    }
  }

  /**
   * Get email service health and metrics
   * @returns {Object} Service status
   */
  getServiceHealth() {
    return {
      service: 'EmailDeliveryService',
      status: 'healthy',
      activeCampaigns: this.activeCampaigns.size,
      emailValidationCacheSize: this.emailValidationCache.size,
      metrics: this.metrics,
      providers: {
        sendgrid: {
          configured: !!this.providers.sendgrid.apiKey,
          fromEmail: this.providers.sendgrid.fromEmail
        },
        mailgun: {
          configured: !!this.providers.mailgun.apiKey,
          domain: this.providers.mailgun.domain
        }
      },
      capabilities: [
        'email_campaigns',
        'email_validation',
        'ai_content_optimization',
        'delivery_tracking',
        'campaign_insights',
        'multi_provider_support'
      ]
    };
  }

  // Utility methods
  personalizeEmailContent(content, recipient) {
    const personalizedContent = { ...content };
    
    // Replace personalization tokens
    const replacements = {
      '{{firstName}}': recipient.firstName || recipient.first_name || '',
      '{{lastName}}': recipient.lastName || recipient.last_name || '',
      '{{name}}': recipient.name || `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim(),
      '{{email}}': recipient.email || '',
      '{{company}}': recipient.company || recipient.companyName || ''
    };

    for (const [token, value] of Object.entries(replacements)) {
      const regex = new RegExp(token.replace(/[{}]/g, '\\$&'), 'g');
      personalizedContent.subject = personalizedContent.subject.replace(regex, value);
      personalizedContent.htmlContent = personalizedContent.htmlContent.replace(regex, value);
      personalizedContent.textContent = personalizedContent.textContent.replace(regex, value);
    }

    return personalizedContent;
  }

  generateCampaignId() {
    return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = EmailDeliveryService;