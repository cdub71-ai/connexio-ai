import twilio from 'twilio';
import pRetry from 'p-retry';
import PQueue from 'p-queue';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { createContextLogger, createTimer } from '../utils/logger.js';

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

    // Rate limiting queue
    this.queue = new PQueue({
      concurrency: config.twilio.maxConcurrent || 10,
      intervalCap: config.twilio.intervalCap || 100,
      interval: config.twilio.interval || 60000, // 1 minute
    });

    this.logger = createContextLogger({ service: 'twilio-sms-service' });

    // Campaign tracking
    this.activeCampaigns = new Map();
    
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
}

export default TwilioSmsService;