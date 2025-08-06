/**
 * Twilio Messaging Configuration Service
 * Advanced sender management for phone numbers, messaging services, and short codes
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');

class TwilioMessagingConfigurator {
  constructor(twilioClient, options = {}) {
    this.twilio = twilioClient;
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.config = {
      defaultCountryCode: options.defaultCountryCode || '+1',
      enableGeographicRouting: options.enableGeographicRouting !== false,
      enableLoadBalancing: options.enableLoadBalancing !== false,
      messagingServiceFallback: options.messagingServiceFallback !== false,
      maxConcurrentMessages: options.maxConcurrentMessages || 1000
    };

    // Sender configuration storage
    this.senderConfigurations = new Map();
    this.phoneNumbers = new Map();
    this.messagingServices = new Map();
    this.shortCodes = new Map();
    
    // Performance tracking
    this.routingMetrics = {
      totalMessagesSent: 0,
      senderUtilization: {},
      geographicRouting: {},
      failoverEvents: 0
    };

    console.log('📱 Twilio Messaging Configurator initialized');
  }

  /**
   * Initialize and configure all available Twilio messaging options
   * @returns {Object} Configuration summary
   */
  async initializeMessagingConfiguration() {
    console.log('🔧 Initializing comprehensive Twilio messaging configuration...');

    try {
      // Step 1: Discover available phone numbers
      const availableNumbers = await this.discoverPhoneNumbers();
      
      // Step 2: Discover messaging services
      const messagingServices = await this.discoverMessagingServices();
      
      // Step 3: Discover short codes
      const shortCodes = await this.discoverShortCodes();
      
      // Step 4: Analyze geographic coverage
      const geographicAnalysis = await this.analyzeGeographicCoverage(availableNumbers);
      
      // Step 5: Generate optimal sender configurations
      const senderConfigurations = await this.generateOptimalSenderConfigurations(
        availableNumbers,
        messagingServices,
        shortCodes,
        geographicAnalysis
      );

      const configuration = {
        phoneNumbers: availableNumbers,
        messagingServices: messagingServices,
        shortCodes: shortCodes,
        geographicAnalysis: geographicAnalysis,
        recommendedConfigurations: senderConfigurations,
        initializationDate: new Date().toISOString()
      };

      // Store configurations
      this.storeConfigurations(configuration);

      console.log(`✅ Messaging configuration complete: ${availableNumbers.length} numbers, ${messagingServices.length} services, ${shortCodes.length} short codes`);
      
      return configuration;

    } catch (error) {
      console.error('Messaging configuration initialization failed:', error);
      throw new Error(`Configuration initialization failed: ${error.message}`);
    }
  }

  /**
   * Discover and analyze available phone numbers
   */
  async discoverPhoneNumbers() {
    try {
      const incomingNumbers = await this.twilio.incomingPhoneNumbers.list();
      
      const phoneNumbers = await Promise.all(
        incomingNumbers.map(async (number) => {
          // Get capabilities and configuration
          const capabilities = await this.analyzeNumberCapabilities(number);
          const geographicInfo = this.extractGeographicInfo(number);
          
          return {
            sid: number.sid,
            phoneNumber: number.phoneNumber,
            friendlyName: number.friendlyName,
            capabilities: capabilities,
            geographic: geographicInfo,
            status: 'available',
            currentLoad: 0,
            maxConcurrency: capabilities.sms ? 1 : 0 // SMS typically 1 TPS per number
          };
        })
      );

      console.log(`📞 Discovered ${phoneNumbers.length} phone numbers`);
      
      // Store phone numbers
      phoneNumbers.forEach(number => {
        this.phoneNumbers.set(number.sid, number);
      });

      return phoneNumbers;

    } catch (error) {
      console.error('Phone number discovery failed:', error);
      return [];
    }
  }

  /**
   * Discover and analyze messaging services
   */
  async discoverMessagingServices() {
    try {
      const services = await this.twilio.messaging.v1.services.list();
      
      const messagingServices = await Promise.all(
        services.map(async (service) => {
          // Get detailed service configuration
          const serviceDetails = await this.twilio.messaging.v1.services(service.sid).fetch();
          const phoneNumberPool = await this.getMessagingServicePhoneNumbers(service.sid);
          
          return {
            sid: service.sid,
            friendlyName: service.friendlyName,
            inboundRequestUrl: service.inboundRequestUrl,
            statusCallback: service.statusCallback,
            phoneNumberPool: phoneNumberPool,
            capabilities: {
              sms: true,
              mms: true,
              loadBalancing: true,
              fallback: true
            },
            throughput: {
              estimatedTPS: phoneNumberPool.length * 1, // Estimate 1 TPS per number
              maxConcurrency: phoneNumberPool.length * 10
            },
            status: 'available'
          };
        })
      );

      console.log(`🔧 Discovered ${messagingServices.length} messaging services`);
      
      // Store messaging services
      messagingServices.forEach(service => {
        this.messagingServices.set(service.sid, service);
      });

      return messagingServices;

    } catch (error) {
      console.error('Messaging service discovery failed:', error);
      return [];
    }
  }

  /**
   * Discover available short codes
   */
  async discoverShortCodes() {
    try {
      const shortCodesList = await this.twilio.messaging.v1.shortCodes.list();
      
      const shortCodes = shortCodesList.map(shortCode => ({
        sid: shortCode.sid,
        shortCode: shortCode.shortCode,
        friendlyName: shortCode.friendlyName,
        countryCode: shortCode.countryCode,
        capabilities: {
          sms: true,
          mms: false, // Most short codes don't support MMS
          highThroughput: true
        },
        throughput: {
          estimatedTPS: 100, // Short codes typically have higher throughput
          maxConcurrency: 1000
        },
        geographic: {
          country: shortCode.countryCode,
          regions: ['national'] // Short codes are typically national
        },
        status: 'available'
      }));

      console.log(`🔢 Discovered ${shortCodes.length} short codes`);
      
      // Store short codes
      shortCodes.forEach(code => {
        this.shortCodes.set(code.sid, code);
      });

      return shortCodes;

    } catch (error) {
      console.error('Short code discovery failed:', error);
      return [];
    }
  }

  /**
   * Analyze geographic coverage of available senders
   */
  async analyzeGeographicCoverage(phoneNumbers) {
    const coverage = {
      countries: new Set(),
      regions: new Map(),
      localNumbers: [],
      tollFreeNumbers: [],
      internationalCapability: false
    };

    phoneNumbers.forEach(number => {
      if (number.geographic) {
        coverage.countries.add(number.geographic.country);
        
        const region = number.geographic.region || 'unknown';
        if (!coverage.regions.has(region)) {
          coverage.regions.set(region, []);
        }
        coverage.regions.get(region).push(number);

        if (number.geographic.type === 'local') {
          coverage.localNumbers.push(number);
        } else if (number.geographic.type === 'toll-free') {
          coverage.tollFreeNumbers.push(number);
        }
      }
    });

    coverage.internationalCapability = coverage.countries.size > 1;

    console.log(`🌍 Geographic coverage: ${coverage.countries.size} countries, ${coverage.regions.size} regions`);
    
    return {
      countries: Array.from(coverage.countries),
      regions: Object.fromEntries(coverage.regions),
      localNumbers: coverage.localNumbers,
      tollFreeNumbers: coverage.tollFreeNumbers,
      internationalCapability: coverage.internationalCapability
    };
  }

  /**
   * Generate AI-powered optimal sender configurations
   */
  async generateOptimalSenderConfigurations(phoneNumbers, messagingServices, shortCodes, geographicAnalysis) {
    const prompt = `As a telecommunications expert, analyze these Twilio messaging resources and create optimal sender configurations:

**Available Resources:**
- Phone Numbers: ${phoneNumbers.length} (${geographicAnalysis.localNumbers.length} local, ${geographicAnalysis.tollFreeNumbers.length} toll-free)
- Messaging Services: ${messagingServices.length}
- Short Codes: ${shortCodes.length}
- Geographic Coverage: ${geographicAnalysis.countries.join(', ')}

**Phone Numbers Sample:**
${phoneNumbers.slice(0, 3).map(n => `- ${n.phoneNumber} (${n.geographic?.region || 'unknown'}) - SMS: ${n.capabilities.sms}, MMS: ${n.capabilities.mms}`).join('\n')}

**Messaging Services Sample:**
${messagingServices.slice(0, 2).map(s => `- ${s.friendlyName} (${s.phoneNumberPool.length} numbers, ${s.throughput.estimatedTPS} TPS)`).join('\n')}

**Configuration Requirements:**
1. High-volume campaign configurations (1000+ messages)
2. Personalized/low-volume configurations (< 100 messages)
3. Geographic-specific configurations
4. Compliance-focused configurations
5. Failover and redundancy configurations

**Analysis Required:**
1. Optimal sender selection strategies
2. Load balancing recommendations
3. Geographic routing rules
4. Failover configurations
5. Performance optimization settings

**Respond with:**
{
  "recommendedConfigurations": [
    {
      "name": "configuration_name",
      "useCase": "use_case_description",
      "senderType": "phone_number|messaging_service|short_code",
      "primarySender": "sender_identifier",
      "fallbackSenders": ["sender1", "sender2"],
      "routingRules": {
        "geographic": "routing_strategy",
        "loadBalancing": "strategy",
        "failover": "strategy"
      },
      "performance": {
        "maxThroughput": number,
        "recommendedBatchSize": number,
        "concurrencyLimit": number
      },
      "compliance": {
        "optInRequired": boolean,
        "shortCodeRequired": boolean,
        "geographicRestrictions": ["restriction1"]
      },
      "priority": "high|medium|low"
    }
  ],
  "optimizationStrategies": [
    {
      "strategy": "strategy_name",
      "description": "strategy_description",
      "implementation": "how_to_implement",
      "expectedBenefit": "expected_improvement"
    }
  ],
  "riskMitigation": [
    {
      "risk": "risk_description",
      "mitigation": "mitigation_strategy",
      "implementation": "how_to_implement"
    }
  ]
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      const aiAnalysis = JSON.parse(response.content[0].text);
      
      // Enhance AI recommendations with actual resource data
      const enhancedConfigurations = this.enhanceConfigurationsWithResourceData(
        aiAnalysis.recommendedConfigurations,
        { phoneNumbers, messagingServices, shortCodes, geographicAnalysis }
      );

      console.log(`🧠 Generated ${enhancedConfigurations.length} optimal sender configurations`);
      
      return {
        configurations: enhancedConfigurations,
        strategies: aiAnalysis.optimizationStrategies || [],
        riskMitigation: aiAnalysis.riskMitigation || []
      };

    } catch (error) {
      console.warn('AI configuration generation failed, using default configurations:', error);
      return this.generateDefaultConfigurations(phoneNumbers, messagingServices, shortCodes);
    }
  }

  /**
   * Select optimal sender for specific campaign parameters
   * @param {Object} campaignParams - Campaign requirements
   * @returns {Object} Selected sender configuration
   */
  async selectOptimalSender(campaignParams) {
    const {
      recipientCount,
      geographic,
      messageType, // 'sms' | 'mms'
      urgency, // 'high' | 'medium' | 'low'
      complianceLevel // 'strict' | 'standard' | 'relaxed'
    } = campaignParams;

    console.log(`🎯 Selecting optimal sender for ${recipientCount} recipients (${messageType}, ${urgency} urgency)`);

    // AI-powered sender selection
    const selection = await this.aiSenderSelection(campaignParams);
    
    // Validate availability and capacity
    const validatedSender = await this.validateSenderCapacity(selection, recipientCount);
    
    // Configure routing and failover
    const routingConfig = await this.configureRouting(validatedSender, campaignParams);

    const optimalConfig = {
      primary: validatedSender,
      routing: routingConfig,
      performance: this.calculatePerformanceEstimates(validatedSender, recipientCount),
      compliance: this.getComplianceRequirements(validatedSender, complianceLevel),
      selectedAt: new Date().toISOString()
    };

    console.log(`✅ Optimal sender selected: ${validatedSender.type} (${validatedSender.identifier})`);
    
    return optimalConfig;
  }

  /**
   * AI-powered sender selection logic
   */
  async aiSenderSelection(campaignParams) {
    // For high-volume campaigns, prefer messaging services
    if (campaignParams.recipientCount > 1000) {
      const bestService = this.findBestMessagingService(campaignParams);
      if (bestService) {
        return {
          type: 'messaging_service',
          identifier: bestService.sid,
          resource: bestService,
          reason: 'High-volume campaign optimization'
        };
      }
    }

    // For compliance-sensitive campaigns, prefer short codes
    if (campaignParams.complianceLevel === 'strict') {
      const bestShortCode = this.findBestShortCode(campaignParams);
      if (bestShortCode) {
        return {
          type: 'short_code',
          identifier: bestShortCode.sid,
          resource: bestShortCode,
          reason: 'Compliance requirement'
        };
      }
    }

    // For geographic-specific campaigns, prefer local numbers
    if (campaignParams.geographic && campaignParams.geographic.preferLocal) {
      const localNumber = this.findLocalNumber(campaignParams.geographic);
      if (localNumber) {
        return {
          type: 'phone_number',
          identifier: localNumber.sid,
          resource: localNumber,
          reason: 'Geographic proximity optimization'
        };
      }
    }

    // Default to best available messaging service or phone number
    const bestService = Array.from(this.messagingServices.values())[0];
    if (bestService) {
      return {
        type: 'messaging_service',
        identifier: bestService.sid,
        resource: bestService,
        reason: 'Default high-performance option'
      };
    }

    const bestNumber = Array.from(this.phoneNumbers.values())[0];
    return {
      type: 'phone_number',
      identifier: bestNumber.sid,
      resource: bestNumber,
      reason: 'Fallback to available phone number'
    };
  }

  /**
   * Configure intelligent routing and load balancing
   */
  async configureRouting(sender, campaignParams) {
    const routing = {
      primary: sender,
      fallback: [],
      loadBalancing: {
        enabled: this.config.enableLoadBalancing,
        strategy: 'round_robin', // 'round_robin', 'least_busy', 'geographic'
        healthCheck: true
      },
      geographic: {
        enabled: this.config.enableGeographicRouting,
        rules: []
      },
      rateLimit: {
        messagesPerSecond: this.calculateRateLimit(sender),
        burstLimit: this.calculateBurstLimit(sender),
        backoffStrategy: 'exponential'
      }
    };

    // Configure fallback senders
    routing.fallback = await this.configureFallbackSenders(sender, campaignParams);
    
    // Configure geographic routing if enabled
    if (routing.geographic.enabled && campaignParams.geographic) {
      routing.geographic.rules = this.generateGeographicRules(campaignParams.geographic);
    }

    return routing;
  }

  /**
   * Validate sender capacity for campaign volume
   */
  async validateSenderCapacity(sender, recipientCount) {
    const capacity = this.calculateSenderCapacity(sender);
    
    if (capacity.maxConcurrency < recipientCount) {
      console.warn(`Sender capacity (${capacity.maxConcurrency}) may be insufficient for ${recipientCount} recipients`);
      
      // Suggest alternative or configuration adjustment
      const alternative = await this.findHigherCapacityAlternative(sender, recipientCount);
      if (alternative) {
        return alternative;
      }
      
      // Add batching recommendation
      sender.batchingRequired = true;
      sender.recommendedBatchSize = Math.min(capacity.maxConcurrency, 100);
    }

    return sender;
  }

  // Utility Methods
  async analyzeNumberCapabilities(number) {
    return {
      sms: number.capabilities.sms,
      mms: number.capabilities.mms,
      voice: number.capabilities.voice,
      fax: number.capabilities.fax
    };
  }

  extractGeographicInfo(number) {
    const phoneNum = number.phoneNumber;
    
    // Simple geographic extraction - in production would use more sophisticated detection
    if (phoneNum.startsWith('+1')) {
      return {
        country: 'US',
        countryCode: '+1',
        type: phoneNum.match(/^(\+1)(800|888|877|866|855|844|833|822)/) ? 'toll-free' : 'local',
        region: 'North America'
      };
    }
    
    return {
      country: 'unknown',
      type: 'international',
      region: 'international'
    };
  }

  async getMessagingServicePhoneNumbers(serviceSid) {
    try {
      const phoneNumbers = await this.twilio.messaging.v1.services(serviceSid).phoneNumbers.list();
      return phoneNumbers.map(pn => ({
        sid: pn.sid,
        phoneNumber: pn.phoneNumber,
        capabilities: pn.capabilities
      }));
    } catch (error) {
      console.error(`Failed to get phone numbers for service ${serviceSid}:`, error);
      return [];
    }
  }

  findBestMessagingService(campaignParams) {
    const services = Array.from(this.messagingServices.values());
    
    // Score services based on campaign requirements
    const scoredServices = services.map(service => ({
      ...service,
      score: this.scoreService(service, campaignParams)
    }));

    scoredServices.sort((a, b) => b.score - a.score);
    return scoredServices[0] || null;
  }

  findBestShortCode(campaignParams) {
    const shortCodes = Array.from(this.shortCodes.values());
    return shortCodes.find(sc => sc.status === 'available') || null;
  }

  findLocalNumber(geographic) {
    const localNumbers = Array.from(this.phoneNumbers.values()).filter(
      number => number.geographic?.country === geographic.country
    );
    
    return localNumbers[0] || null;
  }

  scoreService(service, campaignParams) {
    let score = 0;
    
    // Base score from throughput capacity
    score += service.throughput.estimatedTPS * 10;
    
    // Bonus for phone number pool size
    score += service.phoneNumberPool.length * 5;
    
    // Bonus for MMS capability if needed
    if (campaignParams.messageType === 'mms' && service.capabilities.mms) {
      score += 20;
    }
    
    // Penalty if overloaded
    if (service.currentLoad > 0.8) {
      score -= 30;
    }
    
    return score;
  }

  calculateSenderCapacity(sender) {
    switch (sender.type) {
      case 'messaging_service':
        return {
          maxThroughput: sender.resource.throughput.estimatedTPS,
          maxConcurrency: sender.resource.throughput.maxConcurrency,
          currentLoad: 0 // Would track in production
        };
      case 'short_code':
        return {
          maxThroughput: sender.resource.throughput.estimatedTPS,
          maxConcurrency: sender.resource.throughput.maxConcurrency,
          currentLoad: 0
        };
      case 'phone_number':
        return {
          maxThroughput: sender.resource.maxConcurrency,
          maxConcurrency: sender.resource.maxConcurrency,
          currentLoad: sender.resource.currentLoad
        };
      default:
        return { maxThroughput: 1, maxConcurrency: 10, currentLoad: 0 };
    }
  }

  calculateRateLimit(sender) {
    const capacity = this.calculateSenderCapacity(sender);
    return Math.floor(capacity.maxThroughput * 0.9); // 90% of max capacity
  }

  calculateBurstLimit(sender) {
    const capacity = this.calculateSenderCapacity(sender);
    return Math.floor(capacity.maxThroughput * 1.5); // 150% for short bursts
  }

  async configureFallbackSenders(primarySender, campaignParams) {
    const fallbacks = [];
    
    // Find different type of sender as fallback
    if (primarySender.type === 'messaging_service') {
      const fallbackNumber = this.findAvailablePhoneNumber(campaignParams);
      if (fallbackNumber) {
        fallbacks.push({
          type: 'phone_number',
          identifier: fallbackNumber.sid,
          resource: fallbackNumber,
          priority: 1
        });
      }
    } else if (primarySender.type === 'phone_number') {
      const fallbackService = this.findAvailableMessagingService(campaignParams);
      if (fallbackService) {
        fallbacks.push({
          type: 'messaging_service',
          identifier: fallbackService.sid,
          resource: fallbackService,
          priority: 1
        });
      }
    }
    
    return fallbacks;
  }

  findAvailablePhoneNumber(campaignParams) {
    return Array.from(this.phoneNumbers.values()).find(number => 
      number.status === 'available' && number.currentLoad < 0.8
    ) || null;
  }

  findAvailableMessagingService(campaignParams) {
    return Array.from(this.messagingServices.values()).find(service => 
      service.status === 'available'
    ) || null;
  }

  generateGeographicRules(geographic) {
    return [
      {
        condition: { country: geographic.country },
        action: 'use_local_number',
        priority: 'high'
      },
      {
        condition: { country: '*' },
        action: 'use_international_capable',
        priority: 'medium'
      }
    ];
  }

  calculatePerformanceEstimates(sender, recipientCount) {
    const capacity = this.calculateSenderCapacity(sender);
    
    return {
      estimatedDuration: Math.ceil(recipientCount / capacity.maxThroughput) + ' seconds',
      recommendedBatchSize: Math.min(capacity.maxThroughput * 10, 1000),
      maxConcurrency: capacity.maxConcurrency,
      expectedThroughput: capacity.maxThroughput + ' TPS'
    };
  }

  getComplianceRequirements(sender, complianceLevel) {
    const baseRequirements = {
      optInRequired: true,
      optOutHandling: true,
      carrierFiltering: true
    };

    if (complianceLevel === 'strict') {
      return {
        ...baseRequirements,
        shortCodePreferred: sender.type !== 'short_code',
        carrierApprovalRequired: true,
        contentRestrictions: 'strict'
      };
    }

    return baseRequirements;
  }

  enhanceConfigurationsWithResourceData(aiConfigurations, resources) {
    return aiConfigurations.map(config => ({
      ...config,
      availableResources: this.mapConfigurationToResources(config, resources),
      validated: true,
      enhancedAt: new Date().toISOString()
    }));
  }

  mapConfigurationToResources(config, resources) {
    const mapped = {
      phoneNumbers: [],
      messagingServices: [],
      shortCodes: []
    };

    if (config.senderType === 'phone_number') {
      mapped.phoneNumbers = resources.phoneNumbers.slice(0, 3);
    } else if (config.senderType === 'messaging_service') {
      mapped.messagingServices = resources.messagingServices;
    } else if (config.senderType === 'short_code') {
      mapped.shortCodes = resources.shortCodes;
    }

    return mapped;
  }

  generateDefaultConfigurations(phoneNumbers, messagingServices, shortCodes) {
    return {
      configurations: [
        {
          name: 'High Volume SMS',
          useCase: 'Large scale promotional campaigns',
          senderType: 'messaging_service',
          priority: 'high',
          performance: { maxThroughput: 100, recommendedBatchSize: 1000 }
        },
        {
          name: 'Personal SMS',
          useCase: 'One-to-one personalized messages',
          senderType: 'phone_number',
          priority: 'medium',
          performance: { maxThroughput: 1, recommendedBatchSize: 10 }
        }
      ],
      strategies: [],
      riskMitigation: []
    };
  }

  async findHigherCapacityAlternative(currentSender, recipientCount) {
    // Look for messaging service if current is phone number
    if (currentSender.type === 'phone_number') {
      const services = Array.from(this.messagingServices.values());
      const suitableService = services.find(s => 
        s.throughput.maxConcurrency >= recipientCount
      );
      
      if (suitableService) {
        return {
          type: 'messaging_service',
          identifier: suitableService.sid,
          resource: suitableService,
          reason: 'Upgraded for higher capacity'
        };
      }
    }
    
    return null;
  }

  storeConfigurations(configuration) {
    // Store in instance for runtime access
    this.phoneNumbers.clear();
    this.messagingServices.clear();
    this.shortCodes.clear();
    
    configuration.phoneNumbers.forEach(number => {
      this.phoneNumbers.set(number.sid, number);
    });
    
    configuration.messagingServices.forEach(service => {
      this.messagingServices.set(service.sid, service);
    });
    
    configuration.shortCodes.forEach(code => {
      this.shortCodes.set(code.sid, code);
    });
  }

  /**
   * Get service health and configuration status
   */
  getServiceHealth() {
    return {
      service: 'TwilioMessagingConfigurator',
      status: 'healthy',
      resources: {
        phoneNumbers: this.phoneNumbers.size,
        messagingServices: this.messagingServices.size,
        shortCodes: this.shortCodes.size
      },
      metrics: this.routingMetrics,
      capabilities: [
        'intelligent_sender_selection',
        'geographic_routing',
        'load_balancing',
        'capacity_validation',
        'failover_configuration',
        'compliance_optimization'
      ],
      config: this.config
    };
  }
}

module.exports = TwilioMessagingConfigurator;