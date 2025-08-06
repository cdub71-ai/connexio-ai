/**
 * SMS Auto-Response Handler Service
 * Intelligent keyword-based auto-response system with AI enhancement
 */

const { default: Anthropic } = require('@anthropic-ai/sdk');

class SMSAutoResponseHandler {
  constructor(twilioService, options = {}) {
    this.twilio = twilioService;
    this.claude = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.config = {
      enableAIEnhancement: options.enableAIEnhancement !== false,
      defaultResponseDelay: options.defaultResponseDelay || 1000, // 1 second
      maxResponseLength: options.maxResponseLength || 1600, // SMS limit
      enableContextualResponses: options.enableContextualResponses !== false,
      enableLearning: options.enableLearning !== false,
      rateLimitPerNumber: options.rateLimitPerNumber || 5 // responses per hour per number
    };

    // Auto-response storage and management
    this.keywordResponses = new Map();
    this.contextualResponses = new Map();
    this.responseHistory = new Map();
    this.rateLimitTracker = new Map();
    
    // AI learning and improvement
    this.conversationContext = new Map();
    this.responseEffectiveness = new Map();
    this.learningData = new Map();

    // Performance metrics
    this.responseMetrics = {
      totalResponsesSent: 0,
      keywordMatches: 0,
      contextualResponses: 0,
      aiEnhancedResponses: 0,
      responseEffectivenessScore: 0,
      averageResponseTime: 0
    };

    // Initialize default responses
    this.initializeDefaultResponses();

    console.log('🤖 SMS Auto-Response Handler initialized');
  }

  /**
   * Process incoming SMS and generate appropriate auto-response
   * @param {Object} incomingMessage - Incoming SMS webhook data
   * @returns {Object} Response processing result
   */
  async processIncomingMessage(incomingMessage) {
    const startTime = Date.now();
    const fromNumber = incomingMessage.From;
    const messageBody = incomingMessage.Body.trim();
    const messageSid = incomingMessage.MessageSid;

    console.log(`📨 Processing incoming message from ${fromNumber}: "${messageBody}"`);

    try {
      // Step 1: Check rate limiting
      const rateLimitCheck = this.checkRateLimit(fromNumber);
      if (!rateLimitCheck.allowed) {
        console.log(`⏸️ Rate limit exceeded for ${fromNumber}`);
        return {
          processed: false,
          reason: 'rate_limit_exceeded',
          nextAllowedTime: rateLimitCheck.nextAllowedTime
        };
      }

      // Step 2: Update conversation context
      await this.updateConversationContext(fromNumber, messageBody, 'inbound');

      // Step 3: Analyze message intent and content
      const messageAnalysis = await this.analyzeIncomingMessage(messageBody, fromNumber);

      // Step 4: Find matching auto-response
      const responseMatch = await this.findBestResponse(messageBody, messageAnalysis, fromNumber);

      if (!responseMatch) {
        console.log(`❓ No suitable auto-response found for: "${messageBody}"`);
        return {
          processed: false,
          reason: 'no_matching_response',
          messageAnalysis: messageAnalysis
        };
      }

      // Step 5: Generate and send response
      const responseResult = await this.generateAndSendResponse(
        fromNumber,
        responseMatch,
        messageAnalysis,
        incomingMessage
      );

      // Step 6: Update metrics and learning data
      await this.updateResponseMetrics(responseResult, Date.now() - startTime);
      await this.updateLearningData(fromNumber, messageBody, responseMatch, responseResult);

      console.log(`✅ Auto-response sent successfully: ${responseMatch.type} (${responseResult.responseId})`);

      return {
        processed: true,
        responseType: responseMatch.type,
        responseId: responseResult.responseId,
        messageId: responseResult.messageId,
        processingTime: Date.now() - startTime,
        confidence: responseMatch.confidence
      };

    } catch (error) {
      console.error('Auto-response processing failed:', error);
      
      // Send fallback response if configured
      const fallbackResult = await this.sendFallbackResponse(fromNumber, error);
      
      return {
        processed: false,
        error: error.message,
        fallbackSent: fallbackResult.sent,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Configure keyword-based auto-responses
   * @param {Object} responseConfig - Auto-response configuration
   */
  configureAutoResponses(responseConfig) {
    console.log('⚙️ Configuring auto-responses...');

    // Configure keyword responses
    if (responseConfig.keywordResponses) {
      Object.entries(responseConfig.keywordResponses).forEach(([keyword, response]) => {
        this.addKeywordResponse(keyword, response);
      });
    }

    // Configure contextual responses
    if (responseConfig.contextualResponses) {
      responseConfig.contextualResponses.forEach(contextResponse => {
        this.addContextualResponse(contextResponse);
      });
    }

    // Set default response
    if (responseConfig.defaultResponse) {
      this.keywordResponses.set('_default', {
        keyword: '_default',
        response: responseConfig.defaultResponse,
        type: 'default',
        priority: 0,
        conditions: []
      });
    }

    console.log(`✅ Configured ${this.keywordResponses.size} keyword responses and ${this.contextualResponses.size} contextual responses`);
  }

  /**
   * Add keyword-based response
   */
  addKeywordResponse(keyword, responseConfig) {
    const normalizedKeyword = keyword.toLowerCase().trim();
    
    const response = {
      keyword: normalizedKeyword,
      response: responseConfig.response || responseConfig,
      type: 'keyword',
      priority: responseConfig.priority || 1,
      exactMatch: responseConfig.exactMatch || false,
      caseSensitive: responseConfig.caseSensitive || false,
      conditions: responseConfig.conditions || [],
      customData: responseConfig.customData || {}
    };

    this.keywordResponses.set(normalizedKeyword, response);
    console.log(`📝 Added keyword response: "${keyword}"`);
  }

  /**
   * Add contextual response pattern
   */
  addContextualResponse(contextConfig) {
    const contextResponse = {
      id: contextConfig.id || `context_${Date.now()}`,
      patterns: contextConfig.patterns || [],
      intent: contextConfig.intent,
      response: contextConfig.response,
      type: 'contextual',
      priority: contextConfig.priority || 2,
      conditions: contextConfig.conditions || [],
      aiEnhanced: contextConfig.aiEnhanced !== false
    };

    this.contextualResponses.set(contextResponse.id, contextResponse);
    console.log(`🧠 Added contextual response: ${contextResponse.intent}`);
  }

  /**
   * Analyze incoming message using AI
   */
  async analyzeIncomingMessage(messageBody, fromNumber) {
    if (!this.config.enableAIEnhancement) {
      return { intent: 'unknown', sentiment: 'neutral', urgency: 'normal' };
    }

    const prompt = `Analyze this incoming SMS message for auto-response handling:

**Message:** "${messageBody}"
**Sender:** ${fromNumber}

**Analysis Required:**
1. Primary intent/purpose of the message
2. Emotional sentiment (positive/negative/neutral)
3. Urgency level (high/medium/low)
4. Question type (if applicable)
5. Keywords and key phrases
6. Suggested response approach

**Respond with:**
{
  "intent": "primary_intent_category",
  "intentDescription": "detailed_description",
  "sentiment": "positive|negative|neutral",
  "urgency": "high|medium|low",
  "questionType": "yes_no|information|support|complaint|other",
  "keywords": ["key1", "key2", "key3"],
  "keyPhrases": ["phrase1", "phrase2"],
  "suggestedApproach": "response_strategy",
  "confidence": number (1-100),
  "requiresHumanResponse": boolean
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      const analysis = JSON.parse(response.content[0].text);
      console.log(`🧠 AI analysis: ${analysis.intent} (${analysis.sentiment}, ${analysis.urgency})`);
      
      return analysis;

    } catch (error) {
      console.error('AI message analysis failed:', error);
      return {
        intent: 'unknown',
        sentiment: 'neutral',
        urgency: 'normal',
        confidence: 0,
        error: 'analysis_failed'
      };
    }
  }

  /**
   * Find best matching auto-response
   */
  async findBestResponse(messageBody, messageAnalysis, fromNumber) {
    const normalizedMessage = messageBody.toLowerCase().trim();
    const possibleResponses = [];

    // Check keyword responses first
    for (const [keyword, response] of this.keywordResponses) {
      const match = this.checkKeywordMatch(normalizedMessage, keyword, response);
      if (match.matched) {
        possibleResponses.push({
          ...response,
          matchScore: match.score,
          matchType: 'keyword'
        });
      }
    }

    // Check contextual responses
    for (const [contextId, contextResponse] of this.contextualResponses) {
      const match = await this.checkContextualMatch(messageBody, messageAnalysis, contextResponse);
      if (match.matched) {
        possibleResponses.push({
          ...contextResponse,
          matchScore: match.score,
          matchType: 'contextual'
        });
      }
    }

    // Sort by priority and match score
    possibleResponses.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return b.matchScore - a.matchScore; // Higher match score first
    });

    // Return best match or default
    const bestMatch = possibleResponses[0];
    if (bestMatch) {
      return {
        ...bestMatch,
        confidence: bestMatch.matchScore,
        type: bestMatch.matchType
      };
    }

    // Fallback to default response
    const defaultResponse = this.keywordResponses.get('_default');
    if (defaultResponse) {
      return {
        ...defaultResponse,
        confidence: 0.3,
        type: 'default'
      };
    }

    return null;
  }

  /**
   * Check keyword match with various matching strategies
   */
  checkKeywordMatch(message, keyword, response) {
    if (keyword === '_default') {
      return { matched: false, score: 0 };
    }

    let matched = false;
    let score = 0;

    if (response.exactMatch) {
      // Exact match
      matched = message === keyword;
      score = matched ? 1.0 : 0;
    } else {
      // Partial match
      if (message.includes(keyword)) {
        matched = true;
        // Score based on keyword coverage
        score = keyword.length / message.length;
        score = Math.min(score, 1.0);
      }
      
      // Check for word boundaries for better matching
      const wordBoundaryRegex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (wordBoundaryRegex.test(message)) {
        matched = true;
        score = Math.max(score, 0.8); // Higher score for word boundary matches
      }
    }

    return { matched, score };
  }

  /**
   * Check contextual response match using AI
   */
  async checkContextualMatch(messageBody, messageAnalysis, contextResponse) {
    if (!contextResponse.aiEnhanced) {
      // Simple pattern matching for non-AI contextual responses
      const patterns = contextResponse.patterns || [];
      const matched = patterns.some(pattern => {
        const regex = new RegExp(pattern, 'i');
        return regex.test(messageBody);
      });
      
      return { matched, score: matched ? 0.6 : 0 };
    }

    // AI-enhanced contextual matching
    const prompt = `Determine if this message matches the contextual response intent:

**Message:** "${messageBody}"
**Message Analysis:** ${JSON.stringify(messageAnalysis, null, 2)}

**Contextual Response Intent:** ${contextResponse.intent}
**Response Patterns:** ${contextResponse.patterns?.join(', ') || 'None specified'}

**Evaluation Criteria:**
1. Does the message intent align with the response intent?
2. Do any patterns match the message content?
3. Is the contextual response appropriate for this message?

**Respond with:**
{
  "matched": boolean,
  "confidence": number (0-100),
  "reasoning": "explanation_of_match_decision",
  "appropriateness": "high|medium|low"
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 400,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      });

      const matchResult = JSON.parse(response.content[0].text);
      return {
        matched: matchResult.matched,
        score: matchResult.confidence / 100,
        reasoning: matchResult.reasoning
      };

    } catch (error) {
      console.error('AI contextual matching failed:', error);
      return { matched: false, score: 0 };
    }
  }

  /**
   * Generate and send auto-response
   */
  async generateAndSendResponse(fromNumber, responseMatch, messageAnalysis, originalMessage) {
    const responseId = this.generateResponseId();
    
    // Personalize response if needed
    let responseText = await this.personalizeResponse(
      responseMatch.response,
      fromNumber,
      messageAnalysis,
      originalMessage
    );

    // Apply AI enhancement if enabled
    if (this.config.enableAIEnhancement && responseMatch.type !== 'default') {
      responseText = await this.enhanceResponseWithAI(
        responseText,
        messageAnalysis,
        fromNumber
      );
    }

    // Ensure response length compliance
    if (responseText.length > this.config.maxResponseLength) {
      responseText = responseText.substring(0, this.config.maxResponseLength - 3) + '...';
    }

    // Add delay if configured
    if (this.config.defaultResponseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.defaultResponseDelay));
    }

    // Send response via Twilio
    const sendResult = await this.sendResponseMessage(fromNumber, responseText, responseId);

    // Update conversation context
    await this.updateConversationContext(fromNumber, responseText, 'outbound');

    // Update rate limiting
    this.updateRateLimit(fromNumber);

    return {
      responseId: responseId,
      messageId: sendResult.messageId,
      responseText: responseText,
      sentAt: new Date().toISOString(),
      success: sendResult.success
    };
  }

  /**
   * Enhance response with AI for better personalization
   */
  async enhanceResponseWithAI(baseResponse, messageAnalysis, fromNumber) {
    const prompt = `Enhance this auto-response to be more natural and helpful:

**Base Response:** "${baseResponse}"
**Message Analysis:** ${JSON.stringify(messageAnalysis, null, 2)}
**Customer:** ${fromNumber}

**Enhancement Guidelines:**
1. Keep the core message and intent
2. Make it sound more natural and conversational
3. Match the sender's tone/sentiment appropriately
4. Keep within SMS length limits (160 characters preferred)
5. Maintain professional but friendly tone

**Enhanced Response (max 160 chars):**`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 200,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }]
      });

      const enhancedResponse = response.content[0].text.trim();
      
      // Return enhanced response if reasonable length, otherwise original
      if (enhancedResponse.length <= this.config.maxResponseLength) {
        this.responseMetrics.aiEnhancedResponses++;
        return enhancedResponse;
      } else {
        return baseResponse;
      }

    } catch (error) {
      console.error('AI response enhancement failed:', error);
      return baseResponse;
    }
  }

  /**
   * Send response message via Twilio
   */
  async sendResponseMessage(toNumber, messageText, responseId) {
    try {
      const messageParams = {
        body: messageText,
        to: toNumber,
        // from will be set by Twilio service based on configuration
      };

      const result = await this.twilio.sendMessage(messageParams);

      return {
        success: true,
        messageId: result.sid,
        status: result.status
      };

    } catch (error) {
      console.error('Failed to send auto-response:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update conversation context for better contextual responses
   */
  async updateConversationContext(phoneNumber, message, direction) {
    const context = this.conversationContext.get(phoneNumber) || {
      messages: [],
      lastInteraction: null,
      totalInteractions: 0
    };

    context.messages.push({
      message: message,
      direction: direction,
      timestamp: new Date().toISOString()
    });

    // Keep only recent messages (last 10)
    if (context.messages.length > 10) {
      context.messages = context.messages.slice(-10);
    }

    context.lastInteraction = new Date().toISOString();
    context.totalInteractions++;

    this.conversationContext.set(phoneNumber, context);
  }

  /**
   * Personalize response based on conversation context
   */
  async personalizeResponse(baseResponse, fromNumber, messageAnalysis, originalMessage) {
    const context = this.conversationContext.get(fromNumber);
    
    // Simple personalization - replace placeholders
    let personalized = baseResponse;
    
    // Replace common placeholders
    personalized = personalized.replace(/\{time\}/g, this.getTimeBasedGreeting());
    personalized = personalized.replace(/\{number\}/g, fromNumber);
    
    // Add context-based personalization
    if (context && context.totalInteractions > 1) {
      personalized = personalized.replace(/Hi/g, 'Hi again');
    }

    return personalized;
  }

  /**
   * Check and enforce rate limiting
   */
  checkRateLimit(phoneNumber) {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);
    
    let interactions = this.rateLimitTracker.get(phoneNumber) || [];
    
    // Remove old interactions
    interactions = interactions.filter(timestamp => timestamp > hourAgo);
    
    const allowed = interactions.length < this.config.rateLimitPerNumber;
    
    return {
      allowed: allowed,
      currentCount: interactions.length,
      limit: this.config.rateLimitPerNumber,
      nextAllowedTime: allowed ? now : interactions[0] + (60 * 60 * 1000)
    };
  }

  /**
   * Update rate limiting tracker
   */
  updateRateLimit(phoneNumber) {
    const now = Date.now();
    let interactions = this.rateLimitTracker.get(phoneNumber) || [];
    
    interactions.push(now);
    
    // Keep only recent interactions
    const hourAgo = now - (60 * 60 * 1000);
    interactions = interactions.filter(timestamp => timestamp > hourAgo);
    
    this.rateLimitTracker.set(phoneNumber, interactions);
  }

  /**
   * Send fallback response in case of errors
   */
  async sendFallbackResponse(toNumber, error) {
    const fallbackMessage = "Thanks for your message. We'll get back to you soon!";
    
    try {
      const result = await this.sendResponseMessage(toNumber, fallbackMessage, 'fallback');
      return { sent: true, messageId: result.messageId };
    } catch (fallbackError) {
      console.error('Fallback response also failed:', fallbackError);
      return { sent: false, error: fallbackError.message };
    }
  }

  /**
   * Initialize default auto-responses
   */
  initializeDefaultResponses() {
    // Common auto-responses
    const defaultResponses = {
      'stop': 'You have been unsubscribed. Reply START to opt back in.',
      'start': 'Welcome back! You are now subscribed to our updates.',
      'help': 'For help, visit our website or call our support line.',
      'info': 'For more information, please visit our website or contact support.',
      'hours': 'Our business hours are Monday-Friday 9AM-5PM EST.',
      'support': 'For support, please call us or visit our help center online.'
    };

    Object.entries(defaultResponses).forEach(([keyword, response]) => {
      this.addKeywordResponse(keyword, {
        response: response,
        priority: 1,
        exactMatch: false
      });
    });

    console.log(`🔧 Initialized ${Object.keys(defaultResponses).length} default responses`);
  }

  /**
   * Update response metrics and learning data
   */
  async updateResponseMetrics(responseResult, processingTime) {
    this.responseMetrics.totalResponsesSent++;
    this.responseMetrics.averageResponseTime = 
      (this.responseMetrics.averageResponseTime + processingTime) / 2;

    if (responseResult.success) {
      // Track successful responses for learning
      this.responseMetrics.keywordMatches++;
    }
  }

  /**
   * Update learning data for continuous improvement
   */
  async updateLearningData(fromNumber, originalMessage, responseMatch, responseResult) {
    if (!this.config.enableLearning) return;

    const learningEntry = {
      timestamp: new Date().toISOString(),
      fromNumber: fromNumber,
      originalMessage: originalMessage,
      responseType: responseMatch.type,
      responseKeyword: responseMatch.keyword,
      responseConfidence: responseMatch.confidence,
      success: responseResult.success,
      responseId: responseResult.responseId
    };

    const phoneKey = this.hashPhoneNumber(fromNumber);
    let phoneHistory = this.learningData.get(phoneKey) || [];
    phoneHistory.push(learningEntry);
    
    // Keep only recent entries
    if (phoneHistory.length > 50) {
      phoneHistory = phoneHistory.slice(-50);
    }
    
    this.learningData.set(phoneKey, phoneHistory);
  }

  /**
   * Get time-based greeting
   */
  getTimeBasedGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /**
   * Hash phone number for privacy in learning data
   */
  hashPhoneNumber(phoneNumber) {
    // Simple hash for demo - in production use proper hashing
    return Buffer.from(phoneNumber).toString('base64').substring(0, 16);
  }

  /**
   * Generate unique response ID
   */
  generateResponseId() {
    return `auto_response_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Get service health and auto-response metrics
   */
  getServiceHealth() {
    return {
      service: 'SMSAutoResponseHandler',
      status: 'healthy',
      metrics: this.responseMetrics,
      configuration: {
        keywordResponses: this.keywordResponses.size,
        contextualResponses: this.contextualResponses.size,
        activeConversations: this.conversationContext.size,
        rateLimitTracking: this.rateLimitTracker.size
      },
      capabilities: [
        'keyword_matching',
        'contextual_responses',
        'ai_enhanced_responses',
        'rate_limiting',
        'conversation_context',
        'response_personalization',
        'learning_optimization'
      ],
      config: this.config
    };
  }

  /**
   * Generate auto-response performance report
   */
  generatePerformanceReport() {
    const effectiveness = this.calculateResponseEffectiveness();
    const topKeywords = this.getTopPerformingKeywords();
    const conversationStats = this.getConversationStatistics();

    return {
      reportDate: new Date().toISOString(),
      overallMetrics: this.responseMetrics,
      effectiveness: effectiveness,
      topKeywords: topKeywords,
      conversationStats: conversationStats,
      recommendations: this.generateImprovementRecommendations(effectiveness)
    };
  }

  calculateResponseEffectiveness() {
    // Calculate based on response success rates and conversation continuation
    const totalResponses = this.responseMetrics.totalResponsesSent;
    const successfulResponses = this.responseMetrics.keywordMatches;
    
    return {
      successRate: totalResponses > 0 ? (successfulResponses / totalResponses * 100) : 0,
      averageResponseTime: this.responseMetrics.averageResponseTime,
      aiEnhancementRate: totalResponses > 0 ? (this.responseMetrics.aiEnhancedResponses / totalResponses * 100) : 0
    };
  }

  getTopPerformingKeywords() {
    // Analyze keyword performance from learning data
    const keywordStats = new Map();
    
    for (const phoneHistory of this.learningData.values()) {
      phoneHistory.forEach(entry => {
        if (entry.responseKeyword) {
          const stats = keywordStats.get(entry.responseKeyword) || {
            keyword: entry.responseKeyword,
            uses: 0,
            successRate: 0,
            totalConfidence: 0
          };
          
          stats.uses++;
          if (entry.success) stats.successRate++;
          stats.totalConfidence += entry.responseConfidence;
          
          keywordStats.set(entry.responseKeyword, stats);
        }
      });
    }

    // Calculate final statistics and sort
    return Array.from(keywordStats.values())
      .map(stats => ({
        ...stats,
        successRate: (stats.successRate / stats.uses * 100),
        averageConfidence: (stats.totalConfidence / stats.uses * 100)
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 10);
  }

  getConversationStatistics() {
    return {
      activeConversations: this.conversationContext.size,
      totalInteractions: Array.from(this.conversationContext.values())
        .reduce((sum, context) => sum + context.totalInteractions, 0),
      averageInteractionsPerConversation: this.conversationContext.size > 0 
        ? Array.from(this.conversationContext.values())
            .reduce((sum, context) => sum + context.totalInteractions, 0) / this.conversationContext.size 
        : 0
    };
  }

  generateImprovementRecommendations(effectiveness) {
    const recommendations = [];

    if (effectiveness.successRate < 70) {
      recommendations.push({
        area: 'Response Quality',
        recommendation: 'Review and improve keyword matching accuracy',
        priority: 'high'
      });
    }

    if (effectiveness.aiEnhancementRate < 30) {
      recommendations.push({
        area: 'AI Enhancement',
        recommendation: 'Increase AI enhancement usage for better personalization',
        priority: 'medium'
      });
    }

    if (effectiveness.averageResponseTime > 5000) {
      recommendations.push({
        area: 'Performance',
        recommendation: 'Optimize response processing time',
        priority: 'medium'
      });
    }

    return recommendations;
  }
}

module.exports = SMSAutoResponseHandler;