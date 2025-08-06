/**
 * Automated A/B Testing Service
 * Phase 2: AI-powered A/B test creation, execution, and analysis
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');

class ABTestingService {
  constructor(options = {}) {
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.config = {
      defaultTestDuration: options.testDuration || 7, // days
      minimumSampleSize: options.minimumSampleSize || 100,
      confidenceLevel: options.confidenceLevel || 0.95,
      significanceThreshold: options.significanceThreshold || 0.05,
      maxVariants: options.maxVariants || 5,
      autoOptimization: options.autoOptimization !== false
    };

    // Active tests storage
    this.activeTests = new Map();
    this.testResults = new Map();
    this.testHistory = new Map();

    // A/B testing metrics
    this.testingMetrics = {
      totalTests: 0,
      activeTests: 0,
      completedTests: 0,
      significantResults: 0,
      averageImprovement: 0,
      lastTestCreated: null
    };

    console.log('🧪 A/B Testing Service initialized');
  }

  /**
   * Create and launch automated A/B test
   * @param {Object} testConfig - Test configuration
   * @param {Object} baselineVariant - Control variant
   * @param {Array} audience - Target audience
   * @param {Object} options - Test options
   * @returns {Object} Test creation result
   */
  async createABTest(testConfig, baselineVariant, audience, options = {}) {
    const testId = this.generateTestId();
    const startTime = Date.now();

    console.log(`🧪 Creating A/B test ${testId}: ${testConfig.name}...`);

    try {
      // Step 1: Validate test configuration
      this.validateTestConfiguration(testConfig, baselineVariant, audience);

      // Step 2: Generate AI-powered test variants
      const aiVariants = await this.generateAITestVariants(
        baselineVariant, 
        testConfig, 
        options.variantCount || 2
      );

      // Step 3: Calculate optimal sample sizes
      const sampleSizeCalculations = this.calculateSampleSizes(
        audience.length, 
        testConfig.expectedImprovement || 0.1,
        aiVariants.length + 1 // +1 for control
      );

      // Step 4: Split audience intelligently
      const audienceSplits = await this.splitAudienceIntelligently(
        audience, 
        aiVariants.length + 1,
        testConfig
      );

      // Step 5: Create test structure
      const abTest = {
        id: testId,
        name: testConfig.name,
        type: testConfig.type || 'email',
        status: 'active',
        createdAt: new Date().toISOString(),
        startDate: new Date().toISOString(),
        expectedEndDate: new Date(Date.now() + this.config.defaultTestDuration * 24 * 60 * 60 * 1000).toISOString(),
        
        // Test configuration
        config: testConfig,
        hypothesis: testConfig.hypothesis,
        primaryMetric: testConfig.primaryMetric || 'click_rate',
        secondaryMetrics: testConfig.secondaryMetrics || ['open_rate', 'conversion_rate'],
        
        // Variants
        variants: [
          {
            id: 'control',
            name: 'Control',
            type: 'control',
            content: baselineVariant,
            audience: audienceSplits[0],
            traffic: sampleSizeCalculations.trafficSplit
          },
          ...aiVariants.map((variant, index) => ({
            id: `variant_${index + 1}`,
            name: variant.name,
            type: 'variant',
            content: variant.content,
            audience: audienceSplits[index + 1],
            traffic: sampleSizeCalculations.trafficSplit,
            aiGenerated: true,
            hypothesis: variant.hypothesis
          }))
        ],
        
        // Statistical setup
        statistics: {
          sampleSizeCalculations,
          confidenceLevel: this.config.confidenceLevel,
          significanceThreshold: this.config.significanceThreshold,
          requiredSampleSize: sampleSizeCalculations.requiredSampleSize
        },
        
        // Results tracking
        results: {
          totalSent: 0,
          variantResults: {},
          metrics: {},
          significanceReached: false,
          winner: null
        },
        
        // AI insights
        aiInsights: aiVariants[0]?.aiInsights || {},
        
        creationTime: Date.now() - startTime
      };

      // Initialize variant results
      abTest.variants.forEach(variant => {
        abTest.results.variantResults[variant.id] = {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0,
          converted: 0,
          unsubscribed: 0,
          metrics: {}
        };
      });

      // Store test
      this.activeTests.set(testId, abTest);
      this.testingMetrics.totalTests++;
      this.testingMetrics.activeTests++;
      this.testingMetrics.lastTestCreated = new Date().toISOString();

      console.log(`✅ A/B test created: ${abTest.variants.length} variants, ${audience.length} total audience`);

      return {
        testId: testId,
        test: abTest,
        status: 'created',
        recommendedActions: await this.generateTestLaunchRecommendations(abTest)
      };

    } catch (error) {
      console.error(`A/B test creation failed for ${testId}:`, error);
      throw new Error(`A/B test creation failed: ${error.message}`);
    }
  }

  /**
   * Generate AI-powered test variants
   * @param {Object} baseline - Baseline variant
   * @param {Object} testConfig - Test configuration
   * @param {number} variantCount - Number of variants to generate
   * @returns {Array} AI-generated variants
   */
  async generateAITestVariants(baseline, testConfig, variantCount = 2) {
    const prompt = `As a marketing optimization expert, create ${variantCount} high-performing A/B test variants for this baseline:

**Test Type:** ${testConfig.type || 'email'}
**Campaign Goal:** ${testConfig.goal || 'engagement'}
**Primary Metric:** ${testConfig.primaryMetric || 'click_rate'}
**Hypothesis:** ${testConfig.hypothesis || 'Testing for improved performance'}

**Baseline Content:**
${JSON.stringify(baseline, null, 2)}

**Target Audience:**
- Size: ${testConfig.audienceSize || 'medium'}
- Demographics: ${testConfig.demographics || 'general'}
- Behavior: ${testConfig.behaviorProfile || 'mixed'}

**Optimization Areas to Focus:**
1. ${testConfig.type === 'email' ? 'Subject lines and preview text' : 'Message content and CTAs'}
2. ${testConfig.type === 'email' ? 'Email content and layout' : 'Timing and frequency'}
3. Call-to-action optimization
4. Personalization elements
5. Urgency and social proof elements

**Variant Requirements:**
- Each variant should test a specific hypothesis
- Maintain brand voice and compliance
- Focus on measurable improvements
- Consider psychological triggers
- Ensure statistical significance potential

**For each variant, provide:**
{
  "name": "descriptive_variant_name",
  "hypothesis": "what we expect this variant to improve and why",
  "content": {
    ${testConfig.type === 'email' ? '"subject": "optimized subject line", "preheader": "preview text", "htmlContent": "email body", "textContent": "plain text version"' : '"message": "optimized message content"'}
  },
  "optimizations": ["list of specific changes made"],
  "expectedImprovement": number (percentage),
  "confidence": number (1-100),
  "reasoning": "detailed explanation of optimization strategy"
}

**Respond with array of ${variantCount} variants.**`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }]
      });

      const variants = JSON.parse(response.content[0].text);
      
      // Ensure we have an array
      const variantArray = Array.isArray(variants) ? variants : [variants];
      
      // Add AI insights to first variant
      if (variantArray.length > 0) {
        variantArray[0].aiInsights = {
          generationMethod: 'claude_ai_optimization',
          totalVariantsGenerated: variantArray.length,
          optimizationFocus: testConfig.primaryMetric,
          generatedAt: new Date().toISOString()
        };
      }

      console.log(`🧠 AI generated ${variantArray.length} test variants`);
      return variantArray;

    } catch (error) {
      console.error('AI variant generation failed:', error);
      
      // Fallback to simple variants
      return [{
        name: 'Simple Variant',
        hypothesis: 'Basic optimization should improve performance',
        content: this.createSimpleVariant(baseline, testConfig),
        optimizations: ['Minor content adjustments'],
        expectedImprovement: 5,
        confidence: 60,
        reasoning: 'Fallback variant due to AI generation failure',
        fallbackUsed: true
      }];
    }
  }

  /**
   * Record test results and analyze performance
   * @param {string} testId - Test identifier
   * @param {string} variantId - Variant identifier
   * @param {Object} eventData - Event data (open, click, convert, etc.)
   * @returns {Object} Recording result
   */
  async recordTestResult(testId, variantId, eventData) {
    const test = this.activeTests.get(testId);
    if (!test) {
      console.warn(`Test ${testId} not found`);
      return { recorded: false, reason: 'test_not_found' };
    }

    const variantResults = test.results.variantResults[variantId];
    if (!variantResults) {
      console.warn(`Variant ${variantId} not found in test ${testId}`);
      return { recorded: false, reason: 'variant_not_found' };
    }

    // Record the event
    switch (eventData.type) {
      case 'sent':
        variantResults.sent++;
        test.results.totalSent++;
        break;
      case 'delivered':
        variantResults.delivered++;
        break;
      case 'opened':
        variantResults.opened++;
        break;
      case 'clicked':
        variantResults.clicked++;
        break;
      case 'converted':
        variantResults.converted++;
        break;
      case 'unsubscribed':
        variantResults.unsubscribed++;
        break;
    }

    // Update metrics
    this.updateVariantMetrics(variantResults);

    // Check if we should analyze results
    if (this.shouldAnalyzeResults(test)) {
      const analysis = await this.analyzeTestResults(testId);
      
      if (analysis.significanceReached) {
        test.results.significanceReached = true;
        test.results.winner = analysis.winner;
        
        // Auto-optimization if enabled
        if (this.config.autoOptimization) {
          await this.handleAutoOptimization(testId, analysis);
        }
      }
    }

    return {
      recorded: true,
      testId: testId,
      variantId: variantId,
      eventType: eventData.type,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Analyze A/B test results with statistical significance
   * @param {string} testId - Test identifier
   * @returns {Object} Analysis results
   */
  async analyzeTestResults(testId) {
    const test = this.activeTests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    console.log(`📊 Analyzing A/B test results for ${testId}...`);

    // Calculate statistical significance
    const statisticalAnalysis = this.calculateStatisticalSignificance(test);
    
    // Generate AI-powered insights
    const aiInsights = await this.generateTestInsights(test, statisticalAnalysis);
    
    // Determine winner
    const winner = this.determineWinner(test, statisticalAnalysis);
    
    const analysis = {
      testId: testId,
      testName: test.name,
      analysisDate: new Date().toISOString(),
      testDuration: Math.floor((Date.now() - new Date(test.startDate).getTime()) / (1000 * 60 * 60 * 24)),
      
      // Statistical results
      statistical: statisticalAnalysis,
      significanceReached: statisticalAnalysis.hasSignificantResult,
      
      // Winner determination
      winner: winner,
      improvement: winner ? statisticalAnalysis.variants[winner.variantId]?.improvement : 0,
      
      // Detailed insights
      insights: aiInsights,
      
      // Recommendations
      recommendations: await this.generateTestRecommendations(test, statisticalAnalysis, winner)
    };

    // Store analysis
    this.testResults.set(testId, analysis);

    console.log(`📊 Analysis complete: ${analysis.significanceReached ? 'Significant' : 'Inconclusive'} result`);
    
    return analysis;
  }

  /**
   * Split audience intelligently for A/B testing
   * @param {Array} audience - Full audience
   * @param {number} variantCount - Number of variants (including control)
   * @param {Object} testConfig - Test configuration
   * @returns {Array} Audience splits
   */
  async splitAudienceIntelligently(audience, variantCount, testConfig) {
    console.log(`👥 Intelligently splitting audience of ${audience.length} into ${variantCount} groups...`);

    // Calculate split sizes
    const baseSize = Math.floor(audience.length / variantCount);
    const remainder = audience.length % variantCount;
    
    // Shuffle audience for randomization
    const shuffled = this.shuffleArray([...audience]);
    
    // Create splits
    const splits = [];
    let startIndex = 0;
    
    for (let i = 0; i < variantCount; i++) {
      const splitSize = baseSize + (i < remainder ? 1 : 0);
      splits.push(shuffled.slice(startIndex, startIndex + splitSize));
      startIndex += splitSize;
    }

    // Validate splits are balanced
    this.validateAudienceSplits(splits, testConfig);

    console.log(`✅ Audience split complete: ${splits.map(s => s.length).join(', ')} per variant`);
    
    return splits;
  }

  /**
   * Calculate required sample sizes for statistical significance
   */
  calculateSampleSizes(totalAudience, expectedImprovement, variantCount) {
    // Simplified power analysis calculation
    const alpha = this.config.significanceThreshold;
    const beta = 0.2; // 80% power
    const baseConversionRate = 0.03; // Assumed baseline 3%
    
    // Calculate required sample size per variant
    const effect_size = expectedImprovement;
    const z_alpha = 1.96; // 95% confidence
    const z_beta = 0.84; // 80% power
    
    const n_per_variant = Math.ceil(
      (2 * Math.pow(z_alpha + z_beta, 2) * baseConversionRate * (1 - baseConversionRate)) / 
      Math.pow(effect_size, 2)
    );
    
    const totalRequired = n_per_variant * variantCount;
    const trafficSplit = Math.round(100 / variantCount);
    
    return {
      requiredSampleSize: Math.min(n_per_variant, Math.floor(totalAudience / variantCount)),
      totalRequired: Math.min(totalRequired, totalAudience),
      trafficSplit: trafficSplit,
      expectedDuration: Math.ceil(totalRequired / (totalAudience * 0.1)), // Assuming 10% daily send rate
      powerAnalysis: {
        alpha: alpha,
        beta: beta,
        effect_size: effect_size,
        baseConversionRate: baseConversionRate
      }
    };
  }

  /**
   * Calculate statistical significance using two-proportion z-test
   */
  calculateStatisticalSignificance(test) {
    const variants = test.variants.map(variant => ({
      id: variant.id,
      name: variant.name,
      results: test.results.variantResults[variant.id]
    }));

    const controlResults = variants.find(v => v.id === 'control')?.results;
    if (!controlResults) {
      return { hasSignificantResult: false, reason: 'no_control_data' };
    }

    const primaryMetric = test.primaryMetric;
    const controlRate = this.calculateMetricRate(controlResults, primaryMetric);
    
    const variantAnalysis = {};
    let hasSignificantResult = false;

    variants.forEach(variant => {
      if (variant.id === 'control') return;
      
      const variantRate = this.calculateMetricRate(variant.results, primaryMetric);
      const zScore = this.calculateZScore(
        controlRate, controlResults.sent,
        variantRate, variant.results.sent
      );
      
      const pValue = this.calculatePValue(zScore);
      const isSignificant = pValue < this.config.significanceThreshold;
      
      if (isSignificant) hasSignificantResult = true;
      
      variantAnalysis[variant.id] = {
        rate: variantRate,
        improvement: ((variantRate - controlRate) / controlRate * 100),
        zScore: zScore,
        pValue: pValue,
        isSignificant: isSignificant,
        confidenceLevel: (1 - pValue) * 100,
        sampleSize: variant.results.sent
      };
    });

    return {
      hasSignificantResult,
      controlRate,
      variants: variantAnalysis,
      testPower: this.calculateTestPower(test),
      minimumDetectableEffect: this.calculateMinimumDetectableEffect(test)
    };
  }

  /**
   * Generate comprehensive test insights using AI
   */
  async generateTestInsights(test, statisticalAnalysis) {
    const prompt = `Analyze this A/B test results and provide comprehensive insights:

**Test Details:**
- Name: ${test.name}
- Type: ${test.type}
- Primary Metric: ${test.primaryMetric}
- Duration: ${Math.floor((Date.now() - new Date(test.startDate).getTime()) / (1000 * 60 * 60 * 24))} days

**Statistical Results:**
${JSON.stringify(statisticalAnalysis, null, 2)}

**Variant Performance:**
${test.variants.map(v => {
  const results = test.results.variantResults[v.id];
  return `- ${v.name}: Sent: ${results.sent}, Opened: ${results.opened}, Clicked: ${results.clicked}`;
}).join('\n')}

**Analysis Required:**
1. Key insights from the test results
2. Performance drivers and optimization opportunities  
3. Statistical validity assessment
4. Learnings for future tests
5. Recommended actions based on results

**Respond with:**
{
  "keyInsights": ["insight1", "insight2", "insight3"],
  "performanceDrivers": ["driver1", "driver2"],
  "statisticalAssessment": {
    "validity": "high|medium|low",
    "confidence": number (1-100),
    "reliability": "high|medium|low",
    "concerns": ["concern1", "concern2"]
  },
  "learnings": ["learning1", "learning2"],
  "actionableRecommendations": [
    {
      "action": "specific_action",
      "rationale": "why this action",
      "priority": "high|medium|low",
      "expectedImpact": "description"
    }
  ],
  "futureTestIdeas": ["idea1", "idea2"],
  "confidenceScore": number (1-100)
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1200,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      return JSON.parse(response.content[0].text);
    } catch (error) {
      console.error('Test insights generation failed:', error);
      return {
        keyInsights: ['AI analysis unavailable'],
        statisticalAssessment: { validity: 'unknown', confidence: 50 },
        learnings: [],
        actionableRecommendations: []
      };
    }
  }

  /**
   * Get service health and testing metrics
   */
  getServiceHealth() {
    return {
      service: 'ABTestingService',
      status: 'healthy',
      metrics: {
        ...this.testingMetrics,
        activeTests: this.activeTests.size,
        completedTests: this.testResults.size
      },
      activeTests: Array.from(this.activeTests.keys()),
      config: this.config,
      capabilities: [
        'ai_variant_generation',
        'intelligent_audience_splitting',
        'statistical_significance_testing',
        'automated_analysis',
        'performance_insights',
        'auto_optimization'
      ]
    };
  }

  // Utility methods
  validateTestConfiguration(testConfig, baselineVariant, audience) {
    if (!testConfig.name) throw new Error('Test name is required');
    if (!testConfig.primaryMetric) throw new Error('Primary metric is required');
    if (!baselineVariant) throw new Error('Baseline variant is required');
    if (!audience || audience.length < this.config.minimumSampleSize) {
      throw new Error(`Minimum audience size of ${this.config.minimumSampleSize} required`);
    }
  }

  createSimpleVariant(baseline, testConfig) {
    // Create a simple variant by modifying the baseline
    const variant = JSON.parse(JSON.stringify(baseline));
    
    if (testConfig.type === 'email' && variant.subject) {
      variant.subject = variant.subject + ' - Don\'t Miss Out!';
    } else if (variant.message) {
      variant.message = variant.message + ' Act now!';
    }
    
    return variant;
  }

  updateVariantMetrics(variantResults) {
    const sent = variantResults.sent || 0;
    
    variantResults.metrics = {
      deliveryRate: sent > 0 ? (variantResults.delivered / sent * 100) : 0,
      openRate: sent > 0 ? (variantResults.opened / sent * 100) : 0,
      clickRate: sent > 0 ? (variantResults.clicked / sent * 100) : 0,
      conversionRate: sent > 0 ? (variantResults.converted / sent * 100) : 0,
      unsubscribeRate: sent > 0 ? (variantResults.unsubscribed / sent * 100) : 0
    };
  }

  calculateMetricRate(results, metric) {
    const sent = results.sent || 0;
    if (sent === 0) return 0;
    
    switch (metric) {
      case 'open_rate':
        return results.opened / sent;
      case 'click_rate':
        return results.clicked / sent;
      case 'conversion_rate':
        return results.converted / sent;
      default:
        return results.clicked / sent; // Default to click rate
    }
  }

  calculateZScore(controlRate, controlSize, variantRate, variantSize) {
    const pooledRate = (controlRate * controlSize + variantRate * variantSize) / (controlSize + variantSize);
    const standardError = Math.sqrt(pooledRate * (1 - pooledRate) * (1/controlSize + 1/variantSize));
    
    return standardError > 0 ? (variantRate - controlRate) / standardError : 0;
  }

  calculatePValue(zScore) {
    // Two-tailed test
    return 2 * (1 - this.normalCDF(Math.abs(zScore)));
  }

  normalCDF(z) {
    // Approximation of the standard normal cumulative distribution function
    return (1.0 + this.erf(z / Math.sqrt(2.0))) / 2.0;
  }

  erf(x) {
    // Approximation of the error function
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  shouldAnalyzeResults(test) {
    // Analyze if we have sufficient data or test duration
    const minDuration = 2; // days
    const testAge = (Date.now() - new Date(test.startDate).getTime()) / (1000 * 60 * 60 * 24);
    const hasMinimumData = test.results.totalSent >= this.config.minimumSampleSize;
    
    return testAge >= minDuration && hasMinimumData;
  }

  determineWinner(test, statisticalAnalysis) {
    if (!statisticalAnalysis.hasSignificantResult) return null;
    
    const controlRate = statisticalAnalysis.controlRate;
    let bestVariant = null;
    let bestImprovement = 0;
    
    Object.entries(statisticalAnalysis.variants).forEach(([variantId, analysis]) => {
      if (analysis.isSignificant && analysis.improvement > bestImprovement) {
        bestVariant = {
          variantId,
          improvement: analysis.improvement,
          confidence: analysis.confidenceLevel
        };
        bestImprovement = analysis.improvement;
      }
    });
    
    return bestVariant;
  }

  validateAudienceSplits(splits, testConfig) {
    // Ensure splits are reasonably balanced
    const sizes = splits.map(s => s.length);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const maxDeviation = sizes.reduce((max, size) => Math.max(max, Math.abs(size - avgSize)), 0);
    
    if (maxDeviation > avgSize * 0.1) {
      console.warn('Audience splits may be unbalanced');
    }
  }

  generateTestId() {
    return `ab_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async generateTestLaunchRecommendations(test) {
    return [
      `Launch test immediately to begin collecting data`,
      `Monitor results after ${Math.ceil(test.statistics.sampleSizeCalculations.expectedDuration)} days`,
      `Ensure ${test.statistics.requiredSampleSize} minimum sample size per variant`
    ];
  }

  async generateTestRecommendations(test, statisticalAnalysis, winner) {
    const recommendations = [];
    
    if (winner) {
      recommendations.push(`Implement winning variant: ${winner.variantId} (${winner.improvement.toFixed(1)}% improvement)`);
    } else {
      recommendations.push('Continue test or implement control - no significant winner detected');
    }
    
    return recommendations;
  }

  calculateTestPower(test) {
    // Simplified test power calculation
    return 0.8; // 80% power assumption
  }

  calculateMinimumDetectableEffect(test) {
    // Minimum effect size detectable with current sample size
    return 0.05; // 5% minimum detectable effect
  }

  async handleAutoOptimization(testId, analysis) {
    console.log(`🤖 Auto-optimization triggered for test ${testId}`);
    // Implementation would automatically apply winning variant
  }
}

module.exports = ABTestingService;