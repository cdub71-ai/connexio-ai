/**
 * Advanced Email Validation Service
 * Phase 2: Integration with NeverBounce, BriteVerify, and FreshAddress
 * AI-powered validation routing and cost optimization
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');

class AdvancedEmailValidationService {
  constructor(options = {}) {
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Provider configurations
    this.providers = {
      neverbounce: {
        apiKey: process.env.NEVERBOUNCE_API_KEY,
        baseUrl: 'https://api.neverbounce.com/v4',
        costPerValidation: 0.008,
        accuracy: 0.99,
        strengths: ['comprehensive', 'high_accuracy', 'enterprise']
      },
      briteverify: {
        apiKey: process.env.BRITEVERIFY_API_KEY,
        baseUrl: 'https://bpi.briteverify.com',
        costPerValidation: 0.01,
        accuracy: 0.96,
        strengths: ['fast_processing', 'good_coverage', 'reliable']
      },
      freshaddress: {
        apiKey: process.env.FRESHADDRESS_API_KEY,
        baseUrl: 'https://api.freshaddress.com/v1',
        costPerValidation: 0.005,
        accuracy: 0.94,
        strengths: ['cost_effective', 'good_basic', 'quick_results']
      }
    };

    this.config = {
      defaultProvider: options.defaultProvider || 'neverbounce',
      fallbackEnabled: options.fallbackEnabled !== false,
      costOptimization: options.costOptimization !== false,
      batchSize: options.batchSize || 1000,
      retryAttempts: options.retryAttempts || 3
    };

    // Validation cache and metrics
    this.validationCache = new Map();
    this.providerMetrics = {
      neverbounce: { requests: 0, success: 0, failures: 0, avgResponseTime: 0, totalCost: 0 },
      briteverify: { requests: 0, success: 0, failures: 0, avgResponseTime: 0, totalCost: 0 },
      freshaddress: { requests: 0, success: 0, failures: 0, avgResponseTime: 0, totalCost: 0 }
    };

    console.log('🔍 Advanced Email Validation Service initialized');
  }

  /**
   * Validate email with AI-powered provider selection
   * @param {string} email - Email address to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  async validateEmail(email, options = {}) {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = email.toLowerCase();
    if (this.validationCache.has(cacheKey)) {
      const cached = this.validationCache.get(cacheKey);
      // Return cached if less than 24 hours old
      if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
        return { ...cached.result, fromCache: true };
      }
    }

    try {
      // AI-powered provider selection
      const selectedProvider = await this.selectOptimalProvider(email, options);
      
      console.log(`🔍 Validating ${email} with ${selectedProvider}`);

      let result;
      switch (selectedProvider) {
        case 'neverbounce':
          result = await this.validateWithNeverBounce(email);
          break;
        case 'briteverify':
          result = await this.validateWithBriteVerify(email);
          break;
        case 'freshaddress':
          result = await this.validateWithFreshAddress(email);
          break;
        default:
          throw new Error(`Unsupported provider: ${selectedProvider}`);
      }

      // Enhance result with AI insights
      const enhancedResult = await this.enhanceValidationResult(email, result, selectedProvider);

      // Update metrics
      this.updateProviderMetrics(selectedProvider, Date.now() - startTime, true);

      // Cache result
      this.validationCache.set(cacheKey, {
        result: enhancedResult,
        timestamp: Date.now()
      });

      return enhancedResult;

    } catch (error) {
      console.error(`Email validation failed for ${email}:`, error);
      
      // Try fallback provider if enabled
      if (this.config.fallbackEnabled && options.provider !== 'fallback') {
        console.log('🔄 Attempting fallback validation...');
        const fallbackProvider = this.getFallbackProvider(options.provider);
        return await this.validateEmail(email, { ...options, provider: fallbackProvider, fallback: true });
      }

      return {
        email: email,
        isValid: false,
        status: 'error',
        error: error.message,
        provider: options.provider || this.config.defaultProvider,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Batch validate emails with intelligent distribution
   * @param {Array} emails - Array of email addresses
   * @param {Object} options - Batch options
   * @returns {Array} Validation results
   */
  async batchValidateEmails(emails, options = {}) {
    const startTime = Date.now();
    const uniqueEmails = [...new Set(emails.filter(e => e))];
    
    console.log(`📧 Batch validating ${uniqueEmails.length} emails...`);

    // AI-powered batch optimization
    const batchStrategy = await this.optimizeBatchStrategy(uniqueEmails, options);
    
    const results = [];
    const providerBatches = this.distributeEmailsByProvider(uniqueEmails, batchStrategy);

    // Process batches in parallel by provider
    const batchPromises = Object.entries(providerBatches).map(async ([provider, emailBatch]) => {
      if (emailBatch.length === 0) return [];
      
      console.log(`🔍 Processing ${emailBatch.length} emails with ${provider}...`);
      
      const batchResults = [];
      for (let i = 0; i < emailBatch.length; i += this.config.batchSize) {
        const chunk = emailBatch.slice(i, i + this.config.batchSize);
        
        try {
          const chunkResults = await this.processBatchChunk(chunk, provider);
          batchResults.push(...chunkResults);
        } catch (error) {
          console.error(`Batch chunk failed for ${provider}:`, error);
          // Add error results for failed chunk
          chunk.forEach(email => {
            batchResults.push({
              email,
              isValid: false,
              status: 'error',
              error: error.message,
              provider
            });
          });
        }
        
        // Rate limiting between chunks
        if (i + this.config.batchSize < emailBatch.length) {
          await this.delay(1000);
        }
      }
      
      return batchResults;
    });

    const allResults = await Promise.all(batchPromises);
    results.push(...allResults.flat());

    // Generate batch insights
    const insights = await this.generateBatchInsights(results, Date.now() - startTime);

    console.log(`✅ Batch validation complete: ${results.filter(r => r.isValid).length}/${results.length} valid`);

    return {
      results: results,
      insights: insights,
      totalProcessed: results.length,
      validEmails: results.filter(r => r.isValid).length,
      processingTime: Date.now() - startTime,
      costBreakdown: this.calculateBatchCost(results)
    };
  }

  /**
   * AI-powered provider selection
   * @param {string} email - Email to validate
   * @param {Object} options - Selection options
   * @returns {string} Selected provider
   */
  async selectOptimalProvider(email, options = {}) {
    if (options.provider) return options.provider;

    const prompt = `As a marketing operations expert, select the optimal email validation provider for this email:

**Email:** ${email}
**Domain:** ${email.split('@')[1]}

**Available Providers:**
1. **NeverBounce** - Cost: $0.008, Accuracy: 99%, Best for: comprehensive validation, enterprise
2. **BriteVerify** - Cost: $0.010, Accuracy: 96%, Best for: fast processing, reliable results  
3. **FreshAddress** - Cost: $0.005, Accuracy: 94%, Best for: cost-effective, basic validation

**Provider Performance:**
${JSON.stringify(this.getProviderPerformanceStats(), null, 2)}

**Selection Criteria:**
- Email domain reputation and complexity
- Cost optimization requirements
- Accuracy needs based on use case
- Provider current performance and reliability

**Context:**
- Use Case: ${options.useCase || 'general'}
- Priority: ${options.priority || 'balanced'}
- Budget Consideration: ${options.budgetSensitive ? 'high' : 'moderate'}

**Respond with:**
{
  "selectedProvider": "provider_name",
  "reasoning": "detailed explanation",
  "confidence": number (1-100),
  "alternativeProvider": "backup_option"
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      const selection = JSON.parse(response.content[0].text);
      console.log(`🧠 AI selected ${selection.selectedProvider} for ${email}: ${selection.reasoning}`);
      
      return selection.selectedProvider;
    } catch (error) {
      console.error('AI provider selection failed:', error);
      return this.config.defaultProvider;
    }
  }

  /**
   * Validate with NeverBounce
   */
  async validateWithNeverBounce(email) {
    const config = this.providers.neverbounce;
    
    const response = await axios.get(`${config.baseUrl}/single/check`, {
      params: {
        key: config.apiKey,
        email: email
      }
    });

    const data = response.data;
    return {
      email: email,
      isValid: data.result === 'valid',
      status: data.result,
      subStatus: data.flags?.join(', ') || '',
      confidence: data.result === 'valid' ? 99 : (data.result === 'invalid' ? 1 : 50),
      provider: 'neverbounce',
      providerResponse: data,
      timestamp: new Date().toISOString(),
      cost: config.costPerValidation
    };
  }

  /**
   * Validate with BriteVerify
   */
  async validateWithBriteVerify(email) {
    const config = this.providers.briteverify;
    
    const response = await axios.get(`${config.baseUrl}/emails.json`, {
      params: {
        address: email,
        apikey: config.apiKey
      }
    });

    const data = response.data;
    return {
      email: email,
      isValid: data.status === 'valid',
      status: data.status,
      subStatus: data.error || '',
      confidence: data.status === 'valid' ? 96 : (data.status === 'invalid' ? 1 : 50),
      isDisposable: data.disposable || false,
      isRoleAccount: data.role_address || false,
      provider: 'briteverify',
      providerResponse: data,
      timestamp: new Date().toISOString(),
      cost: config.costPerValidation
    };
  }

  /**
   * Validate with FreshAddress
   */
  async validateWithFreshAddress(email) {
    const config = this.providers.freshaddress;
    
    const response = await axios.post(`${config.baseUrl}/email/verify`, {
      email: email,
      timeout: 30
    }, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = response.data;
    return {
      email: email,
      isValid: data.status === 'valid',
      status: data.status,
      subStatus: data.sub_status || '',
      confidence: data.quality_score || 50,
      isDisposable: data.is_disposable || false,
      isRoleAccount: data.is_role_account || false,
      suggestedCorrection: data.suggested_correction,
      provider: 'freshaddress',
      providerResponse: data,
      timestamp: new Date().toISOString(),
      cost: config.costPerValidation
    };
  }

  /**
   * Enhance validation result with AI insights
   */
  async enhanceValidationResult(email, result, provider) {
    const prompt = `Analyze this email validation result and provide enhanced insights:

**Email:** ${email}
**Provider:** ${provider}
**Result:** ${JSON.stringify(result, null, 2)}

**Analysis Required:**
1. Risk assessment for email deliverability
2. Recommendation for email marketing use
3. Data quality score and confidence level
4. Specific concerns or red flags
5. Suggested actions based on validation result

**Respond with:**
{
  "riskLevel": "low|medium|high",
  "marketingRecommendation": "use|caution|avoid",
  "dataQualityScore": number (1-100),
  "concerns": ["concern1", "concern2"],
  "suggestedActions": ["action1", "action2"],
  "deliverabilityInsights": "detailed analysis"
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 600,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      });

      const insights = JSON.parse(response.content[0].text);
      
      return {
        ...result,
        aiInsights: insights,
        enhancedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('AI enhancement failed:', error);
      return result;
    }
  }

  /**
   * Process batch chunk with specific provider
   */
  async processBatchChunk(emails, provider) {
    const results = [];
    
    // For demo purposes, process individually
    // In production, use provider-specific batch APIs
    for (const email of emails) {
      try {
        const result = await this.validateEmail(email, { provider });
        results.push(result);
      } catch (error) {
        results.push({
          email,
          isValid: false,
          status: 'error',
          error: error.message,
          provider
        });
      }
    }
    
    return results;
  }

  /**
   * Generate comprehensive batch insights
   */
  async generateBatchInsights(results, processingTime) {
    const totalEmails = results.length;
    const validEmails = results.filter(r => r.isValid).length;
    const invalidEmails = results.filter(r => !r.isValid).length;
    const errorCount = results.filter(r => r.status === 'error').length;

    const providerUsage = {};
    results.forEach(r => {
      providerUsage[r.provider] = (providerUsage[r.provider] || 0) + 1;
    });

    return {
      summary: {
        totalProcessed: totalEmails,
        validEmails,
        invalidEmails,
        errorCount,
        validationRate: totalEmails > 0 ? (validEmails / totalEmails * 100) : 0,
        processingTimeMs: processingTime
      },
      providerDistribution: providerUsage,
      qualityAnalysis: {
        highQuality: results.filter(r => r.confidence > 90).length,
        mediumQuality: results.filter(r => r.confidence >= 70 && r.confidence <= 90).length,
        lowQuality: results.filter(r => r.confidence < 70).length
      },
      costAnalysis: this.calculateBatchCost(results),
      recommendations: this.generateBatchRecommendations(results)
    };
  }

  /**
   * Get service health and metrics
   */
  getServiceHealth() {
    return {
      service: 'AdvancedEmailValidationService',
      status: 'healthy',
      providers: {
        neverbounce: {
          configured: !!this.providers.neverbounce.apiKey,
          metrics: this.providerMetrics.neverbounce
        },
        briteverify: {
          configured: !!this.providers.briteverify.apiKey,
          metrics: this.providerMetrics.briteverify
        },
        freshaddress: {
          configured: !!this.providers.freshaddress.apiKey,
          metrics: this.providerMetrics.freshaddress
        }
      },
      cacheSize: this.validationCache.size,
      capabilities: [
        'ai_provider_selection',
        'batch_validation',
        'cost_optimization',
        'enhanced_insights',
        'fallback_support'
      ]
    };
  }

  // Utility methods
  distributeEmailsByProvider(emails, strategy) {
    const distribution = {
      neverbounce: [],
      briteverify: [],
      freshaddress: []
    };

    emails.forEach(email => {
      const provider = strategy[email] || this.config.defaultProvider;
      distribution[provider].push(email);
    });

    return distribution;
  }

  async optimizeBatchStrategy(emails, options) {
    const strategy = {};
    
    // Simple strategy for demo - in production would use AI
    emails.forEach(email => {
      const domain = email.split('@')[1];
      
      if (domain.includes('gmail') || domain.includes('yahoo') || domain.includes('hotmail')) {
        strategy[email] = 'freshaddress'; // Cost effective for common domains
      } else if (domain.includes('enterprise') || domain.includes('corp')) {
        strategy[email] = 'neverbounce'; // High accuracy for business emails
      } else {
        strategy[email] = 'briteverify'; // Balanced approach
      }
    });
    
    return strategy;
  }

  calculateBatchCost(results) {
    const costByProvider = {};
    let totalCost = 0;

    results.forEach(result => {
      const provider = result.provider;
      const cost = result.cost || 0;
      
      costByProvider[provider] = (costByProvider[provider] || 0) + cost;
      totalCost += cost;
    });

    return {
      totalCost: totalCost,
      costByProvider: costByProvider,
      averageCostPerEmail: results.length > 0 ? totalCost / results.length : 0
    };
  }

  generateBatchRecommendations(results) {
    const recommendations = [];
    
    const validationRate = results.filter(r => r.isValid).length / results.length;
    if (validationRate < 0.7) {
      recommendations.push('List quality is below average - consider list hygiene practices');
    }
    
    const errorRate = results.filter(r => r.status === 'error').length / results.length;
    if (errorRate > 0.05) {
      recommendations.push('High error rate detected - check email formats and provider connectivity');
    }

    return recommendations;
  }

  updateProviderMetrics(provider, responseTime, success) {
    const metrics = this.providerMetrics[provider];
    metrics.requests++;
    
    if (success) {
      metrics.success++;
    } else {
      metrics.failures++;
    }

    // Update average response time
    metrics.avgResponseTime = 
      ((metrics.avgResponseTime * (metrics.requests - 1)) + responseTime) / metrics.requests;
  }

  getProviderPerformanceStats() {
    const stats = {};
    Object.entries(this.providerMetrics).forEach(([provider, metrics]) => {
      stats[provider] = {
        successRate: metrics.requests > 0 ? (metrics.success / metrics.requests * 100) : 0,
        avgResponseTime: metrics.avgResponseTime,
        totalRequests: metrics.requests
      };
    });
    return stats;
  }

  getFallbackProvider(currentProvider) {
    const fallbackOrder = ['neverbounce', 'briteverify', 'freshaddress'];
    const currentIndex = fallbackOrder.indexOf(currentProvider);
    return fallbackOrder[(currentIndex + 1) % fallbackOrder.length];
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AdvancedEmailValidationService;