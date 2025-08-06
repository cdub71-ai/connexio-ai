/**
 * Webhook Handler Service
 * Handles delivery status webhooks from SMS/Email providers
 * Phase 1: Marketing automation fulfillment webhook processing
 */

const { createContextLogger } = require('../utils/logger.js');

class WebhookHandlerService {
  constructor(options = {}) {
    this.logger = createContextLogger({ service: 'webhook-handler-service' });
    
    // Services that need webhook updates
    this.services = new Map();
    
    // Webhook processing metrics
    this.metrics = {
      totalWebhooks: 0,
      successfulWebhooks: 0,
      failedWebhooks: 0,
      webhooksByProvider: {},
      webhooksByType: {},
      averageProcessingTime: 0
    };

    this.logger.info('Webhook Handler service initialized');
  }

  /**
   * Register a service to receive webhook updates
   * @param {string} serviceType - Type of service (sms, email, validation)
   * @param {Object} service - Service instance
   */
  registerService(serviceType, service) {
    this.services.set(serviceType, service);
    this.logger.info('Service registered for webhooks', { serviceType });
  }

  /**
   * Handle Twilio SMS delivery status webhook
   * @param {Object} webhookData - Twilio webhook payload
   * @param {string} campaignId - Campaign ID from URL path
   * @returns {Object} Processing result
   */
  async handleTwilioSMSWebhook(webhookData, campaignId) {
    const startTime = Date.now();
    const logger = this.createWebhookLogger('twilio', 'sms_status', campaignId);
    
    logger.info('Processing Twilio SMS delivery webhook', {
      messageSid: webhookData.MessageSid,
      messageStatus: webhookData.MessageStatus,
      to: webhookData.To
    });

    try {
      // Validate webhook data
      this.validateTwilioWebhook(webhookData);
      
      // Get SMS service
      const smsService = this.services.get('sms');
      if (!smsService) {
        throw new Error('SMS service not registered');
      }

      // Process delivery status update
      const updateResult = await smsService.handleDeliveryStatus(campaignId, webhookData);
      
      // Update metrics
      this.updateWebhookMetrics('twilio', 'sms_status', startTime, true);
      
      logger.info('Twilio SMS webhook processed successfully', {
        messageSid: webhookData.MessageSid,
        processed: updateResult.processed,
        processingTime: Date.now() - startTime
      });

      return {
        success: true,
        provider: 'twilio',
        type: 'sms_status',
        campaignId: campaignId,
        messageSid: webhookData.MessageSid,
        status: webhookData.MessageStatus,
        processed: updateResult.processed,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      this.updateWebhookMetrics('twilio', 'sms_status', startTime, false);
      
      logger.error('Twilio SMS webhook processing failed', {
        error: error.message,
        webhookData: webhookData,
        processingTime: Date.now() - startTime
      });

      return {
        success: false,
        provider: 'twilio',
        type: 'sms_status',
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Handle SendGrid email delivery webhook
   * @param {Array} webhookData - SendGrid webhook payload (array of events)
   * @returns {Object} Processing result
   */
  async handleSendGridWebhook(webhookData) {
    const startTime = Date.now();
    const logger = this.createWebhookLogger('sendgrid', 'email_events', null);
    
    logger.info('Processing SendGrid email webhook', {
      eventCount: webhookData.length
    });

    try {
      // Validate webhook data
      this.validateSendGridWebhook(webhookData);
      
      // Get email service
      const emailService = this.services.get('email');
      
      const results = [];
      for (const event of webhookData) {
        try {
          if (emailService && emailService.handleDeliveryStatus) {
            const updateResult = await emailService.handleDeliveryStatus(event);
            results.push({
              eventId: event.sg_event_id,
              success: true,
              result: updateResult
            });
          } else {
            // Log event for manual processing
            logger.info('Email delivery event received', {
              event: event.event,
              email: event.email,
              timestamp: event.timestamp
            });
            results.push({
              eventId: event.sg_event_id,
              success: true,
              result: { logged: true }
            });
          }
        } catch (error) {
          results.push({
            eventId: event.sg_event_id,
            success: false,
            error: error.message
          });
        }
      }

      this.updateWebhookMetrics('sendgrid', 'email_events', startTime, true);
      
      const successCount = results.filter(r => r.success).length;
      logger.info('SendGrid webhook processed', {
        totalEvents: webhookData.length,
        successfulEvents: successCount,
        processingTime: Date.now() - startTime
      });

      return {
        success: true,
        provider: 'sendgrid',
        type: 'email_events',
        totalEvents: webhookData.length,
        successfulEvents: successCount,
        results: results,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      this.updateWebhookMetrics('sendgrid', 'email_events', startTime, false);
      
      logger.error('SendGrid webhook processing failed', {
        error: error.message,
        eventCount: webhookData.length,
        processingTime: Date.now() - startTime
      });

      return {
        success: false,
        provider: 'sendgrid',
        type: 'email_events',
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Handle generic delivery status webhook
   * @param {string} provider - Provider name
   * @param {string} type - Webhook type
   * @param {Object} webhookData - Webhook payload
   * @param {Object} context - Additional context
   * @returns {Object} Processing result
   */
  async handleGenericWebhook(provider, type, webhookData, context = {}) {
    const startTime = Date.now();
    const logger = this.createWebhookLogger(provider, type, context.campaignId);
    
    logger.info('Processing generic webhook', {
      provider,
      type,
      dataKeys: Object.keys(webhookData)
    });

    try {
      // Route to appropriate service
      const serviceType = this.getServiceTypeForProvider(provider);
      const service = this.services.get(serviceType);
      
      if (service && service.handleWebhook) {
        const result = await service.handleWebhook(type, webhookData, context);
        
        this.updateWebhookMetrics(provider, type, startTime, true);
        
        logger.info('Generic webhook processed successfully', {
          provider,
          type,
          processed: result.processed || true,
          processingTime: Date.now() - startTime
        });

        return {
          success: true,
          provider,
          type,
          result,
          processingTime: Date.now() - startTime
        };
      } else {
        // Log for manual processing
        logger.info('Webhook logged for manual processing', {
          provider,
          type,
          webhookData
        });

        this.updateWebhookMetrics(provider, type, startTime, true);

        return {
          success: true,
          provider,
          type,
          logged: true,
          processingTime: Date.now() - startTime
        };
      }

    } catch (error) {
      this.updateWebhookMetrics(provider, type, startTime, false);
      
      logger.error('Generic webhook processing failed', {
        provider,
        type,
        error: error.message,
        processingTime: Date.now() - startTime
      });

      return {
        success: false,
        provider,
        type,
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Get webhook processing metrics and health status
   * @returns {Object} Metrics and health data
   */
  getWebhookMetrics() {
    return {
      service: 'WebhookHandlerService',
      status: 'healthy',
      registeredServices: Array.from(this.services.keys()),
      metrics: {
        ...this.metrics,
        successRate: this.metrics.totalWebhooks > 0 ? 
          Math.round((this.metrics.successfulWebhooks / this.metrics.totalWebhooks) * 100) : 0,
        failureRate: this.metrics.totalWebhooks > 0 ? 
          Math.round((this.metrics.failedWebhooks / this.metrics.totalWebhooks) * 100) : 0
      },
      supportedProviders: [
        'twilio',
        'sendgrid',
        'mailgun',
        'vonage',
        'neverbounce',
        'briteverify'
      ],
      lastUpdated: new Date().toISOString()
    };
  }

  // Private helper methods

  /**
   * Validate Twilio webhook data
   * @private
   */
  validateTwilioWebhook(webhookData) {
    const required = ['MessageSid', 'MessageStatus', 'To'];
    for (const field of required) {
      if (!webhookData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    const validStatuses = ['sent', 'delivered', 'undelivered', 'failed', 'received'];
    if (!validStatuses.includes(webhookData.MessageStatus)) {
      throw new Error(`Invalid message status: ${webhookData.MessageStatus}`);
    }
  }

  /**
   * Validate SendGrid webhook data
   * @private
   */
  validateSendGridWebhook(webhookData) {
    if (!Array.isArray(webhookData)) {
      throw new Error('SendGrid webhook data must be an array');
    }

    for (const event of webhookData) {
      if (!event.event || !event.email || !event.timestamp) {
        throw new Error('Invalid SendGrid event structure');
      }
    }
  }

  /**
   * Get service type for provider
   * @private
   */
  getServiceTypeForProvider(provider) {
    const providerMap = {
      twilio: 'sms',
      vonage: 'sms',
      sendgrid: 'email',
      mailgun: 'email',
      neverbounce: 'validation',
      briteverify: 'validation',
      freshaddress: 'validation'
    };

    return providerMap[provider.toLowerCase()] || 'unknown';
  }

  /**
   * Create webhook-specific logger
   * @private
   */
  createWebhookLogger(provider, type, campaignId) {
    return this.logger.child({
      provider,
      webhookType: type,
      campaignId: campaignId || 'unknown'
    });
  }

  /**
   * Update webhook processing metrics
   * @private
   */
  updateWebhookMetrics(provider, type, startTime, success) {
    this.metrics.totalWebhooks++;
    
    if (success) {
      this.metrics.successfulWebhooks++;
    } else {
      this.metrics.failedWebhooks++;
    }

    // Track by provider
    if (!this.metrics.webhooksByProvider[provider]) {
      this.metrics.webhooksByProvider[provider] = { total: 0, success: 0, failed: 0 };
    }
    this.metrics.webhooksByProvider[provider].total++;
    if (success) {
      this.metrics.webhooksByProvider[provider].success++;
    } else {
      this.metrics.webhooksByProvider[provider].failed++;
    }

    // Track by type
    if (!this.metrics.webhooksByType[type]) {
      this.metrics.webhooksByType[type] = { total: 0, success: 0, failed: 0 };
    }
    this.metrics.webhooksByType[type].total++;
    if (success) {
      this.metrics.webhooksByType[type].success++;
    } else {
      this.metrics.webhooksByType[type].failed++;
    }

    // Update average processing time
    const processingTime = Date.now() - startTime;
    const totalRequests = this.metrics.successfulWebhooks + this.metrics.failedWebhooks;
    this.metrics.averageProcessingTime = 
      ((this.metrics.averageProcessingTime * (totalRequests - 1)) + processingTime) / totalRequests;
  }
}

module.exports = WebhookHandlerService;