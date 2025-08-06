/**
 * Multi-Provider SMS Service
 * Phase 2: Support for Twilio, Vonage, and MessageBird
 * AI-powered provider selection and load balancing
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');
const TwilioSmsService = require('./twilio-sms-service');
const axios = require('axios');

class MultiProviderSMSService {
  constructor(options = {}) {
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Initialize provider clients
    this.providers = {
      twilio: {
        service: new TwilioSmsService(),
        config: {
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          authToken: process.env.TWILIO_AUTH_TOKEN,
          fromNumber: process.env.TWILIO_FROM_NUMBER
        },
        pricing: { costPerSMS: 0.0075, costPerMMS: 0.02 },
        strengths: ['reliable', 'comprehensive_api', 'good_delivery_rates'],
        coverage: ['US', 'CA', 'UK', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE']
      },
      vonage: {
        config: {
          apiKey: process.env.VONAGE_API_KEY,
          apiSecret: process.env.VONAGE_API_SECRET,
          fromNumber: process.env.VONAGE_FROM_NUMBER
        },
        pricing: { costPerSMS: 0.0072, costPerMMS: 0.015 },
        strengths: ['cost_effective', 'global_coverage', 'high_throughput'],
        coverage: ['US', 'CA', 'UK', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'IN', 'BR', 'MX']
      },
      messagebird: {
        config: {
          apiKey: process.env.MESSAGEBIRD_API_KEY,
          fromNumber: process.env.MESSAGEBIRD_FROM_NUMBER
        },
        pricing: { costPerSMS: 0.008, costPerMMS: 0.018 },
        strengths: ['european_coverage', 'omnichannel', 'developer_friendly'],
        coverage: ['US', 'CA', 'UK', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI']
      }
    };

    this.config = {
      defaultProvider: options.defaultProvider || 'twilio',
      loadBalancingEnabled: options.loadBalancing !== false,
      failoverEnabled: options.failover !== false,
      costOptimization: options.costOptimization !== false,
      maxRetryAttempts: options.maxRetryAttempts || 3
    };

    // Provider metrics and health monitoring
    this.providerMetrics = {
      twilio: { sent: 0, failed: 0, totalCost: 0, avgResponseTime: 0, healthScore: 100 },
      vonage: { sent: 0, failed: 0, totalCost: 0, avgResponseTime: 0, healthScore: 100 },
      messagebird: { sent: 0, failed: 0, totalCost: 0, avgResponseTime: 0, healthScore: 100 }
    };

    this.activeCampaigns = new Map();
    this.loadBalancer = new SMSLoadBalancer(this.providers, this.providerMetrics);

    console.log('📱 Multi-Provider SMS Service initialized with providers:', Object.keys(this.providers));
  }

  /**
   * Execute SMS campaign with intelligent provider selection
   * @param {Object} campaign - Campaign configuration
   * @param {Array} recipients - Recipients array
   * @param {Object} options - Execution options
   * @returns {Object} Campaign results
   */
  async executeSMSCampaign(campaign, recipients, options = {}) {
    const campaignId = this.generateCampaignId();
    const startTime = Date.now();

    console.log(`📱 Starting multi-provider SMS campaign ${campaignId}: ${campaign.name}`);

    const campaignData = {
      id: campaignId,
      name: campaign.name,
      status: 'running',
      startTime: startTime,
      recipients: recipients,
      totalRecipients: recipients.length,
      providerDistribution: {},
      results: {
        sent: 0,
        failed: 0,
        delivered: 0,
        providerResults: {}
      },
      errors: []
    };

    this.activeCampaigns.set(campaignId, campaignData);

    try {
      // Step 1: Optimize message for multi-provider compatibility
      console.log('🧠 Optimizing message for multi-provider delivery...');
      const optimizedContent = await this.optimizeMultiProviderMessage(campaign.message, {
        providers: Object.keys(this.providers),
        audience: campaign.audience,
        campaignType: campaign.type
      });

      // Step 2: AI-powered provider selection and load balancing
      console.log('⚖️ Analyzing optimal provider distribution...');
      const providerStrategy = await this.planProviderDistribution(recipients, {
        campaign: campaign,
        costOptimization: this.config.costOptimization,
        performanceOptimization: options.performanceOptimization,
        geographicOptimization: options.geographicOptimization
      });

      campaignData.providerDistribution = providerStrategy.distribution;
      campaignData.optimizedContent = optimizedContent;

      // Step 3: Execute campaign across providers
      const executionResults = await this.executeMultiProviderCampaign(
        campaignId,
        recipients,
        optimizedContent,
        providerStrategy
      );

      // Step 4: Aggregate results and generate insights
      const aggregatedResults = this.aggregateProviderResults(executionResults);
      const insights = await this.generateMultiProviderInsights(campaignData, aggregatedResults);

      campaignData.status = 'completed';
      campaignData.endTime = Date.now();
      campaignData.totalExecutionTime = campaignData.endTime - campaignData.startTime;
      campaignData.results = aggregatedResults;
      campaignData.insights = insights;

      console.log(`🎉 Multi-provider SMS campaign completed: ${aggregatedResults.sent}/${campaignData.totalRecipients} sent`);

      return {
        campaignId: campaignId,
        status: 'completed',
        totalRecipients: campaignData.totalRecipients,
        sent: aggregatedResults.sent,
        failed: aggregatedResults.failed,
        providerDistribution: campaignData.providerDistribution,
        executionTime: campaignData.totalExecutionTime,
        insights: insights,
        costBreakdown: aggregatedResults.costBreakdown
      };

    } catch (error) {
      console.error(`❌ Multi-provider SMS campaign failed:`, error);
      
      campaignData.status = 'failed';
      campaignData.error = error.message;
      campaignData.endTime = Date.now();
      
      throw new Error(`Multi-provider SMS campaign execution failed: ${error.message}`);
    }
  }

  /**
   * Plan provider distribution using AI optimization
   * @param {Array} recipients - Campaign recipients
   * @param {Object} options - Distribution options
   * @returns {Object} Provider strategy
   */
  async planProviderDistribution(recipients, options = {}) {
    const prompt = `As a marketing operations expert, create an optimal SMS provider distribution strategy:

**Campaign Details:**
- Recipients: ${recipients.length}
- Campaign Type: ${options.campaign?.type || 'promotional'}
- Cost Optimization: ${options.costOptimization ? 'enabled' : 'disabled'}
- Performance Focus: ${options.performanceOptimization ? 'enabled' : 'disabled'}

**Available Providers:**
${Object.entries(this.providers).map(([name, config]) => `
- **${name.toUpperCase()}**:
  - Cost per SMS: $${config.pricing.costPerSMS}
  - Strengths: ${config.strengths.join(', ')}
  - Coverage: ${config.coverage.join(', ')}
  - Current Health Score: ${this.providerMetrics[name].healthScore}%
  - Recent Success Rate: ${this.calculateSuccessRate(name)}%
`).join('')}

**Recipient Geographic Distribution:**
${this.analyzeRecipientGeography(recipients)}

**Optimization Criteria:**
1. Cost efficiency while maintaining quality
2. Provider reliability and health scores
3. Geographic coverage optimization
4. Load balancing for performance
5. Fallback strategy for resilience

**Respond with:**
{
  "distribution": {
    "twilio": percentage,
    "vonage": percentage, 
    "messagebird": percentage
  },
  "primaryProvider": "provider_name",
  "fallbackOrder": ["provider1", "provider2"],
  "costEstimate": {
    "totalCost": number,
    "costPerMessage": number
  },
  "reasoning": "detailed explanation of distribution strategy"
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      const strategy = JSON.parse(response.content[0].text);
      
      // Validate and normalize distribution
      const totalPercentage = Object.values(strategy.distribution).reduce((a, b) => a + b, 0);
      if (Math.abs(totalPercentage - 100) > 1) {
        // Normalize if needed
        Object.keys(strategy.distribution).forEach(provider => {
          strategy.distribution[provider] = strategy.distribution[provider] / totalPercentage * 100;
        });
      }

      console.log(`🧠 AI provider distribution: ${JSON.stringify(strategy.distribution)}`);
      return strategy;

    } catch (error) {
      console.error('AI provider distribution failed:', error);
      
      // Fallback to simple distribution
      return {
        distribution: { twilio: 100, vonage: 0, messagebird: 0 },
        primaryProvider: 'twilio',
        fallbackOrder: ['vonage', 'messagebird'],
        reasoning: 'Using fallback distribution due to AI failure'
      };
    }
  }

  /**
   * Execute campaign across multiple providers
   * @param {string} campaignId - Campaign ID
   * @param {Array} recipients - Recipients
   * @param {Object} content - Optimized content
   * @param {Object} strategy - Provider strategy
   * @returns {Array} Execution results
   */
  async executeMultiProviderCampaign(campaignId, recipients, content, strategy) {
    const providerBatches = this.distributeRecipientsByStrategy(recipients, strategy.distribution);
    const executionResults = [];

    // Execute campaigns in parallel across providers
    const providerPromises = Object.entries(providerBatches).map(async ([provider, recipientBatch]) => {
      if (recipientBatch.length === 0) return { provider, results: [] };

      console.log(`📤 Sending ${recipientBatch.length} SMS via ${provider}...`);

      try {
        const providerResults = await this.executeProviderCampaign(
          provider, 
          campaignId, 
          recipientBatch, 
          content
        );

        // Update provider metrics
        this.updateProviderMetrics(provider, providerResults);

        return { provider, results: providerResults };

      } catch (error) {
        console.error(`Provider ${provider} execution failed:`, error);
        
        // Attempt failover if enabled
        if (this.config.failoverEnabled && strategy.fallbackOrder) {
          const fallbackProvider = this.getNextFallbackProvider(provider, strategy.fallbackOrder);
          if (fallbackProvider) {
            console.log(`🔄 Failing over to ${fallbackProvider}...`);
            try {
              const fallbackResults = await this.executeProviderCampaign(
                fallbackProvider,
                campaignId,
                recipientBatch,
                content
              );
              return { provider: fallbackProvider, results: fallbackResults, failedOver: true };
            } catch (fallbackError) {
              console.error(`Failover to ${fallbackProvider} also failed:`, fallbackError);
            }
          }
        }

        // Return error results for failed batch
        return {
          provider,
          results: recipientBatch.map(recipient => ({
            recipient,
            status: 'failed',
            error: error.message,
            timestamp: new Date().toISOString()
          })),
          error: error.message
        };
      }
    });

    const allResults = await Promise.all(providerPromises);
    return allResults;
  }

  /**
   * Execute campaign with specific provider
   * @param {string} provider - Provider name
   * @param {string} campaignId - Campaign ID
   * @param {Array} recipients - Recipients for this provider
   * @param {Object} content - Message content
   * @returns {Array} Provider results
   */
  async executeProviderCampaign(provider, campaignId, recipients, content) {
    const startTime = Date.now();
    
    switch (provider) {
      case 'twilio':
        return await this.executeTwilioCampaign(campaignId, recipients, content);
      case 'vonage':
        return await this.executeVonageCampaign(campaignId, recipients, content);
      case 'messagebird':
        return await this.executeMessageBirdCampaign(campaignId, recipients, content);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Execute campaign with Twilio
   */
  async executeTwilioCampaign(campaignId, recipients, content) {
    const campaign = {
      name: `Multi-Provider Campaign ${campaignId}`,
      message: content.optimizedText,
      fromNumber: this.providers.twilio.config.fromNumber,
      audience: recipients.map(r => ({ phoneNumber: r.phone, ...r }))
    };

    const result = await this.providers.twilio.service.sendBulkSms(campaign);
    
    return recipients.map((recipient, index) => ({
      recipient,
      provider: 'twilio',
      status: result.success ? 'sent' : 'failed',
      messageId: result.campaignId ? `${result.campaignId}_${index}` : null,
      cost: this.providers.twilio.pricing.costPerSMS,
      timestamp: new Date().toISOString()
    }));
  }

  /**
   * Execute campaign with Vonage
   */
  async executeVonageCampaign(campaignId, recipients, content) {
    const config = this.providers.vonage.config;
    const results = [];

    for (const recipient of recipients) {
      try {
        const response = await axios.post('https://rest.nexmo.com/sms/json', {
          api_key: config.apiKey,
          api_secret: config.apiSecret,
          from: config.fromNumber,
          to: recipient.phone,
          text: content.optimizedText
        });

        const data = response.data;
        const message = data.messages[0];

        results.push({
          recipient,
          provider: 'vonage',
          status: message.status === '0' ? 'sent' : 'failed',
          messageId: message['message-id'],
          cost: this.providers.vonage.pricing.costPerSMS,
          error: message['error-text'],
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        results.push({
          recipient,
          provider: 'vonage',
          status: 'failed',
          error: error.message,
          cost: 0,
          timestamp: new Date().toISOString()
        });
      }

      // Rate limiting
      await this.delay(100);
    }

    return results;
  }

  /**
   * Execute campaign with MessageBird
   */
  async executeMessageBirdCampaign(campaignId, recipients, content) {
    const config = this.providers.messagebird.config;
    const results = [];

    for (const recipient of recipients) {
      try {
        const response = await axios.post('https://rest.messagebird.com/messages', {
          recipients: [recipient.phone],
          originator: config.fromNumber,
          body: content.optimizedText
        }, {
          headers: {
            'Authorization': `AccessKey ${config.apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        const data = response.data;

        results.push({
          recipient,
          provider: 'messagebird',
          status: 'sent',
          messageId: data.id,
          cost: this.providers.messagebird.pricing.costPerSMS,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        results.push({
          recipient,
          provider: 'messagebird',
          status: 'failed',
          error: error.response?.data?.errors?.[0]?.description || error.message,
          cost: 0,
          timestamp: new Date().toISOString()
        });
      }

      // Rate limiting
      await this.delay(150);
    }

    return results;
  }

  /**
   * Optimize message for multi-provider compatibility
   */
  async optimizeMultiProviderMessage(message, options) {
    const prompt = `Optimize this SMS message for multi-provider delivery across Twilio, Vonage, and MessageBird:

**Original Message:** "${message}"

**Target Providers:** ${options.providers.join(', ')}

**Optimization Requirements:**
1. Ensure compatibility across all providers
2. Optimize for deliverability and engagement  
3. Handle character encoding issues
4. Optimize for different regional regulations
5. Maintain message intent and clarity

**Provider-Specific Considerations:**
- Twilio: Strong US/CA coverage, good emoji support
- Vonage: Global coverage, may have encoding limitations
- MessageBird: European focus, strict content filtering

**Response Format:**
{
  "optimizedText": "optimized message",
  "characterCount": number,
  "encodingNotes": ["note1", "note2"],
  "providerCompatibility": {
    "twilio": "compatible|warning|incompatible",
    "vonage": "compatible|warning|incompatible", 
    "messagebird": "compatible|warning|incompatible"
  },
  "improvements": ["improvement1", "improvement2"],
  "warnings": ["warning1", "warning2"]
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 600,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('Multi-provider message optimization failed:', error);
      return {
        optimizedText: message,
        characterCount: message.length,
        encodingNotes: [],
        providerCompatibility: {
          twilio: 'compatible',
          vonage: 'compatible',
          messagebird: 'compatible'
        },
        improvements: [],
        warnings: ['Optimization failed, using original message']
      };
    }
  }

  /**
   * Generate multi-provider campaign insights
   */
  async generateMultiProviderInsights(campaignData, results) {
    const providerPerformance = {};
    
    Object.entries(results.providerResults).forEach(([provider, data]) => {
      const total = data.sent + data.failed;
      providerPerformance[provider] = {
        total: total,
        successRate: total > 0 ? (data.sent / total * 100) : 0,
        cost: data.totalCost,
        avgCostPerMessage: total > 0 ? data.totalCost / total : 0
      };
    });

    return {
      campaignSummary: {
        totalSent: results.sent,
        totalFailed: results.failed,
        overallSuccessRate: (results.sent / (results.sent + results.failed) * 100),
        totalCost: results.costBreakdown.totalCost,
        avgCostPerMessage: results.costBreakdown.avgCostPerMessage
      },
      providerPerformance,
      costEfficiency: this.analyzeCostEfficiency(results),
      recommendations: this.generateMultiProviderRecommendations(campaignData, results)
    };
  }

  /**
   * Get service health across all providers
   */
  getServiceHealth() {
    return {
      service: 'MultiProviderSMSService',
      status: 'healthy',
      providers: {
        twilio: {
          configured: !!this.providers.twilio.config.accountSid,
          healthScore: this.providerMetrics.twilio.healthScore,
          metrics: this.providerMetrics.twilio
        },
        vonage: {
          configured: !!this.providers.vonage.config.apiKey,
          healthScore: this.providerMetrics.vonage.healthScore,
          metrics: this.providerMetrics.vonage
        },
        messagebird: {
          configured: !!this.providers.messagebird.config.apiKey,
          healthScore: this.providerMetrics.messagebird.healthScore,
          metrics: this.providerMetrics.messagebird
        }
      },
      loadBalancer: this.loadBalancer.getStatus(),
      activeCampaigns: this.activeCampaigns.size,
      capabilities: [
        'multi_provider_support',
        'ai_provider_selection',
        'load_balancing',
        'failover_support',
        'cost_optimization',
        'geographic_optimization'
      ]
    };
  }

  // Utility methods
  distributeRecipientsByStrategy(recipients, distribution) {
    const batches = { twilio: [], vonage: [], messagebird: [] };
    
    recipients.forEach((recipient, index) => {
      const random = Math.random() * 100;
      let cumulative = 0;
      
      for (const [provider, percentage] of Object.entries(distribution)) {
        cumulative += percentage;
        if (random <= cumulative) {
          batches[provider].push(recipient);
          break;
        }
      }
    });
    
    return batches;
  }

  aggregateProviderResults(executionResults) {
    const aggregated = {
      sent: 0,
      failed: 0,
      providerResults: {},
      costBreakdown: { totalCost: 0, byProvider: {} }
    };

    executionResults.forEach(({ provider, results, error }) => {
      const providerData = {
        sent: 0,
        failed: 0,
        totalCost: 0,
        results: results || []
      };

      if (results) {
        results.forEach(result => {
          if (result.status === 'sent') {
            providerData.sent++;
            aggregated.sent++;
          } else {
            providerData.failed++;
            aggregated.failed++;
          }
          providerData.totalCost += result.cost || 0;
        });
      }

      aggregated.providerResults[provider] = providerData;
      aggregated.costBreakdown.byProvider[provider] = providerData.totalCost;
      aggregated.costBreakdown.totalCost += providerData.totalCost;
    });

    aggregated.costBreakdown.avgCostPerMessage = 
      (aggregated.sent + aggregated.failed) > 0 ? 
      aggregated.costBreakdown.totalCost / (aggregated.sent + aggregated.failed) : 0;

    return aggregated;
  }

  analyzeRecipientGeography(recipients) {
    const geography = {};
    recipients.forEach(recipient => {
      const country = this.extractCountryFromPhone(recipient.phone);
      geography[country] = (geography[country] || 0) + 1;
    });
    return Object.entries(geography).map(([country, count]) => `${country}: ${count}`).join(', ');
  }

  extractCountryFromPhone(phone) {
    // Simple country detection based on phone prefix
    if (phone.startsWith('+1')) return 'US/CA';
    if (phone.startsWith('+44')) return 'UK';
    if (phone.startsWith('+49')) return 'DE';
    if (phone.startsWith('+33')) return 'FR';
    return 'Other';
  }

  calculateSuccessRate(provider) {
    const metrics = this.providerMetrics[provider];
    const total = metrics.sent + metrics.failed;
    return total > 0 ? Math.round((metrics.sent / total) * 100) : 100;
  }

  updateProviderMetrics(provider, results) {
    const metrics = this.providerMetrics[provider];
    
    results.forEach(result => {
      if (result.status === 'sent') {
        metrics.sent++;
      } else {
        metrics.failed++;
      }
      metrics.totalCost += result.cost || 0;
    });

    // Update health score based on recent performance
    const successRate = this.calculateSuccessRate(provider);
    metrics.healthScore = Math.max(0, Math.min(100, successRate));
  }

  analyzeCostEfficiency(results) {
    const efficiency = {};
    
    Object.entries(results.providerResults).forEach(([provider, data]) => {
      const total = data.sent + data.failed;
      if (total > 0) {
        efficiency[provider] = {
          costPerSuccessfulMessage: data.sent > 0 ? data.totalCost / data.sent : Infinity,
          wastePercentage: data.failed > 0 ? (data.failed / total * 100) : 0
        };
      }
    });
    
    return efficiency;
  }

  generateMultiProviderRecommendations(campaignData, results) {
    const recommendations = [];
    
    // Analyze provider performance
    Object.entries(results.providerResults).forEach(([provider, data]) => {
      const total = data.sent + data.failed;
      const successRate = total > 0 ? (data.sent / total * 100) : 0;
      
      if (successRate < 90) {
        recommendations.push(`Consider reducing ${provider} allocation due to ${successRate.toFixed(1)}% success rate`);
      }
    });

    // Cost optimization recommendations
    const costRanking = Object.entries(results.costBreakdown.byProvider)
      .sort(([,a], [,b]) => b - a)
      .map(([provider]) => provider);
      
    if (costRanking.length > 1) {
      recommendations.push(`Consider increasing ${costRanking[costRanking.length - 1]} allocation for cost optimization`);
    }

    return recommendations;
  }

  getNextFallbackProvider(failedProvider, fallbackOrder) {
    const index = fallbackOrder.indexOf(failedProvider);
    return index !== -1 && index < fallbackOrder.length - 1 ? fallbackOrder[index + 1] : null;
  }

  generateCampaignId() {
    return `multi_sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * SMS Load Balancer for optimal provider distribution
 */
class SMSLoadBalancer {
  constructor(providers, metrics) {
    this.providers = providers;
    this.metrics = metrics;
  }

  getOptimalProvider(criteria = {}) {
    // Simple load balancing algorithm
    const availableProviders = Object.keys(this.providers).filter(provider => {
      return this.metrics[provider].healthScore > 70;
    });

    if (availableProviders.length === 0) {
      return Object.keys(this.providers)[0]; // Fallback to first provider
    }

    // Select provider with best health score
    return availableProviders.reduce((best, current) => {
      return this.metrics[current].healthScore > this.metrics[best].healthScore ? current : best;
    });
  }

  getStatus() {
    return {
      activeProviders: Object.keys(this.providers).filter(p => this.metrics[p].healthScore > 50).length,
      totalProviders: Object.keys(this.providers).length,
      healthyProviders: Object.keys(this.providers).filter(p => this.metrics[p].healthScore > 90).length
    };
  }
}

module.exports = MultiProviderSMSService;