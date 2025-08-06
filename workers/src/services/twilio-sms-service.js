import twilio from 'twilio';
import pRetry from 'p-retry';
import PQueue from 'p-queue';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { createContextLogger, createTimer } from '../utils/logger.js';
const { default: Anthropic } = require('@anthropic-ai/sdk');

/**
 * Twilio SMS/MMS Integration Service
 * Handles bulk SMS/MMS campaigns with rate limiting and delivery tracking
 */
class TwilioSmsService {
  constructor() {
    this.accountSid = config.twilio.accountSid;
    this.authToken = config.twilio.authToken;
    this.messagingServiceSid = config.twilio.messagingServiceSid;

    // Initialize Twilio client
    this.client = twilio(this.accountSid, this.authToken);

    // Initialize Claude AI for message optimization
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Rate limiting queue
    this.queue = new PQueue({
      concurrency: config.twilio.maxConcurrent || 10,
      intervalCap: config.twilio.intervalCap || 100,
      interval: config.twilio.interval || 60000, // 1 minute
    });

    this.logger = createContextLogger({ service: 'twilio-sms-service' });

    // Campaign tracking
    this.activeCampaigns = new Map();
    
    // Phone validation cache
    this.phoneValidationCache = new Map();
    
    // Performance metrics
    this.metrics = {
      totalMessages: 0,
      successfulMessages: 0,
      failedMessages: 0,
      totalCampaigns: 0,
      deliveryRates: {
        sms: { sent: 0, delivered: 0, failed: 0 },
        mms: { sent: 0, delivered: 0, failed: 0 },
      },
      averageResponseTime: 0,
      errorsByType: {},
    };

    this.logger.info('Twilio SMS service initialized', {
      accountSid: this.accountSid ? 'configured' : 'missing',
      messagingServiceSid: this.messagingServiceSid ? 'configured' : 'missing',
      maxConcurrent: config.twilio.maxConcurrent || 10,
    });
  }

  /**
   * Send bulk SMS campaign
   * @param {Object} smsSpec - SMS campaign specification
   * @returns {Promise<Object>} Campaign execution result
   */
  async sendBulkSms(smsSpec) {
    const campaignId = uuidv4();
    const timer = createTimer('bulk-sms-campaign');
    const logger = createContextLogger({
      service: 'twilio-sms-service',
      campaignId,
      campaignName: smsSpec.name,
    });

    logger.info('Starting bulk SMS campaign', {
      audienceSize: smsSpec.audience?.length || 0,
      fromNumber: smsSpec.fromNumber,
      messageLength: smsSpec.message?.length || 0,
    });

    this.metrics.totalCampaigns++;
    this.activeCampaigns.set(campaignId, {
      type: 'sms',
      status: 'initializing',
      startTime: Date.now(),
      spec: smsSpec,
      results: {
        total: smsSpec.audience?.length || 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        messages: [],
      },
    });

    try {
      // Validate SMS specification
      this.validateSmsSpec(smsSpec);

      // Prepare messages for sending
      const messages = this.prepareSmsMessages(smsSpec, campaignId);

      // Update campaign status
      this.activeCampaigns.get(campaignId).status = 'sending';

      // Send messages with rate limiting
      const sendResults = await this.sendMessagesWithRateLimit(messages, 'sms', logger);

      // Process results
      const campaignResult = this.processCampaignResults(campaignId, sendResults, timer);

      logger.info('Bulk SMS campaign completed', {
        campaignId,
        totalSent: campaignResult.sent,
        successRate: campaignResult.successRate,
        duration: campaignResult.processingTimeMs,
      });

      return campaignResult;

    } catch (error) {
      const duration = timer.end();
      this.activeCampaigns.get(campaignId).status = 'failed';
      this.activeCampaigns.get(campaignId).error = error.message;

      logger.error('Bulk SMS campaign failed', {
        campaignId,
        error: error.message,
        duration,
      });

      return {
        success: false,
        campaignId,
        error: error.message,
        errorType: this._classifyError(error),
        retryable: this._isRetryableError(error),
        processingTimeMs: duration,
      };
    }
  }

  /**
   * Send bulk MMS campaign
   * @param {Object} mmsSpec - MMS campaign specification
   * @returns {Promise<Object>} Campaign execution result
   */
  async sendBulkMms(mmsSpec) {
    const campaignId = uuidv4();
    const timer = createTimer('bulk-mms-campaign');
    const logger = createContextLogger({
      service: 'twilio-sms-service',
      campaignId,
      campaignName: mmsSpec.name,
    });

    logger.info('Starting bulk MMS campaign', {
      audienceSize: mmsSpec.audience?.length || 0,
      fromNumber: mmsSpec.fromNumber,
      mediaCount: mmsSpec.mediaUrls?.length || 0,
    });

    this.metrics.totalCampaigns++;
    this.activeCampaigns.set(campaignId, {
      type: 'mms',
      status: 'initializing',
      startTime: Date.now(),
      spec: mmsSpec,
      results: {
        total: mmsSpec.audience?.length || 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        messages: [],
      },
    });

    try {
      // Validate MMS specification
      this.validateMmsSpec(mmsSpec);

      // Prepare messages for sending
      const messages = this.prepareMmsMessages(mmsSpec, campaignId);

      // Update campaign status
      this.activeCampaigns.get(campaignId).status = 'sending';

      // Send messages with rate limiting
      const sendResults = await this.sendMessagesWithRateLimit(messages, 'mms', logger);

      // Process results
      const campaignResult = this.processCampaignResults(campaignId, sendResults, timer);

      logger.info('Bulk MMS campaign completed', {
        campaignId,
        totalSent: campaignResult.sent,
        successRate: campaignResult.successRate,
        duration: campaignResult.processingTimeMs,
      });

      return campaignResult;

    } catch (error) {
      const duration = timer.end();
      this.activeCampaigns.get(campaignId).status = 'failed';
      this.activeCampaigns.get(campaignId).error = error.message;

      logger.error('Bulk MMS campaign failed', {
        campaignId,
        error: error.message,
        duration,
      });

      return {
        success: false,
        campaignId,
        error: error.message,
        errorType: this._classifyError(error),
        retryable: this._isRetryableError(error),
        processingTimeMs: duration,
      };
    }
  }

  /**
   * Get campaign status and metrics
   * @param {Object} statusRequest - Status request with campaign ID
   * @returns {Promise<Object>} Campaign status
   */
  async getCampaignStatus(statusRequest) {
    const campaignId = statusRequest.campaignId;
    const campaign = this.activeCampaigns.get(campaignId);

    if (!campaign) {
      return {
        success: false,
        error: `Campaign not found: ${campaignId}`,
      };
    }

    // Get real-time delivery status for recent messages
    const recentMessages = campaign.results.messages.slice(-10); // Last 10 messages
    const deliveryUpdates = await this.updateDeliveryStatuses(recentMessages);

    // Update campaign results with latest delivery info
    this.updateCampaignDeliveryStats(campaignId, deliveryUpdates);

    const result = {
      success: true,
      campaignId,
      type: campaign.type,
      status: campaign.status,
      startTime: campaign.startTime,
      results: campaign.results,
      metrics: {
        totalMessages: campaign.results.total,
        sentMessages: campaign.results.sent,
        deliveredMessages: campaign.results.delivered,
        failedMessages: campaign.results.failed,
        successRate: campaign.results.total > 0 
          ? Math.round((campaign.results.sent / campaign.results.total) * 100) 
          : 0,
        deliveryRate: campaign.results.sent > 0 
          ? Math.round((campaign.results.delivered / campaign.results.sent) * 100) 
          : 0,
      },
      lastUpdated: new Date().toISOString(),
    };

    return result;
  }

  /**
   * Pause campaign (stop sending remaining messages)
   * @param {Object} pauseRequest - Pause request with campaign ID
   * @returns {Promise<Object>} Pause result
   */
  async pauseCampaign(pauseRequest) {
    const campaignId = pauseRequest.campaignId;
    const campaign = this.activeCampaigns.get(campaignId);

    if (!campaign) {
      return {
        success: false,
        error: `Campaign not found: ${campaignId}`,
      };
    }

    if (campaign.status !== 'sending') {
      return {
        success: false,
        error: `Campaign cannot be paused, current status: ${campaign.status}`,
      };
    }

    // Update campaign status
    campaign.status = 'paused';
    campaign.pausedAt = Date.now();

    this.logger.info('Campaign paused', {
      campaignId,
      messagesSent: campaign.results.sent,
      messagesRemaining: campaign.results.total - campaign.results.sent,
    });

    return {
      success: true,
      campaignId,
      status: 'paused',
      pausedAt: campaign.pausedAt,
      messagesSent: campaign.results.sent,
      messagesRemaining: campaign.results.total - campaign.results.sent,
    };
  }

  /**
   * AI-optimize SMS message for better engagement
   * @param {string} messageTemplate - Original message template
   * @param {Object} context - Campaign context
   * @returns {Object} Optimized message data
   */
  async optimizeSMSMessage(messageTemplate, context = {}) {
    const prompt = `As a marketing operations expert specializing in SMS campaigns, optimize this message for better engagement and compliance:

**Original Message:**
"${messageTemplate}"

**Campaign Context:**
- Audience: ${context.audience || 'general'}
- Campaign Type: ${context.campaignType || 'promotional'}
- Personalized Fields: ${JSON.stringify(context.personalizedFields || [])}

**SMS Best Practices to Apply:**
1. **Character Limit**: Keep under 160 characters for single message
2. **Call to Action**: Clear, actionable CTA
3. **Personalization**: Use available personalized fields effectively
4. **Urgency**: Create appropriate sense of urgency without being pushy
5. **Brand Voice**: Professional but conversational
6. **Compliance**: Include opt-out instructions if promotional
7. **Mobile-First**: Consider mobile reading experience

**Analysis Required:**
- Character count optimization
- Engagement improvements
- Personalization enhancements
- Compliance recommendations
- A/B testing suggestions

**Respond with:**
{
  "optimizedText": "improved message text",
  "characterCount": number,
  "improvements": ["improvement1", "improvement2"],
  "personalizationFields": ["field1", "field2"],
  "complianceNotes": ["note1", "note2"],
  "abTestVariants": ["variant1", "variant2"],
  "engagementScore": number (1-100),
  "reasoning": "detailed explanation of changes"
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      this.logger.error('SMS message optimization failed:', { error: error.message });
      return {
        optimizedText: messageTemplate,
        characterCount: messageTemplate.length,
        improvements: [],
        personalizationFields: [],
        complianceNotes: ['Add STOP to opt out'],
        abTestVariants: [],
        engagementScore: 70,
        reasoning: 'Using original message due to optimization failure'
      };
    }
  }

  /**
   * Batch validate phone numbers using Twilio Lookup
   * @param {Array} phoneNumbers - Array of phone numbers
   * @returns {Array} Validation results
   */
  async batchValidatePhones(phoneNumbers) {
    const results = [];
    const uniquePhones = [...new Set(phoneNumbers.filter(p => p))];

    this.logger.info('Validating phone numbers', { count: uniquePhones.length });

    for (const phone of uniquePhones) {
      // Check cache first
      const cacheKey = this.normalizePhoneNumber(phone);
      if (this.phoneValidationCache.has(cacheKey)) {
        results.push(this.phoneValidationCache.get(cacheKey));
        continue;
      }

      try {
        const lookup = await this.client.lookups.v1.phoneNumbers(phone).fetch();
        
        const validation = {
          phone: phone,
          normalizedPhone: lookup.phoneNumber,
          isValid: true,
          carrier: lookup.carrier?.name || 'unknown',
          countryCode: lookup.countryCode,
          phoneType: lookup.carrier?.type || 'unknown',
          validationTimestamp: new Date().toISOString()
        };

        this.phoneValidationCache.set(cacheKey, validation);
        results.push(validation);

      } catch (error) {
        const validation = {
          phone: phone,
          isValid: false,
          error: error.message,
          validationTimestamp: new Date().toISOString()
        };

        this.phoneValidationCache.set(cacheKey, validation);
        results.push(validation);
      }

      // Rate limiting
      await this.delay(100);
    }

    const validCount = results.filter(r => r.isValid).length;
    this.logger.info('Phone validation complete', { valid: validCount, total: results.length });
    return results;
  }

  /**
   * Generate AI-powered campaign insights and recommendations
   * @param {Object} campaignData - Campaign data
   * @returns {Object} Campaign insights
   */
  async generateCampaignInsights(campaignData) {
    const prompt = `Analyze this SMS marketing campaign performance and provide actionable insights:

**Campaign Performance:**
- Campaign Name: ${campaignData.name || campaignData.spec?.name}
- Total Recipients: ${campaignData.results?.total || 0}
- Messages Sent: ${campaignData.results?.sent || 0}
- Messages Failed: ${campaignData.results?.failed || 0}
- Success Rate: ${campaignData.results?.total > 0 ? Math.round((campaignData.results.sent / campaignData.results.total) * 100) : 0}%

**Message Details:**
- Original Message: "${campaignData.spec?.message || 'N/A'}"
- Character Count: ${campaignData.spec?.message?.length || 0}

**Analysis Required:**
1. Campaign performance assessment
2. Message effectiveness analysis
3. Delivery rate optimization
4. Cost efficiency calculation
5. Improvement recommendations
6. A/B testing suggestions

Provide actionable insights for future SMS campaigns.

Return JSON with: performance_summary, message_effectiveness, delivery_analysis, cost_efficiency, recommendations.`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      this.logger.error('Campaign insights generation failed:', { error: error.message });
      return {
        performance_summary: { 
          success_rate: campaignData.results?.total > 0 ? 
            campaignData.results.sent / campaignData.results.total : 0 
        },
        message_effectiveness: 'analysis_unavailable',
        delivery_analysis: 'pending_delivery_data',
        cost_efficiency: { estimated_cost: (campaignData.results?.sent || 0) * 0.0075 },
        recommendations: ['Monitor delivery rates', 'A/B test message variations']
      };
    }
  }

  /**
   * Validate SMS specification
   * @private
   */
  validateSmsSpec(smsSpec) {
    const errors = [];

    if (!smsSpec.message) errors.push('Message content is required');
    if (!smsSpec.fromNumber) errors.push('From number is required');
    if (!smsSpec.audience || !Array.isArray(smsSpec.audience)) {
      errors.push('Audience array is required');
    }

    // SMS-specific validations
    if (smsSpec.message && smsSpec.message.length > 1600) {
      errors.push('SMS message too long (max 1600 characters)');
    }

    if (smsSpec.audience) {
      for (let i = 0; i < smsSpec.audience.length; i++) {
        const contact = smsSpec.audience[i];
        if (!contact.phoneNumber) {
          errors.push(`Contact ${i + 1}: phone number is required`);
        } else if (!this.isValidPhoneNumber(contact.phoneNumber)) {
          errors.push(`Contact ${i + 1}: invalid phone number format`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`SMS validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Validate MMS specification
   * @private
   */
  validateMmsSpec(mmsSpec) {
    const errors = [];

    if (!mmsSpec.fromNumber) errors.push('From number is required');
    if (!mmsSpec.audience || !Array.isArray(mmsSpec.audience)) {
      errors.push('Audience array is required');
    }
    if (!mmsSpec.mediaUrls || !Array.isArray(mmsSpec.mediaUrls) || mmsSpec.mediaUrls.length === 0) {
      errors.push('At least one media URL is required for MMS');
    }

    // MMS-specific validations
    if (mmsSpec.mediaUrls && mmsSpec.mediaUrls.length > 10) {
      errors.push('Too many media attachments (max 10)');
    }

    if (mmsSpec.message && mmsSpec.message.length > 1600) {
      errors.push('MMS message too long (max 1600 characters)');
    }

    if (errors.length > 0) {
      throw new Error(`MMS validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Prepare SMS messages for sending
   * @private
   */
  prepareSmsMessages(smsSpec, campaignId) {
    return smsSpec.audience.map(contact => ({
      campaignId,
      messageId: uuidv4(),
      to: contact.phoneNumber,
      from: smsSpec.fromNumber,
      body: this.personalizeMessage(smsSpec.message, contact),
      messagingServiceSid: this.messagingServiceSid,
      contact,
    }));
  }

  /**
   * Prepare MMS messages for sending
   * @private
   */
  prepareMmsMessages(mmsSpec, campaignId) {
    return mmsSpec.audience.map(contact => ({
      campaignId,
      messageId: uuidv4(),
      to: contact.phoneNumber,
      from: mmsSpec.fromNumber,
      body: mmsSpec.message ? this.personalizeMessage(mmsSpec.message, contact) : undefined,
      mediaUrl: mmsSpec.mediaUrls,
      messagingServiceSid: this.messagingServiceSid,
      contact,
    }));
  }

  /**
   * Send messages with rate limiting
   * @private
   */
  async sendMessagesWithRateLimit(messages, messageType, logger) {
    const results = [];
    let sentCount = 0;

    logger.info('Sending messages with rate limiting', {
      totalMessages: messages.length,
      messageType,
      concurrency: config.twilio.maxConcurrent || 10,
    });

    // Process messages in batches
    const batchPromises = messages.map(message => 
      this.queue.add(() => this.sendSingleMessage(message, messageType, logger))
    );

    // Wait for all messages to be processed
    const batchResults = await Promise.allSettled(batchPromises);

    // Process results
    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      const message = messages[i];

      if (result.status === 'fulfilled') {
        results.push({
          messageId: message.messageId,
          to: message.to,
          success: true,
          twilioSid: result.value.sid,
          status: result.value.status,
          sentAt: new Date().toISOString(),
        });
        sentCount++;
        this.metrics.successfulMessages++;
      } else {
        results.push({
          messageId: message.messageId,
          to: message.to,
          success: false,
          error: result.reason.message,
          sentAt: new Date().toISOString(),
        });
        this.metrics.failedMessages++;
        this._trackError(result.reason);
      }

      this.metrics.totalMessages++;
    }

    logger.info('Message sending completed', {
      totalMessages: messages.length,
      sentCount,
      successRate: Math.round((sentCount / messages.length) * 100),
    });

    return results;
  }

  /**
   * Send single message with retry logic
   * @private
   */
  async sendSingleMessage(message, messageType, logger) {
    return await pRetry(
      async () => {
        const timer = createTimer('single-message-send');
        
        try {
          let result;
          if (messageType === 'sms') {
            result = await this.client.messages.create({
              to: message.to,
              from: message.from,
              body: message.body,
              messagingServiceSid: message.messagingServiceSid,
            });
          } else {
            result = await this.client.messages.create({
              to: message.to,
              from: message.from,
              body: message.body,
              mediaUrl: message.mediaUrl,
              messagingServiceSid: message.messagingServiceSid,
            });
          }

          const duration = timer.end();
          this._updateResponseTimeMetrics(duration);

          return result;
        } catch (error) {
          timer.end();
          
          // Handle specific Twilio errors
          if (error.code === 21408) { // Invalid phone number
            const nonRetryableError = new Error(`Invalid phone number: ${message.to}`);
            nonRetryableError.shouldRetry = false;
            throw nonRetryableError;
          }
          
          if (error.code === 21610) { // Message content restrictions
            const nonRetryableError = new Error('Message violates content policy');
            nonRetryableError.shouldRetry = false;
            throw nonRetryableError;
          }

          throw error;
        }
      },
      {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
        shouldRetry: (error) => error.shouldRetry !== false,
      }
    );
  }

  /**
   * Process campaign results
   * @private
   */
  processCampaignResults(campaignId, sendResults, timer) {
    const campaign = this.activeCampaigns.get(campaignId);
    const duration = timer.end();

    // Update campaign results
    campaign.results.messages = sendResults;
    campaign.results.sent = sendResults.filter(r => r.success).length;
    campaign.results.failed = sendResults.filter(r => !r.success).length;
    campaign.status = 'completed';
    campaign.completedAt = Date.now();

    // Update metrics
    const messageType = campaign.type;
    this.metrics.deliveryRates[messageType].sent += campaign.results.sent;
    this.metrics.deliveryRates[messageType].failed += campaign.results.failed;

    return {
      success: true,
      campaignId,
      type: campaign.type,
      status: 'completed',
      results: campaign.results,
      metrics: {
        totalMessages: campaign.results.total,
        sentMessages: campaign.results.sent,
        failedMessages: campaign.results.failed,
        successRate: Math.round((campaign.results.sent / campaign.results.total) * 100),
      },
      processingTimeMs: duration,
    };
  }

  /**
   * Update delivery statuses for messages
   * @private
   */
  async updateDeliveryStatuses(messages) {
    const updates = [];

    for (const messageResult of messages) {
      if (messageResult.success && messageResult.twilioSid) {
        try {
          const messageStatus = await this.client.messages(messageResult.twilioSid).fetch();
          updates.push({
            messageId: messageResult.messageId,
            status: messageStatus.status,
            deliveredAt: messageStatus.dateUpdated,
          });
        } catch (error) {
          // Ignore individual message status fetch errors
        }
      }
    }

    return updates;
  }

  /**
   * Update campaign delivery statistics
   * @private
   */
  updateCampaignDeliveryStats(campaignId, deliveryUpdates) {
    const campaign = this.activeCampaigns.get(campaignId);
    if (!campaign) return;

    let newDeliveredCount = 0;

    for (const update of deliveryUpdates) {
      const messageIndex = campaign.results.messages.findIndex(
        m => m.messageId === update.messageId
      );

      if (messageIndex !== -1) {
        campaign.results.messages[messageIndex].deliveryStatus = update.status;
        campaign.results.messages[messageIndex].deliveredAt = update.deliveredAt;

        if (update.status === 'delivered') {
          newDeliveredCount++;
        }
      }
    }

    campaign.results.delivered += newDeliveredCount;
    
    // Update global metrics
    this.metrics.deliveryRates[campaign.type].delivered += newDeliveredCount;
  }

  /**
   * Personalize message with contact data
   * @private
   */
  personalizeMessage(messageTemplate, contact) {
    let personalizedMessage = messageTemplate;

    // Replace common placeholders
    const replacements = {
      '{{firstName}}': contact.firstName || '',
      '{{lastName}}': contact.lastName || '',
      '{{name}}': contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      '{{phoneNumber}}': contact.phoneNumber || '',
      '{{email}}': contact.email || '',
    };

    // Replace custom fields
    if (contact.customFields) {
      for (const [key, value] of Object.entries(contact.customFields)) {
        replacements[`{{${key}}}`] = value || '';
      }
    }

    // Perform replacements
    for (const [placeholder, value] of Object.entries(replacements)) {
      personalizedMessage = personalizedMessage.replace(new RegExp(placeholder, 'g'), value);
    }

    return personalizedMessage;
  }

  /**
   * Validate phone number format
   * @private
   */
  isValidPhoneNumber(phoneNumber) {
    // Basic E.164 format validation
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  /**
   * Classify error type
   * @private
   */
  _classifyError(error) {
    if (error.code === 21408) return 'invalid_phone_number';
    if (error.code === 21610) return 'content_policy_violation';
    if (error.code === 21614) return 'spam_detected';
    if (error.code === 30001) return 'queue_full';
    if (error.code === 30002) return 'account_suspended';
    if (error.code === 30003) return 'unreachable_destination';
    if (error.message?.includes('timeout')) return 'timeout';
    if (error.message?.includes('rate limit')) return 'rate_limit';
    return 'unknown';
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryableError(error) {
    const retryableTypes = ['timeout', 'rate_limit', 'queue_full', 'unreachable_destination'];
    return retryableTypes.includes(this._classifyError(error));
  }

  /**
   * Track error for metrics
   * @private
   */
  _trackError(error) {
    const errorType = this._classifyError(error);
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
  }

  /**
   * Update response time metrics
   * @private
   */
  _updateResponseTimeMetrics(duration) {
    const totalRequests = this.metrics.successfulMessages + this.metrics.failedMessages;
    const totalTime = this.metrics.averageResponseTime * (totalRequests - 1) + duration;
    this.metrics.averageResponseTime = totalTime / totalRequests;
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      activeCampaigns: this.activeCampaigns.size,
      queueStatus: {
        size: this.queue.size,
        pending: this.queue.pending,
        concurrency: this.queue.concurrency,
      },
      twilio: {
        accountSid: this.accountSid ? 'configured' : 'missing',
        messagingServiceSid: this.messagingServiceSid ? 'configured' : 'missing',
      },
    };
  }

  /**
   * Shutdown service gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down Twilio SMS service');

    try {
      // Wait for pending messages to complete
      await this.queue.onIdle();

      this.logger.info('Twilio SMS service shutdown complete', {
        totalMessages: this.metrics.totalMessages,
        successRate: this.metrics.totalMessages > 0 
          ? (this.metrics.successfulMessages / this.metrics.totalMessages) * 100 
          : 0,
      });
    } catch (error) {
      this.logger.error('Error during Twilio service shutdown', { error: error.message });
    }
  }

  /**
   * Handle Twilio webhook for delivery status updates
   * @param {string} campaignId - Campaign ID
   * @param {Object} statusData - Twilio status webhook data
   * @returns {Object} Processing result
   */
  async handleDeliveryStatus(campaignId, statusData) {
    try {
      const campaign = this.activeCampaigns.get(campaignId);
      if (!campaign) {
        this.logger.warn('Delivery status for unknown campaign', { campaignId });
        return { processed: false, reason: 'campaign_not_found' };
      }

      // Find the message in campaign results
      const messageIndex = campaign.results.messages.findIndex(
        m => m.twilioSid === statusData.MessageSid
      );

      if (messageIndex === -1) {
        this.logger.warn('Message not found in campaign', { 
          campaignId, 
          messageSid: statusData.MessageSid 
        });
        return { processed: false, reason: 'message_not_found' };
      }

      // Update message status
      const message = campaign.results.messages[messageIndex];
      message.deliveryStatus = statusData.MessageStatus;
      message.deliveredAt = statusData.EventTimestamp || new Date().toISOString();
      
      if (statusData.ErrorCode) {
        message.errorCode = statusData.ErrorCode;
        message.errorMessage = statusData.ErrorMessage;
      }

      // Update campaign delivery statistics
      this.updateCampaignDeliveryStats(campaign, statusData.MessageStatus);

      this.logger.info('Delivery status updated', {
        campaignId,
        messageSid: statusData.MessageSid,
        status: statusData.MessageStatus,
        to: statusData.To
      });

      return {
        processed: true,
        campaignId: campaignId,
        messageSid: statusData.MessageSid,
        status: statusData.MessageStatus,
        phone: statusData.To,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Delivery status processing failed', {
        error: error.message,
        campaignId,
        statusData
      });

      return {
        processed: false,
        error: error.message,
        campaignId,
        statusData
      };
    }
  }

  /**
   * Update campaign delivery statistics
   * @private
   */
  updateCampaignDeliveryStats(campaign, messageStatus) {
    switch (messageStatus) {
      case 'delivered':
        campaign.results.delivered = (campaign.results.delivered || 0) + 1;
        this.metrics.deliveryRates[campaign.type].delivered++;
        break;
      case 'failed':
      case 'undelivered':
        campaign.results.failed = (campaign.results.failed || 0) + 1;
        this.metrics.deliveryRates[campaign.type].failed++;
        break;
      case 'sent':
        // Already counted when initially sent
        break;
    }
  }

  /**
   * Normalize phone number for caching
   * @private
   */
  normalizePhoneNumber(phone) {
    return phone.replace(/\D/g, '');
  }

  /**
   * Delay utility for rate limiting
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default TwilioSmsService;