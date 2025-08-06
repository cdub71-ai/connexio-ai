/**
 * Enhanced Multi-Service Email Validation System
 * Phase 2: Smart service routing and advanced validation features
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');

class EnhancedValidationService {
  constructor(apiKeys = {}) {
    this.services = {
      neverbounce: {
        apiKey: apiKeys.neverbounce || process.env.NEVERBOUNCE_API_KEY,
        baseUrl: 'https://api.neverbounce.com/v4',
        costPerValidation: 0.008, // $8 per 1000
        accuracy: 0.96,
        avgResponseTime: 150,
        features: ['syntax', 'domain', 'mailbox', 'risk_scoring', 'typo_detection'],
        limits: { requestsPerSecond: 10, dailyLimit: 50000 }
      },
      briteverify: {
        apiKey: apiKeys.briteverify || process.env.BRITEVERIFY_API_KEY,
        baseUrl: 'https://bpi.briteverify.com',
        costPerValidation: 0.010, // $10 per 1000
        accuracy: 0.94,
        avgResponseTime: 120,
        features: ['syntax', 'domain', 'mailbox', 'disposable_detection'],
        limits: { requestsPerSecond: 15, dailyLimit: 100000 }
      },
      freshaddress: {
        apiKey: apiKeys.freshaddress || process.env.FRESHADDRESS_API_KEY,
        baseUrl: 'https://api.freshaddress.com/v1',
        costPerValidation: 0.005, // $5 per 1000
        accuracy: 0.96,
        avgResponseTime: 180,
        features: ['syntax', 'domain', 'mailbox', 'risk_scoring', 'deliverability_prediction'],
        limits: { requestsPerSecond: 8, dailyLimit: 25000 }
      }
    };

    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.validationHistory = new Map(); // In-memory cache for validation history
    this.serviceHealthStatus = new Map(); // Track service health
  }

  /**
   * Smart service selection based on email patterns and requirements
   * @param {string} email - Email to validate
   * @param {Object} requirements - Validation requirements
   * @returns {string} Best service for this validation
   */
  async selectOptimalService(email, requirements = {}) {
    const emailDomain = email.split('@')[1]?.toLowerCase();
    const emailPattern = this.analyzeEmailPattern(email);
    
    // Check service health
    await this.updateServiceHealthStatus();

    const prompt = `As a marketing operations expert, recommend the best email validation service for this scenario:

**Email Details:**
- Domain: ${emailDomain}
- Pattern: ${emailPattern.type}
- Volume: ${requirements.volume || 1} emails
- Priority: ${requirements.priority || 'accuracy'}
- Budget: ${requirements.budget || 'standard'}

**Available Services:**
${Object.entries(this.services).map(([name, config]) => {
  const health = this.serviceHealthStatus.get(name) || { status: 'unknown', responseTime: 0 };
  return `- ${name}: $${config.costPerValidation}/email, ${config.accuracy*100}% accuracy, ${config.avgResponseTime}ms avg response, Health: ${health.status}`;
}).join('\n')}

**Selection Criteria:**
- Cost efficiency for the volume
- Accuracy requirements
- Response time needs
- Service reliability
- Domain-specific performance

Respond with just the service name (neverbounce, briteverify, or freshaddress).`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 50,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }]
      });

      const selectedService = response.content[0].text.toLowerCase().trim();
      
      // Validate the selection is available and healthy
      if (this.services[selectedService] && this.isServiceHealthy(selectedService)) {
        return selectedService;
      }
    } catch (error) {
      console.error('Smart service selection failed:', error);
    }

    // Fallback to rule-based selection
    return this.fallbackServiceSelection(emailPattern, requirements);
  }

  /**
   * Analyze email pattern to determine validation strategy
   * @param {string} email - Email address
   * @returns {Object} Pattern analysis
   */
  analyzeEmailPattern(email) {
    const domain = email.split('@')[1]?.toLowerCase();
    const localPart = email.split('@')[0]?.toLowerCase();

    if (!domain) return { type: 'invalid', confidence: 0 };

    // Common patterns
    if (domain.includes('gmail') || domain.includes('yahoo') || domain.includes('outlook')) {
      return { type: 'consumer', confidence: 0.9, validation_priority: 'deliverability' };
    }
    
    if (domain.includes('edu')) {
      return { type: 'education', confidence: 0.8, validation_priority: 'accuracy' };
    }
    
    if (domain.includes('gov') || domain.includes('.mil')) {
      return { type: 'government', confidence: 0.95, validation_priority: 'accuracy' };
    }
    
    if (localPart.includes('noreply') || localPart.includes('donotreply')) {
      return { type: 'system', confidence: 0.7, validation_priority: 'basic' };
    }
    
    if (localPart.length < 3 || localPart.includes('+')) {
      return { type: 'suspicious', confidence: 0.6, validation_priority: 'thorough' };
    }

    return { type: 'business', confidence: 0.8, validation_priority: 'standard' };
  }

  /**
   * Validate single email with optimal service
   * @param {string} email - Email to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  async validateEmail(email, options = {}) {
    // Check validation history first
    const historyKey = email.toLowerCase();
    if (this.validationHistory.has(historyKey) && !options.forceRevalidate) {
      const cached = this.validationHistory.get(historyKey);
      if (Date.now() - cached.timestamp < (options.cacheTime || 24 * 60 * 60 * 1000)) {
        return { ...cached.result, cached: true };
      }
    }

    // Select optimal service
    const selectedService = options.service || await this.selectOptimalService(email, options);
    
    let result;
    try {
      result = await this.callValidationService(selectedService, email, options);
      result.service = selectedService;
      result.timestamp = Date.now();
      
      // Cache the result
      this.validationHistory.set(historyKey, {
        result: result,
        timestamp: result.timestamp
      });
      
    } catch (error) {
      console.error(`Validation failed with ${selectedService}:`, error);
      
      // Try fallback service
      const fallbackService = this.getFallbackService(selectedService);
      if (fallbackService) {
        try {
          result = await this.callValidationService(fallbackService, email, options);
          result.service = fallbackService;
          result.fallback = true;
        } catch (fallbackError) {
          console.error(`Fallback validation also failed:`, fallbackError);
          return this.getErrorResult(email, 'service_unavailable');
        }
      } else {
        return this.getErrorResult(email, 'all_services_failed');
      }
    }

    return result;
  }

  /**
   * Batch validation with smart service distribution
   * @param {Array} emails - Emails to validate
   * @param {Object} options - Batch options
   * @returns {Array} Validation results
   */
  async batchValidate(emails, options = {}) {
    const batchSize = options.batchSize || 100;
    const results = [];
    
    // Group emails by optimal service
    const serviceGroups = new Map();
    
    for (const email of emails) {
      const service = await this.selectOptimalService(email, options);
      if (!serviceGroups.has(service)) {
        serviceGroups.set(service, []);
      }
      serviceGroups.get(service).push(email);
    }

    // Process each service group
    for (const [service, serviceEmails] of serviceGroups) {
      console.log(`📊 Processing ${serviceEmails.length} emails with ${service}`);
      
      // Process in batches to respect rate limits
      for (let i = 0; i < serviceEmails.length; i += batchSize) {
        const batch = serviceEmails.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(email => this.validateEmail(email, { ...options, service }))
        );
        results.push(...batchResults);
        
        // Rate limiting delay
        if (i + batchSize < serviceEmails.length) {
          await this.delay(this.services[service].limits.requestsPerSecond * 100);
        }
      }
    }

    return results;
  }

  /**
   * Call specific validation service
   * @param {string} service - Service name
   * @param {string} email - Email to validate
   * @param {Object} options - Options
   * @returns {Object} Raw validation result
   */
  async callValidationService(service, email, options = {}) {
    const serviceConfig = this.services[service];
    if (!serviceConfig.apiKey) {
      throw new Error(`Missing API key for ${service}`);
    }

    switch (service) {
      case 'neverbounce':
        return await this.callNeverBounce(email, options);
      case 'briteverify':
        return await this.callBriteVerify(email, options);
      case 'freshaddress':
        return await this.callFreshAddress(email, options);
      default:
        throw new Error(`Unsupported service: ${service}`);
    }
  }

  /**
   * NeverBounce API integration
   */
  async callNeverBounce(email, options = {}) {
    const config = this.services.neverbounce;
    const url = `${config.baseUrl}/single/check`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: config.apiKey,
        email: email,
        address_info: 1,
        credits_info: 1,
        timeout: options.timeout || 15
      })
    });

    if (!response.ok) {
      throw new Error(`NeverBounce API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      email: email,
      status: this.normalizeStatus(data.result, 'neverbounce'),
      deliverability: this.mapDeliverability(data.result),
      flags: data.flags || [],
      suggested_correction: data.suggested_correction,
      quality_score: this.calculateQualityScore(data.result),
      raw_response: data,
      cost: config.costPerValidation
    };
  }

  /**
   * BriteVerify API integration
   */
  async callBriteVerify(email, options = {}) {
    const config = this.services.briteverify;
    const url = `${config.baseUrl}/emails.json?address=${encodeURIComponent(email)}&apikey=${config.apiKey}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`BriteVerify API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      email: email,
      status: this.normalizeStatus(data.status, 'briteverify'),
      deliverability: this.mapDeliverability(data.status),
      flags: this.extractBriteVerifyFlags(data),
      suggested_correction: null, // BriteVerify doesn't provide corrections
      quality_score: this.calculateQualityScore(data.status),
      raw_response: data,
      cost: config.costPerValidation
    };
  }

  /**
   * FreshAddress API integration
   */
  async callFreshAddress(email, options = {}) {
    const config = this.services.freshaddress;
    const url = `${config.baseUrl}/email/verify`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        email: email,
        options: {
          timeout: options.timeout || 30,
          verify_syntax: true,
          verify_domain: true,
          verify_mailbox: true
        }
      })
    });

    if (!response.ok) {
      throw new Error(`FreshAddress API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      email: email,
      status: this.normalizeStatus(data.status, 'freshaddress'),
      deliverability: data.deliverability,
      flags: this.extractFreshAddressFlags(data),
      suggested_correction: data.suggested_correction,
      quality_score: data.quality_score || this.calculateQualityScore(data.status),
      raw_response: data,
      cost: config.costPerValidation
    };
  }

  // Helper methods
  normalizeStatus(status, service) {
    const statusMap = {
      neverbounce: {
        'valid': 'valid',
        'invalid': 'invalid',
        'disposable': 'risky',
        'catchall': 'risky',
        'unknown': 'unknown'
      },
      briteverify: {
        'valid': 'valid',
        'invalid': 'invalid',
        'accept_all': 'risky',
        'unknown': 'unknown'
      },
      freshaddress: {
        'valid': 'valid',
        'invalid': 'invalid',
        'risky': 'risky',
        'unknown': 'unknown'
      }
    };
    
    return statusMap[service]?.[status] || 'unknown';
  }

  mapDeliverability(status) {
    switch (status) {
      case 'valid': return 'deliverable';
      case 'invalid': return 'undeliverable';
      case 'risky': case 'catchall': case 'disposable': return 'risky';
      default: return 'unknown';
    }
  }

  calculateQualityScore(status) {
    switch (status) {
      case 'valid': return 95;
      case 'risky': case 'catchall': return 60;
      case 'disposable': return 40;
      case 'invalid': return 10;
      default: return 50;
    }
  }

  extractBriteVerifyFlags(data) {
    const flags = [];
    if (data.disposable) flags.push('disposable');
    if (data.role_address) flags.push('role_account');
    return flags;
  }

  extractFreshAddressFlags(data) {
    const flags = [];
    if (data.is_disposable) flags.push('disposable');
    if (data.is_role_account) flags.push('role_account');
    return flags;
  }

  fallbackServiceSelection(emailPattern, requirements) {
    // Rule-based fallback logic
    if (requirements.priority === 'cost') return 'freshaddress';
    if (requirements.priority === 'speed') return 'briteverify';
    return 'neverbounce'; // Default to most accurate
  }

  getFallbackService(primaryService) {
    const fallbacks = {
      neverbounce: 'briteverify',
      briteverify: 'freshaddress',
      freshaddress: 'neverbounce'
    };
    return fallbacks[primaryService];
  }

  async updateServiceHealthStatus() {
    // Implementation would check service health endpoints
    // For now, assume all services are healthy
    for (const serviceName of Object.keys(this.services)) {
      this.serviceHealthStatus.set(serviceName, {
        status: 'healthy',
        responseTime: this.services[serviceName].avgResponseTime,
        lastCheck: Date.now()
      });
    }
  }

  isServiceHealthy(service) {
    const health = this.serviceHealthStatus.get(service);
    return health && health.status === 'healthy';
  }

  getErrorResult(email, errorType) {
    return {
      email: email,
      status: 'error',
      deliverability: 'unknown',
      flags: [],
      suggested_correction: null,
      quality_score: 0,
      error: errorType,
      timestamp: Date.now()
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = EnhancedValidationService;