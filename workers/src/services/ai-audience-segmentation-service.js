/**
 * AI-Powered Audience Segmentation Service
 * Phase 3: Advanced customer segmentation using Claude AI
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');

class AIAudienceSegmentationService {
  constructor(options = {}) {
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.config = {
      maxSegments: options.maxSegments || 10,
      minimumSegmentSize: options.minimumSegmentSize || 50,
      segmentationDepth: options.segmentationDepth || 'deep', // shallow, medium, deep
      realtimeUpdates: options.realtimeUpdates !== false,
      autoOptimization: options.autoOptimization !== false
    };

    // Segmentation data storage
    this.customerProfiles = new Map();
    this.segments = new Map();
    this.segmentationHistory = new Map();
    this.behaviorPatterns = new Map();

    // AI models and insights cache
    this.aiModels = new Map();
    this.segmentInsightsCache = new Map();

    // Performance metrics
    this.segmentationMetrics = {
      totalCustomersSegmented: 0,
      activeSegments: 0,
      segmentationAccuracy: 0,
      lastSegmentationTime: null,
      averageSegmentSize: 0,
      segmentPerformanceScores: {}
    };

    console.log('🎯 AI Audience Segmentation Service initialized');
  }

  /**
   * Perform comprehensive AI-powered audience segmentation
   * @param {Array} customers - Customer data array
   * @param {Object} segmentationCriteria - Segmentation parameters
   * @param {Object} options - Segmentation options
   * @returns {Object} Segmentation results
   */
  async performAISegmentation(customers, segmentationCriteria, options = {}) {
    const startTime = Date.now();
    const segmentationId = this.generateSegmentationId();

    console.log(`🎯 Starting AI-powered segmentation of ${customers.length} customers...`);

    try {
      // Step 1: Enrich customer profiles with behavioral analysis
      console.log('📊 Enriching customer profiles with behavioral analysis...');
      const enrichedProfiles = await this.enrichCustomerProfiles(customers);

      // Step 2: AI-powered segment discovery
      console.log('🧠 Discovering optimal segments using Claude AI...');
      const segmentStrategy = await this.discoverOptimalSegments(
        enrichedProfiles, 
        segmentationCriteria, 
        options
      );

      // Step 3: Apply intelligent segmentation algorithm
      console.log('⚙️ Applying segmentation algorithm...');
      const segmentationResults = await this.applySegmentationAlgorithm(
        enrichedProfiles, 
        segmentStrategy
      );

      // Step 4: Generate segment insights and personas
      console.log('👥 Generating segment insights and personas...');
      const segmentInsights = await this.generateSegmentInsights(
        segmentationResults.segments
      );

      // Step 5: Calculate segment performance scores
      const performanceScores = await this.calculateSegmentPerformance(
        segmentationResults.segments
      );

      // Step 6: Generate actionable recommendations
      const recommendations = await this.generateSegmentRecommendations(
        segmentationResults.segments,
        segmentInsights,
        performanceScores
      );

      const result = {
        segmentationId: segmentationId,
        totalCustomers: customers.length,
        segments: segmentationResults.segments,
        segmentSummary: {
          totalSegments: segmentationResults.segments.length,
          averageSegmentSize: Math.round(customers.length / segmentationResults.segments.length),
          segmentSizeRange: this.calculateSegmentSizeRange(segmentationResults.segments),
          segmentationScore: segmentationResults.qualityScore
        },
        insights: segmentInsights,
        performanceScores: performanceScores,
        recommendations: recommendations,
        segmentationStrategy: segmentStrategy,
        processingTime: Date.now() - startTime,
        createdAt: new Date().toISOString()
      };

      // Store segmentation results
      this.segmentationHistory.set(segmentationId, result);
      
      // Update active segments
      segmentationResults.segments.forEach(segment => {
        this.segments.set(segment.id, segment);
      });

      // Update metrics
      this.updateSegmentationMetrics(result);

      console.log(`✅ AI segmentation complete: ${result.segmentSummary.totalSegments} segments created`);

      return result;

    } catch (error) {
      console.error('AI segmentation failed:', error);
      throw new Error(`AI segmentation failed: ${error.message}`);
    }
  }

  /**
   * Discover optimal segments using Claude AI
   * @param {Array} enrichedProfiles - Customer profiles with behavioral data
   * @param {Object} criteria - Segmentation criteria
   * @param {Object} options - Additional options
   * @returns {Object} Segmentation strategy
   */
  async discoverOptimalSegments(enrichedProfiles, criteria, options) {
    const prompt = `As an expert marketing analyst, analyze this customer dataset and design an optimal segmentation strategy:

**Dataset Overview:**
- Total Customers: ${enrichedProfiles.length}
- Business Context: ${criteria.businessGoal || 'general marketing'}
- Industry: ${criteria.industry || 'general'}
- Campaign Types: ${criteria.campaignTypes?.join(', ') || 'email, SMS'}

**Sample Customer Profiles (first 5):**
${enrichedProfiles.slice(0, 5).map(p => JSON.stringify(p, null, 2)).join('\n---\n')}

**Segmentation Requirements:**
- Maximum Segments: ${this.config.maxSegments}
- Minimum Segment Size: ${this.config.minimumSegmentSize}
- Segmentation Depth: ${this.config.segmentationDepth}
- Business Priority: ${criteria.priority || 'engagement'}

**Available Data Points:**
- Demographics (age, location, etc.)
- Behavioral patterns (engagement, purchase history)
- Channel preferences
- Lifecycle stage
- Value metrics (LTV, AOV, frequency)

**Segmentation Strategy Required:**
1. Optimal number of segments for this dataset
2. Primary segmentation dimensions to focus on
3. Segment naming and personas
4. Expected segment characteristics
5. Business value of each segment

**Respond with:**
{
  "recommendedSegments": [
    {
      "name": "segment_name",
      "description": "segment description", 
      "primaryCriteria": ["criteria1", "criteria2"],
      "expectedSize": "percentage_of_total",
      "businessValue": "high|medium|low",
      "persona": {
        "demographics": "typical demographics",
        "behaviors": "key behaviors",
        "preferences": "channel and content preferences",
        "painPoints": ["pain1", "pain2"],
        "motivations": ["motivation1", "motivation2"]
      },
      "marketingStrategy": {
        "recommendedChannels": ["channel1", "channel2"],
        "messagingStyle": "style description",
        "campaignTypes": ["type1", "type2"],
        "frequency": "optimal frequency"
      }
    }
  ],
  "segmentationLogic": {
    "primaryDimensions": ["dimension1", "dimension2"],
    "algorithmType": "rule_based|clustering|ai_hybrid",
    "weightings": {
      "demographic": percentage,
      "behavioral": percentage,
      "transactional": percentage
    }
  },
  "qualityMetrics": {
    "expectedAccuracy": number (0-100),
    "segmentDistinctiveness": "high|medium|low",
    "businessRelevance": "high|medium|low"
  },
  "implementation": {
    "complexity": "low|medium|high",
    "dataRequirements": ["requirement1", "requirement2"],
    "recommendedTools": ["tool1", "tool2"]
  }
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2500,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }]
      });

      const strategy = JSON.parse(response.content[0].text);
      
      console.log(`🧠 AI recommended ${strategy.recommendedSegments.length} segments with ${strategy.qualityMetrics.expectedAccuracy}% expected accuracy`);
      
      return strategy;

    } catch (error) {
      console.error('AI segment discovery failed:', error);
      
      // Fallback to simple segmentation strategy
      return {
        recommendedSegments: [
          {
            name: 'High Engagers',
            description: 'Customers with high engagement rates',
            primaryCriteria: ['engagement_score'],
            expectedSize: '25%',
            businessValue: 'high'
          },
          {
            name: 'Medium Engagers', 
            description: 'Customers with moderate engagement',
            primaryCriteria: ['engagement_score'],
            expectedSize: '50%',
            businessValue: 'medium'
          },
          {
            name: 'Low Engagers',
            description: 'Customers with low engagement rates',
            primaryCriteria: ['engagement_score'],
            expectedSize: '25%',
            businessValue: 'low'
          }
        ],
        segmentationLogic: {
          primaryDimensions: ['engagement_score'],
          algorithmType: 'rule_based'
        },
        fallbackUsed: true
      };
    }
  }

  /**
   * Apply segmentation algorithm to customer profiles
   * @param {Array} profiles - Enriched customer profiles
   * @param {Object} strategy - Segmentation strategy from AI
   * @returns {Object} Segmentation results
   */
  async applySegmentationAlgorithm(profiles, strategy) {
    console.log('⚙️ Applying AI-guided segmentation algorithm...');

    const segments = [];
    const unassignedCustomers = [...profiles];

    // Apply segmentation based on AI strategy
    for (const segmentConfig of strategy.recommendedSegments) {
      const segment = await this.createSegmentFromConfig(
        unassignedCustomers,
        segmentConfig,
        strategy.segmentationLogic
      );
      
      if (segment.customers.length >= this.config.minimumSegmentSize) {
        segments.push(segment);
        
        // Remove assigned customers from unassigned list
        segment.customers.forEach(customer => {
          const index = unassignedCustomers.findIndex(c => c.customerId === customer.customerId);
          if (index !== -1) {
            unassignedCustomers.splice(index, 1);
          }
        });
      }
    }

    // Handle remaining unassigned customers
    if (unassignedCustomers.length >= this.config.minimumSegmentSize) {
      const miscSegment = {
        id: this.generateSegmentId(),
        name: 'Other',
        description: 'Customers not fitting primary segments',
        customers: unassignedCustomers,
        size: unassignedCustomers.length,
        criteria: ['misc_criteria'],
        characteristics: await this.analyzeSegmentCharacteristics(unassignedCustomers)
      };
      segments.push(miscSegment);
    }

    // Calculate overall segmentation quality
    const qualityScore = this.calculateSegmentationQuality(segments, profiles.length);

    return {
      segments: segments,
      qualityScore: qualityScore,
      coverage: (profiles.length - unassignedCustomers.length) / profiles.length * 100,
      totalSegments: segments.length
    };
  }

  /**
   * Create segment from AI configuration
   */
  async createSegmentFromConfig(customers, segmentConfig, segmentationLogic) {
    const segmentCustomers = [];
    
    // Apply segment criteria
    for (const customer of customers) {
      if (await this.customerMatchesSegment(customer, segmentConfig, segmentationLogic)) {
        segmentCustomers.push(customer);
      }
    }

    const segment = {
      id: this.generateSegmentId(),
      name: segmentConfig.name,
      description: segmentConfig.description,
      customers: segmentCustomers,
      size: segmentCustomers.length,
      criteria: segmentConfig.primaryCriteria,
      businessValue: segmentConfig.businessValue,
      persona: segmentConfig.persona,
      marketingStrategy: segmentConfig.marketingStrategy,
      characteristics: await this.analyzeSegmentCharacteristics(segmentCustomers),
      createdAt: new Date().toISOString()
    };

    return segment;
  }

  /**
   * Check if customer matches segment criteria
   */
  async customerMatchesSegment(customer, segmentConfig, segmentationLogic) {
    // Simplified matching logic - in production would be more sophisticated
    const criteria = segmentConfig.primaryCriteria;
    
    if (criteria.includes('engagement_score')) {
      const engagementScore = customer.calculatedMetrics?.engagementScore || 0;
      
      if (segmentConfig.name.includes('High') && engagementScore > 70) return true;
      if (segmentConfig.name.includes('Medium') && engagementScore >= 30 && engagementScore <= 70) return true;
      if (segmentConfig.name.includes('Low') && engagementScore < 30) return true;
    }

    if (criteria.includes('purchase_frequency')) {
      const purchaseHistory = customer.purchaseHistory || [];
      const frequency = purchaseHistory.length;
      
      if (segmentConfig.name.includes('Frequent') && frequency > 5) return true;
      if (segmentConfig.name.includes('Occasional') && frequency > 1 && frequency <= 5) return true;
      if (segmentConfig.name.includes('New') && frequency <= 1) return true;
    }

    return false;
  }

  /**
   * Generate comprehensive segment insights
   * @param {Array} segments - Created segments
   * @returns {Object} Segment insights
   */
  async generateSegmentInsights(segments) {
    const insights = {};

    for (const segment of segments) {
      const segmentPrompt = `Analyze this customer segment and provide comprehensive insights:

**Segment:** ${segment.name}
**Description:** ${segment.description}
**Size:** ${segment.size} customers
**Business Value:** ${segment.businessValue}

**Sample Customer Characteristics:**
${segment.characteristics ? JSON.stringify(segment.characteristics, null, 2) : 'No characteristics available'}

**Analysis Required:**
1. Key behavioral patterns and trends
2. Revenue potential and business impact
3. Optimal marketing strategies
4. Content preferences and messaging
5. Channel preferences and timing
6. Potential growth opportunities
7. Risk factors and challenges

**Respond with:**
{
  "behavioralInsights": {
    "keyPatterns": ["pattern1", "pattern2"],
    "engagementStyle": "description",
    "purchaseBehavior": "description",
    "communicationPreferences": "description"
  },
  "businessImpact": {
    "revenueContribution": "percentage or description",
    "growthPotential": "high|medium|low", 
    "acquisitionCost": "high|medium|low",
    "lifetimeValue": "high|medium|low"
  },
  "marketingRecommendations": {
    "primaryChannels": ["channel1", "channel2"],
    "messagingTone": "tone description",
    "contentTypes": ["type1", "type2"],
    "campaignFrequency": "frequency recommendation",
    "bestPractices": ["practice1", "practice2"]
  },
  "growthOpportunities": [
    {
      "opportunity": "opportunity description",
      "potential": "high|medium|low",
      "effort": "high|medium|low",
      "timeframe": "short|medium|long"
    }
  ],
  "risks": [
    {
      "risk": "risk description",
      "probability": "high|medium|low",
      "impact": "high|medium|low",
      "mitigation": "mitigation strategy"
    }
  ]
}`;

      try {
        const response = await this.claude.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1500,
          temperature: 0.3,
          messages: [{ role: 'user', content: segmentPrompt }]
        });

        insights[segment.id] = {
          segmentName: segment.name,
          ...JSON.parse(response.content[0].text),
          generatedAt: new Date().toISOString()
        };

      } catch (error) {
        console.error(`Segment insights generation failed for ${segment.name}:`, error);
        insights[segment.id] = {
          segmentName: segment.name,
          behaviorInsights: { keyPatterns: [] },
          businessImpact: { revenueContribution: 'unknown' },
          marketingRecommendations: { primaryChannels: [] },
          error: 'Insights generation failed'
        };
      }
    }

    return insights;
  }

  /**
   * Enrich customer profiles with behavioral analysis
   */
  async enrichCustomerProfiles(customers) {
    return customers.map(customer => {
      const enriched = {
        ...customer,
        calculatedMetrics: {
          engagementScore: this.calculateEngagementScore(customer),
          recencyScore: this.calculateRecencyScore(customer), 
          valueScore: this.calculateValueScore(customer),
          loyaltyScore: this.calculateLoyaltyScore(customer),
          riskScore: this.calculateChurnRiskScore(customer)
        },
        behaviorProfile: {
          primaryChannel: this.identifyPrimaryChannel(customer),
          engagementPattern: this.identifyEngagementPattern(customer),
          purchasePattern: this.identifyPurchasePattern(customer),
          lifecycleStage: this.identifyLifecycleStage(customer)
        },
        enrichedAt: new Date().toISOString()
      };

      // Store enriched profile
      this.customerProfiles.set(customer.customerId, enriched);
      
      return enriched;
    });
  }

  /**
   * Real-time segment assignment for new customers
   * @param {Object} newCustomer - New customer data
   * @returns {Object} Segment assignment result
   */
  async assignCustomerToSegments(newCustomer) {
    console.log(`🎯 Assigning customer ${newCustomer.customerId} to segments...`);

    // Enrich customer profile
    const enrichedCustomer = (await this.enrichCustomerProfiles([newCustomer]))[0];

    // Find matching segments
    const matchingSegments = [];
    for (const [segmentId, segment] of this.segments) {
      // Check if customer matches segment criteria
      const matchScore = await this.calculateSegmentMatchScore(enrichedCustomer, segment);
      
      if (matchScore > 0.7) { // 70% match threshold
        matchingSegments.push({
          segmentId: segmentId,
          segmentName: segment.name,
          matchScore: matchScore,
          confidence: matchScore * 100
        });
      }
    }

    // Sort by match score
    matchingSegments.sort((a, b) => b.matchScore - a.matchScore);

    // Assign to best matching segment
    const primarySegment = matchingSegments[0] || null;
    
    if (primarySegment) {
      // Add customer to segment
      const segment = this.segments.get(primarySegment.segmentId);
      segment.customers.push(enrichedCustomer);
      segment.size++;
    }

    return {
      customerId: newCustomer.customerId,
      primarySegment: primarySegment,
      alternativeSegments: matchingSegments.slice(1, 3), // Top 2 alternatives
      assignmentConfidence: primarySegment ? primarySegment.confidence : 0,
      assignedAt: new Date().toISOString()
    };
  }

  /**
   * Get comprehensive segmentation health and metrics
   */
  getServiceHealth() {
    return {
      service: 'AIAudienceSegmentationService',
      status: 'healthy',
      metrics: {
        ...this.segmentationMetrics,
        activeSegments: this.segments.size,
        customerProfiles: this.customerProfiles.size
      },
      segments: Array.from(this.segments.values()).map(s => ({
        id: s.id,
        name: s.name,
        size: s.size,
        businessValue: s.businessValue
      })),
      config: this.config,
      capabilities: [
        'ai_powered_segmentation',
        'behavioral_analysis',
        'real_time_assignment',
        'segment_insights',
        'performance_tracking',
        'personalized_recommendations'
      ]
    };
  }

  // Utility methods
  calculateEngagementScore(customer) {
    const engagementHistory = customer.engagementHistory || [];
    if (engagementHistory.length === 0) return 0;

    const recentEngagements = engagementHistory.filter(
      e => new Date(e.timestamp) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );

    const engagementRate = recentEngagements.length / Math.max(engagementHistory.length, 1);
    const recency = recentEngagements.length > 0 ? 1 : 0.5;
    
    return Math.min(100, engagementRate * 100 * recency);
  }

  calculateRecencyScore(customer) {
    const lastEngagement = customer.lastEngagement || customer.lastPurchase;
    if (!lastEngagement) return 0;

    const daysSinceLastActivity = Math.floor(
      (Date.now() - new Date(lastEngagement).getTime()) / (1000 * 60 * 60 * 24)
    );

    return Math.max(0, 100 - daysSinceLastActivity * 2);
  }

  calculateValueScore(customer) {
    const purchases = customer.purchaseHistory || [];
    if (purchases.length === 0) return 0;

    const totalValue = purchases.reduce((sum, p) => sum + (p.value || p.amount || 0), 0);
    const averageOrderValue = totalValue / purchases.length;

    return Math.min(100, Math.log10(averageOrderValue || 1) * 25);
  }

  calculateLoyaltyScore(customer) {
    const purchases = customer.purchaseHistory || [];
    const engagements = customer.engagementHistory || [];
    
    const purchaseFrequency = purchases.length;
    const engagementFrequency = engagements.length;
    
    return Math.min(100, (purchaseFrequency * 10) + (engagementFrequency * 2));
  }

  calculateChurnRiskScore(customer) {
    const recencyScore = this.calculateRecencyScore(customer);
    const engagementScore = this.calculateEngagementScore(customer);
    
    // Higher recency and engagement = lower churn risk
    return Math.max(0, 100 - ((recencyScore + engagementScore) / 2));
  }

  identifyPrimaryChannel(customer) {
    const engagements = customer.engagementHistory || [];
    const channelCounts = {};
    
    engagements.forEach(e => {
      channelCounts[e.channel] = (channelCounts[e.channel] || 0) + 1;
    });
    
    return Object.keys(channelCounts).reduce((a, b) => 
      channelCounts[a] > channelCounts[b] ? a : b, 'email'
    );
  }

  identifyEngagementPattern(customer) {
    const engagements = customer.engagementHistory || [];
    if (engagements.length < 3) return 'new';
    
    const recent = engagements.slice(-5);
    const frequency = recent.length / 30; // engagements per day in last 30 days
    
    if (frequency > 0.5) return 'highly_active';
    if (frequency > 0.2) return 'moderately_active';
    return 'low_activity';
  }

  identifyPurchasePattern(customer) {
    const purchases = customer.purchaseHistory || [];
    if (purchases.length === 0) return 'non_purchaser';
    if (purchases.length === 1) return 'first_time_buyer';
    if (purchases.length < 5) return 'occasional_buyer';
    return 'frequent_buyer';
  }

  identifyLifecycleStage(customer) {
    const daysSinceFirst = customer.firstEngagement ? 
      Math.floor((Date.now() - new Date(customer.firstEngagement).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    
    const purchases = customer.purchaseHistory || [];
    const engagements = customer.engagementHistory || [];
    
    if (daysSinceFirst < 30) return 'new';
    if (purchases.length === 0 && engagements.length > 0) return 'prospect';
    if (purchases.length > 0 && daysSinceFirst < 180) return 'active';
    if (purchases.length > 3) return 'loyal';
    return 'inactive';
  }

  async analyzeSegmentCharacteristics(customers) {
    if (customers.length === 0) return {};
    
    const characteristics = {
      avgEngagementScore: customers.reduce((sum, c) => sum + (c.calculatedMetrics?.engagementScore || 0), 0) / customers.length,
      avgValueScore: customers.reduce((sum, c) => sum + (c.calculatedMetrics?.valueScore || 0), 0) / customers.length,
      avgRecencyScore: customers.reduce((sum, c) => sum + (c.calculatedMetrics?.recencyScore || 0), 0) / customers.length,
      primaryChannels: this.getTopChannels(customers),
      lifecycleDistribution: this.getLifecycleDistribution(customers),
      behaviorDistribution: this.getBehaviorDistribution(customers)
    };
    
    return characteristics;
  }

  getTopChannels(customers) {
    const channelCounts = {};
    customers.forEach(c => {
      const channel = c.behaviorProfile?.primaryChannel || 'unknown';
      channelCounts[channel] = (channelCounts[channel] || 0) + 1;
    });
    
    return Object.entries(channelCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([channel, count]) => ({ channel, count }));
  }

  getLifecycleDistribution(customers) {
    const distribution = {};
    customers.forEach(c => {
      const stage = c.behaviorProfile?.lifecycleStage || 'unknown';
      distribution[stage] = (distribution[stage] || 0) + 1;
    });
    return distribution;
  }

  getBehaviorDistribution(customers) {
    const distribution = {};
    customers.forEach(c => {
      const pattern = c.behaviorProfile?.engagementPattern || 'unknown';
      distribution[pattern] = (distribution[pattern] || 0) + 1;
    });
    return distribution;
  }

  calculateSegmentationQuality(segments, totalCustomers) {
    // Simple quality score based on segment balance and coverage
    const segmentSizes = segments.map(s => s.size);
    const avgSize = segmentSizes.reduce((a, b) => a + b, 0) / segments.length;
    const variance = segmentSizes.reduce((sum, size) => sum + Math.pow(size - avgSize, 2), 0) / segments.length;
    const balance = Math.max(0, 100 - (Math.sqrt(variance) / avgSize * 100));
    
    const coverage = (segmentSizes.reduce((a, b) => a + b, 0) / totalCustomers) * 100;
    
    return (balance + coverage) / 2;
  }

  calculateSegmentSizeRange(segments) {
    const sizes = segments.map(s => s.size);
    return {
      min: Math.min(...sizes),
      max: Math.max(...sizes),
      median: sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)]
    };
  }

  async calculateSegmentMatchScore(customer, segment) {
    // Simplified match score calculation
    const engagementScore = customer.calculatedMetrics?.engagementScore || 0;
    const valueScore = customer.calculatedMetrics?.valueScore || 0;
    
    // Simple scoring based on segment criteria
    let matchScore = 0.5; // base score
    
    if (segment.criteria.includes('engagement_score')) {
      if (segment.name.includes('High') && engagementScore > 70) matchScore += 0.3;
      if (segment.name.includes('Medium') && engagementScore >= 30 && engagementScore <= 70) matchScore += 0.3;
      if (segment.name.includes('Low') && engagementScore < 30) matchScore += 0.3;
    }
    
    return Math.min(1, matchScore);
  }

  async calculateSegmentPerformance(segments) {
    const performance = {};
    
    for (const segment of segments) {
      performance[segment.id] = {
        segmentName: segment.name,
        size: segment.size,
        businessValue: segment.businessValue,
        avgEngagementScore: segment.characteristics?.avgEngagementScore || 0,
        avgValueScore: segment.characteristics?.avgValueScore || 0,
        performanceRank: segment.businessValue === 'high' ? 1 : segment.businessValue === 'medium' ? 2 : 3
      };
    }
    
    return performance;
  }

  async generateSegmentRecommendations(segments, insights, performanceScores) {
    const recommendations = [];
    
    segments.forEach(segment => {
      const insight = insights[segment.id];
      const performance = performanceScores[segment.id];
      
      if (performance && performance.businessValue === 'high') {
        recommendations.push({
          segmentId: segment.id,
          segmentName: segment.name,
          recommendation: 'Focus marketing investments on this high-value segment',
          priority: 'high',
          expectedImpact: 'high'
        });
      }
      
      if (segment.size < this.config.minimumSegmentSize * 2) {
        recommendations.push({
          segmentId: segment.id,
          segmentName: segment.name,
          recommendation: 'Consider merging with similar segments due to small size',
          priority: 'medium',
          expectedImpact: 'medium'
        });
      }
    });
    
    return recommendations;
  }

  updateSegmentationMetrics(result) {
    this.segmentationMetrics.totalCustomersSegmented += result.totalCustomers;
    this.segmentationMetrics.activeSegments = result.segmentSummary.totalSegments;
    this.segmentationMetrics.segmentationAccuracy = result.segmentSummary.segmentationScore;
    this.segmentationMetrics.lastSegmentationTime = result.createdAt;
    this.segmentationMetrics.averageSegmentSize = result.segmentSummary.averageSegmentSize;
  }

  generateSegmentationId() {
    return `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateSegmentId() {
    return `segment_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }
}

module.exports = AIAudienceSegmentationService;