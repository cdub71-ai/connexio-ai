import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { createContextLogger, createTimer } from '../utils/logger.js';
import config from '../config/index.js';

/**
 * SendGrid Email Validation Service
 * Integrates with SendGrid's Email Validation API for high-accuracy email validation
 * Supports real-time validation and batch processing for client file validation requests
 */
class SendGridValidationService {
  constructor() {
    this.apiKey = config.sendgrid?.apiKey || process.env.SENDGRID_API_KEY;
    this.baseUrl = 'https://api.sendgrid.com/v3';
    this.logger = createContextLogger({ service: 'sendgrid-validation' });
    
    // Rate limiting and performance tracking
    this.requestCount = 0;
    this.lastRequestTime = 0;
    this.rateLimitDelay = 100; // ms between requests
    
    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      successfulValidations: 0,
      failedValidations: 0,
      averageResponseTime: 0,
      costTracking: {
        totalValidations: 0,
        estimatedCost: 0
      }
    };

    if (!this.apiKey) {
      throw new Error('SendGrid API key is required for email validation service');
    }

    this.logger.info('SendGrid validation service initialized', {
      baseUrl: this.baseUrl,
      rateLimitDelay: this.rateLimitDelay
    });
  }

  /**
   * Validate single email address using SendGrid API
   * @param {string} email - Email address to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result with SendGrid-specific data
   */
  async validateEmail(email, options = {}) {
    const validationId = uuidv4();
    const timer = createTimer('sendgrid-validation');
    const logger = createContextLogger({
      service: 'sendgrid-validation',
      validationId,
      email: this._maskEmail(email)
    });

    logger.info('Starting SendGrid email validation', {
      email: this._maskEmail(email),
      options: Object.keys(options)
    });

    try {
      // Apply rate limiting
      await this._applyRateLimit();

      const response = await fetch(`${this.baseUrl}/validations/email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Connexio-AI/1.0'
        },
        body: JSON.stringify({
          email: email,
          source: options.source || 'connexio-ai'
        }),
        timeout: 30000
      });

      const duration = timer.end();
      
      if (!response.ok) {
        throw new Error(`SendGrid API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const result = this._processSendGridResponse(data, email, validationId);

      // Update metrics
      this._updateMetrics(true, duration, result.verdict);

      logger.info('SendGrid validation completed', {
        verdict: result.verdict,
        score: result.score,
        duration
      });

      return result;

    } catch (error) {
      const duration = timer.end();
      this._updateMetrics(false, duration, 'error');
      
      logger.error('SendGrid validation failed', {
        error: error.message,
        duration
      });

      // Return fallback result
      return this._createFallbackResult(email, validationId, error);
    }
  }

  /**
   * Validate batch of email addresses
   * @param {Array<string>} emails - Array of email addresses
   * @param {Object} options - Batch validation options
   * @returns {Promise<Object>} Batch validation results
   */
  async validateBatch(emails, options = {}) {
    const batchId = uuidv4();
    const timer = createTimer('sendgrid-batch-validation');
    const logger = createContextLogger({
      service: 'sendgrid-validation',
      batchId,
      emailCount: emails.length
    });

    logger.info('Starting SendGrid batch validation', {
      emailCount: emails.length,
      batchSize: options.batchSize || 100,
      concurrency: options.concurrency || 5
    });

    const results = {
      batchId,
      totalEmails: emails.length,
      validatedEmails: 0,
      results: [],
      summary: {
        valid: 0,
        invalid: 0,
        risky: 0,
        unknown: 0
      },
      processingTime: 0,
      errors: []
    };

    try {
      const batchSize = options.batchSize || 100;
      const concurrency = options.concurrency || 5;
      
      // Process emails in batches with concurrency control
      const batches = this._createBatches(emails, batchSize);
      
      for (let i = 0; i < batches.length; i += concurrency) {
        const concurrentBatches = batches.slice(i, i + concurrency);
        
        const batchPromises = concurrentBatches.map(async (batch, batchIndex) => {
          const batchResults = await Promise.all(
            batch.map(email => this.validateEmail(email, options))
          );
          return batchResults;
        });

        const concurrentResults = await Promise.all(batchPromises);
        
        // Flatten and add results
        concurrentResults.flat().forEach(result => {
          results.results.push(result);
          results.summary[result.verdict]++;
          results.validatedEmails++;
        });

        // Progress logging
        logger.info('Batch progress', {
          processed: results.validatedEmails,
          total: emails.length,
          percentage: Math.round((results.validatedEmails / emails.length) * 100)
        });
      }

      results.processingTime = timer.end();

      logger.info('SendGrid batch validation completed', {
        totalEmails: results.totalEmails,
        validatedEmails: results.validatedEmails,
        summary: results.summary,
        duration: results.processingTime
      });

      return results;

    } catch (error) {
      results.processingTime = timer.end();
      results.errors.push({
        message: error.message,
        timestamp: new Date().toISOString()
      });

      logger.error('SendGrid batch validation failed', {
        error: error.message,
        processedEmails: results.validatedEmails,
        totalEmails: results.totalEmails
      });

      return results;
    }
  }

  /**
   * Process SendGrid API response and normalize for Connexio AI
   * @private
   */
  _processSendGridResponse(data, email, validationId) {
    // SendGrid response structure varies, normalize it
    const result = data.result || data;
    
    return {
      validationId,
      email: email,
      verdict: this._mapSendGridVerdict(result.verdict || result.status),
      score: result.score || this._calculateScoreFromVerdict(result.verdict || result.status),
      provider: 'sendgrid',
      timestamp: new Date().toISOString(),
      details: {
        sendgrid: {
          verdict: result.verdict,
          score: result.score,
          local: result.local,
          host: result.host,
          suggestion: result.suggestion,
          checks: result.checks || {}
        },
        // Normalized fields for Connexio AI consistency
        isValid: this._isValidEmail(result.verdict || result.status),
        isDeliverable: this._isDeliverable(result.verdict || result.status),
        riskLevel: this._calculateRiskLevel(result.verdict || result.status, result.score),
        confidence: result.score || 50
      },
      metadata: {
        processingTime: Date.now(),
        source: 'sendgrid-api',
        version: '1.0'
      }
    };
  }

  /**
   * Map SendGrid verdict to Connexio AI standard
   * @private
   */
  _mapSendGridVerdict(verdict) {
    const verdictMap = {
      'Valid': 'valid',
      'Invalid': 'invalid', 
      'Risky': 'risky',
      'Unknown': 'unknown',
      // Alternative formats
      'valid': 'valid',
      'invalid': 'invalid',
      'risky': 'risky',
      'unknown': 'unknown'
    };

    return verdictMap[verdict] || 'unknown';
  }

  /**
   * Check if email is considered valid
   * @private
   */
  _isValidEmail(verdict) {
    return ['Valid', 'valid'].includes(verdict);
  }

  /**
   * Check if email is deliverable
   * @private
   */
  _isDeliverable(verdict) {
    return ['Valid', 'valid', 'Risky', 'risky'].includes(verdict);
  }

  /**
   * Calculate risk level based on verdict and score
   * @private
   */
  _calculateRiskLevel(verdict, score = 50) {
    if (['Valid', 'valid'].includes(verdict) && score > 80) return 'low';
    if (['Valid', 'valid'].includes(verdict) && score > 60) return 'medium';
    if (['Risky', 'risky'].includes(verdict)) return 'high';
    if (['Invalid', 'invalid'].includes(verdict)) return 'very_high';
    return 'unknown';
  }

  /**
   * Calculate score from verdict if not provided
   * @private
   */
  _calculateScoreFromVerdict(verdict) {
    const scoreMap = {
      'Valid': 85,
      'valid': 85,
      'Risky': 60,
      'risky': 60,
      'Invalid': 20,
      'invalid': 20,
      'Unknown': 50,
      'unknown': 50
    };

    return scoreMap[verdict] || 50;
  }

  /**
   * Create fallback result for failed validations
   * @private
   */
  _createFallbackResult(email, validationId, error) {
    return {
      validationId,
      email: email,
      verdict: 'unknown',
      score: 50,
      provider: 'sendgrid',
      timestamp: new Date().toISOString(),
      details: {
        sendgrid: {
          error: error.message,
          verdict: 'unknown'
        },
        isValid: false,
        isDeliverable: false,
        riskLevel: 'unknown',
        confidence: 0
      },
      metadata: {
        processingTime: Date.now(),
        source: 'sendgrid-api-fallback',
        version: '1.0',
        error: true
      }
    };
  }

  /**
   * Apply rate limiting between requests
   * @private
   */
  async _applyRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const delay = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Create batches from array of emails
   * @private
   */
  _createBatches(emails, batchSize) {
    const batches = [];
    for (let i = 0; i < emails.length; i += batchSize) {
      batches.push(emails.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Update performance metrics
   * @private
   */
  _updateMetrics(success, duration, verdict) {
    this.metrics.totalRequests++;
    
    if (success) {
      this.metrics.successfulValidations++;
    } else {
      this.metrics.failedValidations++;
    }

    // Update average response time
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + duration;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalRequests;

    // Cost tracking (approximate based on SendGrid pricing)
    if (success && verdict !== 'error') {
      this.metrics.costTracking.totalValidations++;
      this.metrics.costTracking.estimatedCost = this.metrics.costTracking.totalValidations * 0.001; // $0.001 per validation estimate
    }
  }

  /**
   * Mask email for logging (privacy)
   * @private
   */
  _maskEmail(email) {
    if (!email || typeof email !== 'string') return 'invalid-email';
    const [local, domain] = email.split('@');
    if (!domain) return email.substring(0, 3) + '***';
    return `${local.substring(0, 2)}***@${domain}`;
  }

  /**
   * Get service health metrics
   */
  getHealthMetrics() {
    return {
      service: 'sendgrid-validation',
      status: this.apiKey ? 'ready' : 'not_configured',
      metrics: {
        ...this.metrics,
        successRate: this.metrics.totalRequests > 0 
          ? (this.metrics.successfulValidations / this.metrics.totalRequests) * 100 
          : 0,
        requestCount: this.requestCount,
        lastRequestTime: this.lastRequestTime
      }
    };
  }

  /**
   * Test connection to SendGrid API
   */
  async testConnection() {
    try {
      const testResult = await this.validateEmail('test@example.com', { source: 'connection-test' });
      return {
        success: true,
        provider: 'sendgrid',
        responseTime: testResult.metadata?.processingTime,
        status: 'connected'
      };
    } catch (error) {
      return {
        success: false,
        provider: 'sendgrid',
        error: error.message,
        status: 'connection_failed'
      };
    }
  }
}

export default SendGridValidationService;