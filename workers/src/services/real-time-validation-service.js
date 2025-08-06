/**
 * Real-Time Validation Service for Form Submissions
 * Phase 3: Advanced real-time validation with intelligent caching
 */

const EnhancedValidationService = require('./enhanced-validation-service');
const ClaudeDeduplicationService = require('./claude-deduplication-service');

class RealTimeValidationService {
  constructor(options = {}) {
    this.validationService = new EnhancedValidationService();
    this.deduplicationService = new ClaudeDeduplicationService();
    
    this.config = {
      cacheTimeout: options.cacheTimeout || 60 * 60 * 1000, // 1 hour
      maxConcurrentValidations: options.maxConcurrentValidations || 50,
      emergencyFallback: options.emergencyFallback || true,
      realTimeThreshold: options.realTimeThreshold || 2000, // 2 seconds
    };

    // Real-time validation cache
    this.validationCache = new Map();
    this.activeValidations = new Map();
    this.validationQueue = [];
    
    // Performance metrics
    this.metrics = {
      totalValidations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
      failureRate: 0
    };

    // Start background cleanup
    this.startCacheCleanup();
  }

  /**
   * Real-time email validation for form submissions
   * @param {string} email - Email to validate
   * @param {Object} context - Form submission context
   * @returns {Object} Real-time validation result
   */
  async validateFormSubmission(email, context = {}) {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey(email, context);
    
    try {
      // Check cache first
      if (this.validationCache.has(cacheKey)) {
        const cached = this.validationCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
          this.metrics.cacheHits++;
          return {
            ...cached.result,
            cached: true,
            responseTime: Date.now() - startTime
          };
        }
      }

      this.metrics.cacheMisses++;
      
      // Check if validation is already in progress
      if (this.activeValidations.has(cacheKey)) {
        return await this.activeValidations.get(cacheKey);
      }

      // Start new validation
      const validationPromise = this.performRealTimeValidation(email, context);
      this.activeValidations.set(cacheKey, validationPromise);

      const result = await validationPromise;
      result.responseTime = Date.now() - startTime;
      
      // Cache the result
      this.validationCache.set(cacheKey, {
        result: result,
        timestamp: Date.now()
      });

      // Clean up active validation
      this.activeValidations.delete(cacheKey);
      
      this.updateMetrics(result, Date.now() - startTime);
      return result;

    } catch (error) {
      console.error('Real-time validation failed:', error);
      this.activeValidations.delete(cacheKey);
      
      // Emergency fallback
      if (this.config.emergencyFallback) {
        return this.getEmergencyFallbackResult(email, error);
      }
      
      throw error;
    }
  }

  /**
   * Perform the actual real-time validation with optimizations
   * @param {string} email - Email to validate
   * @param {Object} context - Validation context
   * @returns {Object} Validation result
   */
  async performRealTimeValidation(email, context) {
    const validationId = this.generateValidationId();
    console.log(`⚡ Starting real-time validation ${validationId} for: ${email}`);

    // Basic email format check (instant)
    const formatCheck = this.basicFormatValidation(email);
    if (!formatCheck.valid) {
      return {
        validationId: validationId,
        email: email,
        status: 'invalid',
        deliverability: 'undeliverable',
        quality_score: 0,
        validation_type: 'format_check',
        flags: ['invalid_format'],
        suggestions: formatCheck.suggestions,
        confidence: 100
      };
    }

    // Quick duplicate check (if context provided)
    if (context.existingContacts) {
      const duplicateCheck = await this.quickDuplicateCheck(email, context.existingContacts);
      if (duplicateCheck.isDuplicate) {
        return {
          validationId: validationId,
          email: email,
          status: 'duplicate',
          deliverability: 'duplicate',
          quality_score: 50,
          validation_type: 'duplicate_check',
          duplicate_info: duplicateCheck,
          confidence: duplicateCheck.confidence
        };
      }
    }

    // Select fastest validation service for real-time
    const service = await this.selectRealTimeService(email, context);
    
    // Set timeout for real-time constraint
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Real-time validation timeout')), 
                 this.config.realTimeThreshold);
    });

    const validationPromise = this.validationService.validateEmail(email, {
      service: service,
      priority: 'speed',
      realTime: true
    });

    try {
      const result = await Promise.race([validationPromise, timeoutPromise]);
      
      return {
        validationId: validationId,
        ...result,
        validation_type: 'full_validation',
        real_time: true
      };

    } catch (error) {
      if (error.message === 'Real-time validation timeout') {
        // Return quick validation result
        return this.getQuickValidationResult(email, validationId);
      }
      throw error;
    }
  }

  /**
   * Basic email format validation (instant)
   * @param {string} email - Email to validate
   * @returns {Object} Format validation result
   */
  basicFormatValidation(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid = emailRegex.test(email);
    
    const suggestions = [];
    if (!valid) {
      // Common format corrections
      if (!email.includes('@')) {
        suggestions.push('Email must contain @ symbol');
      }
      if (!email.includes('.')) {
        suggestions.push('Email must contain domain extension');
      }
      if (email.includes('..')) {
        suggestions.push('Remove consecutive dots');
      }
      if (/\s/.test(email)) {
        suggestions.push('Remove spaces from email address');
      }
    }

    return { valid, suggestions };
  }

  /**
   * Quick duplicate check using simple matching
   * @param {string} email - Email to check
   * @param {Array} existingContacts - Existing contacts
   * @returns {Object} Quick duplicate result
   */
  async quickDuplicateCheck(email, existingContacts) {
    const normalizedEmail = email.toLowerCase().trim();
    
    // Exact match check
    for (const contact of existingContacts.slice(0, 100)) { // Limit for speed
      const contactEmail = (contact.email || contact.emailAddress || '').toLowerCase().trim();
      if (contactEmail === normalizedEmail) {
        return {
          isDuplicate: true,
          confidence: 100,
          matchType: 'exact',
          existingContact: contact
        };
      }
    }

    // Quick fuzzy check for obvious variations
    const emailParts = normalizedEmail.split('@');
    if (emailParts.length === 2) {
      const [localPart, domain] = emailParts;
      const baseLocal = localPart.split('+')[0]; // Remove + extensions
      
      for (const contact of existingContacts.slice(0, 50)) {
        const contactEmail = (contact.email || contact.emailAddress || '').toLowerCase().trim();
        if (contactEmail.includes(domain) && contactEmail.includes(baseLocal)) {
          return {
            isDuplicate: true,
            confidence: 85,
            matchType: 'fuzzy',
            existingContact: contact
          };
        }
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Select best service for real-time validation (prioritizes speed)
   * @param {string} email - Email to validate
   * @param {Object} context - Context
   * @returns {string} Service name
   */
  async selectRealTimeService(email, context) {
    // For real-time, prioritize speed over accuracy
    const services = [
      { name: 'briteverify', speed: 120, accuracy: 0.94 },
      { name: 'neverbounce', speed: 150, accuracy: 0.96 },
      { name: 'freshaddress', speed: 180, accuracy: 0.96 }
    ];

    // Sort by speed for real-time scenarios
    services.sort((a, b) => a.speed - b.speed);
    
    return services[0].name;
  }

  /**
   * Get quick validation result when full validation times out
   * @param {string} email - Email
   * @param {string} validationId - Validation ID
   * @returns {Object} Quick result
   */
  getQuickValidationResult(email, validationId) {
    const domain = email.split('@')[1]?.toLowerCase();
    const isCommonDomain = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(domain);
    
    return {
      validationId: validationId,
      email: email,
      status: 'unknown',
      deliverability: 'unknown',
      quality_score: isCommonDomain ? 70 : 50,
      validation_type: 'quick_validation',
      flags: ['timeout_fallback'],
      confidence: isCommonDomain ? 70 : 30,
      note: 'Quick validation due to real-time constraints'
    };
  }

  /**
   * Emergency fallback result when all validation fails
   * @param {string} email - Email
   * @param {Error} error - Error that occurred
   * @returns {Object} Fallback result
   */
  getEmergencyFallbackResult(email, error) {
    const formatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    
    return {
      email: email,
      status: formatValid ? 'unknown' : 'invalid',
      deliverability: formatValid ? 'unknown' : 'undeliverable',
      quality_score: formatValid ? 50 : 0,
      validation_type: 'emergency_fallback',
      flags: ['service_unavailable'],
      error: error.message,
      confidence: formatValid ? 50 : 100
    };
  }

  /**
   * Batch validate form submissions with real-time constraints
   * @param {Array} submissions - Form submissions to validate
   * @param {Object} options - Batch options
   * @returns {Array} Validation results
   */
  async batchValidateFormSubmissions(submissions, options = {}) {
    const batchSize = options.batchSize || 20; // Smaller batches for real-time
    const results = [];
    
    console.log(`⚡ Batch validating ${submissions.length} form submissions`);
    
    for (let i = 0; i < submissions.length; i += batchSize) {
      const batch = submissions.slice(i, i + batchSize);
      
      // Process batch in parallel with concurrency limit
      const batchPromises = batch.map(submission => 
        this.validateFormSubmission(submission.email, submission.context)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push(this.getEmergencyFallbackResult(
            batch[index].email, 
            result.reason
          ));
        }
      });
      
      // Brief pause between batches to avoid overwhelming services
      if (i + batchSize < submissions.length) {
        await this.delay(100);
      }
    }

    return results;
  }

  /**
   * Real-time validation API endpoint handler
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleValidationEndpoint(req, res) {
    const startTime = Date.now();
    
    try {
      const { email, context = {} } = req.body;
      
      if (!email) {
        return res.status(400).json({
          error: 'Email address is required',
          status: 'error'
        });
      }

      const result = await this.validateFormSubmission(email, context);
      
      res.json({
        success: true,
        validation: result,
        responseTime: Date.now() - startTime,
        cached: result.cached || false
      });

    } catch (error) {
      console.error('Validation endpoint error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message,
        fallback: this.getEmergencyFallbackResult(req.body.email || 'unknown', error),
        responseTime: Date.now() - startTime
      });
    }
  }

  /**
   * Get validation service performance metrics
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    const cacheHitRate = this.metrics.totalValidations > 0 
      ? (this.metrics.cacheHits / this.metrics.totalValidations) * 100 
      : 0;

    return {
      totalValidations: this.metrics.totalValidations,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      averageResponseTime: Math.round(this.metrics.averageResponseTime),
      failureRate: Math.round(this.metrics.failureRate * 100) / 100,
      cacheSize: this.validationCache.size,
      activeValidations: this.activeValidations.size,
      queueSize: this.validationQueue.length
    };
  }

  // Utility methods
  getCacheKey(email, context) {
    const contextHash = JSON.stringify(context).slice(0, 50);
    return `${email.toLowerCase()}:${contextHash}`;
  }

  generateValidationId() {
    return `val_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  updateMetrics(result, responseTime) {
    this.metrics.totalValidations++;
    
    // Update average response time
    this.metrics.averageResponseTime = (
      (this.metrics.averageResponseTime * (this.metrics.totalValidations - 1)) + responseTime
    ) / this.metrics.totalValidations;
    
    // Update failure rate
    if (result.status === 'error' || result.validation_type === 'emergency_fallback') {
      this.metrics.failureRate = (
        (this.metrics.failureRate * (this.metrics.totalValidations - 1)) + 1
      ) / this.metrics.totalValidations;
    }
  }

  startCacheCleanup() {
    // Clean up expired cache entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.validationCache.entries()) {
        if (now - value.timestamp > this.config.cacheTimeout) {
          this.validationCache.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = RealTimeValidationService;