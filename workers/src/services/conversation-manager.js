/**
 * Conversation Manager - Handles thread conversations and context
 * Manages multi-turn conversations for validation inquiries
 */

const { createContextLogger } = require('../utils/logger.js');

class ConversationManager {
  constructor() {
    this.logger = createContextLogger({ service: 'conversation-manager' });
    this.conversations = new Map(); // Store conversation states
    this.botUserId = null; // Will be set when bot starts
    
    // Conversation stages
    this.STAGES = {
      INITIAL: 'initial',
      AWAITING_VALIDATION_DETAILS: 'awaiting_validation_details',
      PROCESSING_DETAILS: 'processing_details',
      READY_FOR_UPLOAD: 'ready_for_upload',
      COMPLETED: 'completed'
    };

    this.logger.info('Conversation manager initialized');
  }

  /**
   * Set bot user ID for filtering
   * @param {string} botUserId - Bot's user ID
   */
  setBotUserId(botUserId) {
    this.botUserId = botUserId;
    this.logger.info('Bot user ID set', { botUserId });
  }

  /**
   * Start validation inquiry conversation
   * @param {Object} context - Conversation context
   * @returns {Object} Initial response
   */
  startValidationInquiry(context) {
    const conversationId = this.generateConversationId(context);
    
    const conversationState = {
      id: conversationId,
      stage: this.STAGES.AWAITING_VALIDATION_DETAILS,
      userId: context.userId,
      channelId: context.channelId,
      threadTs: context.threadTs,
      startedAt: new Date().toISOString(),
      awaitingResponse: true,
      context: {
        originalQuestion: context.text,
        platform: 'slack'
      }
    };

    this.conversations.set(conversationId, conversationState);
    
    this.logger.info('Validation inquiry started', {
      conversationId,
      userId: context.userId
    });

    return {
      response: this.generateValidationInquiryResponse(),
      conversationId
    };
  }

  /**
   * Process user response in thread
   * @param {Object} message - Slack message object
   * @returns {Object} Response object
   */
  async processThreadResponse(message) {
    let conversationId = this.findConversationByThread(message.thread_ts, message.user);
    
    // If no conversation exists, start one automatically (this handles the validation inquiry responses)
    if (!conversationId) {
      // Check if this looks like a response to a validation inquiry
      if (this.looksLikeValidationResponse(message.text)) {
        conversationId = this.startValidationConversationFromThread({
          threadTs: message.thread_ts,
          userId: message.user,
          text: message.text
        });
      } else {
        this.logger.debug('No active conversation found for thread', {
          threadTs: message.thread_ts,
          userId: message.user
        });
        return null;
      }
    }

    const conversation = this.conversations.get(conversationId);
    
    if (!conversation.awaitingResponse) {
      this.logger.debug('Conversation not awaiting response', { conversationId });
      return null;
    }

    // Process based on current stage
    switch (conversation.stage) {
      case this.STAGES.AWAITING_VALIDATION_DETAILS:
        return this.processValidationDetails(conversationId, message.text);
      
      default:
        this.logger.warn('Unknown conversation stage', { 
          stage: conversation.stage, 
          conversationId 
        });
        return null;
    }
  }

  /**
   * Process validation requirements response
   * @param {string} conversationId - Conversation ID
   * @param {string} userResponse - User's response text
   * @returns {Object} Response object
   */
  processValidationDetails(conversationId, userResponse) {
    const conversation = this.conversations.get(conversationId);
    
    // Parse validation requirements from user response
    const requirements = this.parseValidationRequirements(userResponse);
    
    // Update conversation state
    conversation.stage = this.STAGES.READY_FOR_UPLOAD;
    conversation.awaitingResponse = false;
    conversation.validationRequirements = requirements;
    conversation.updatedAt = new Date().toISOString();
    
    this.conversations.set(conversationId, conversation);
    
    this.logger.info('Validation details processed', {
      conversationId,
      requirements: {
        dataType: requirements.dataType,
        volume: requirements.volume,
        issues: requirements.issues
      }
    });

    return {
      response: this.generateValidationRecommendation(requirements),
      conversationId
    };
  }

  /**
   * Parse validation requirements from user text
   * @param {string} text - User response text
   * @returns {Object} Parsed requirements
   */
  parseValidationRequirements(text) {
    const lowerText = text.toLowerCase();
    
    // Extract data type
    let dataType = 'email'; // default
    if (lowerText.includes('contact') || lowerText.includes('lead')) {
      dataType = 'contact';
    } else if (lowerText.includes('phone') || lowerText.includes('mobile')) {
      dataType = 'phone';
    } else if (lowerText.includes('address')) {
      dataType = 'address';
    }

    // Extract volume (look for numbers)
    const volumeMatch = text.match(/(\d+[\d,]*)\s*(?:records?|contacts?|leads?|entries?)/i);
    const volume = volumeMatch ? parseInt(volumeMatch[1].replace(/,/g, '')) : 0;

    // Extract data source
    let source = 'unknown';
    if (lowerText.includes('trade show') || lowerText.includes('tradeshow')) {
      source = 'trade_show';
    } else if (lowerText.includes('webinar') || lowerText.includes('event')) {
      source = 'event';
    } else if (lowerText.includes('website') || lowerText.includes('form')) {
      source = 'website';
    } else if (lowerText.includes('purchased') || lowerText.includes('bought')) {
      source = 'purchased_list';
    }

    // Extract issues/concerns
    const issues = [];
    if (lowerText.includes('deliverability') || lowerText.includes('bounce')) {
      issues.push('deliverability');
    }
    if (lowerText.includes('duplicate') || lowerText.includes('duplicates')) {
      issues.push('duplicates');
    }
    if (lowerText.includes('invalid') || lowerText.includes('bad')) {
      issues.push('invalid_data');
    }
    if (lowerText.includes('compliance') || lowerText.includes('gdpr')) {
      issues.push('compliance');
    }

    return {
      dataType,
      volume,
      source,
      issues,
      rawText: text,
      parsedAt: new Date().toISOString()
    };
  }

  /**
   * Generate validation recommendation based on requirements
   * @param {Object} requirements - Parsed validation requirements
   * @returns {string} Recommendation response
   */
  generateValidationRecommendation(requirements) {
    const { dataType, volume, source, issues } = requirements;
    
    // Calculate expected results based on data source
    const sourceStats = this.getSourceStatistics(source, volume);
    
    let response = `🎯 **Perfect! I can definitely help with your ${dataType} validation needs.**\n\n`;
    
    response += `**Your Situation Analysis:**\n`;
    response += `• **Volume**: ${volume.toLocaleString()} records ${this.getBatchSizeRecommendation(volume)}\n`;
    response += `• **Data Source**: ${this.getSourceDescription(source)}\n`;
    response += `• **Issues**: ${issues.map(issue => this.getIssueDescription(issue)).join(', ')}\n\n`;
    
    response += `**Expected Results:**\n`;
    response += `• **Duplicates**: ~${sourceStats.duplicates.toLocaleString()} removed (${sourceStats.duplicateRate}% typical for ${this.getSourceDescription(source)})\n`;
    response += `• **Invalid Emails**: ~${sourceStats.invalid.toLocaleString()} flagged (${sourceStats.invalidRate}% typical rate)\n`;
    response += `• **Clean Records**: ~${sourceStats.clean.toLocaleString()} campaign-ready contacts\n`;
    response += `• **Cost Savings**: ${sourceStats.costSavings}% vs validating all records\n\n`;
    
    // Add campaign routing and processing recommendations
    response += this.generateCampaignRouting(source, issues, volume);
    
    response += `**Next Steps:**\n`;
    response += `1. Upload your CSV file to this channel\n`;
    response += `2. Use \`/validate-file start\` for immediate processing\n`;
    response += `3. Processing time: ${this.getProcessingTime(volume)}\n`;
    response += `4. Receive secure download link with validated results\n\n`;
    
    response += `I'll process your file with enterprise validation + AI deduplication for production-grade results.`;

    return response;
  }

  /**
   * Generate campaign routing and processing recommendations
   * @param {string} source - Data source type
   * @param {Array} issues - Issues identified
   * @param {number} volume - Number of records
   * @returns {string} Campaign routing guidance
   */
  generateCampaignRouting(source, issues, volume) {
    let routing = `**Campaign Routing & Processing:**\n`;
    
    // Route based on data source and issues
    if (source === 'trade_show') {
      routing += `• **Trade Show Follow-up Campaign**: High-intent leads, expect 25-35% duplicate rate\n`;
      routing += `• **Priority**: High (time-sensitive follow-up)\n`;
      routing += `• **Recommended Validation**: Full enterprise validation + AI deduplication\n`;
      routing += `• **Special Processing**: Check for business card scanning errors\n`;
    } else if (source === 'event' || source === 'webinar') {
      routing += `• **Event-based Nurture Campaign**: Engaged audience, moderate duplicates\n`;
      routing += `• **Priority**: Medium-High (engaged leads)\n`;
      routing += `• **Recommended Validation**: Standard enterprise validation\n`;
      routing += `• **Special Processing**: Segment by attendance/engagement\n`;
    } else if (source === 'purchased_list') {
      routing += `• **Cold Outreach Campaign**: Unknown quality, high validation needs\n`;
      routing += `• **Priority**: Low-Medium (requires extra validation)\n`;
      routing += `• **Recommended Validation**: Enhanced enterprise validation + compliance check\n`;
      routing += `• **Special Processing**: Extra duplicate detection, consent verification\n`;
    } else {
      routing += `• **General Campaign**: Standard processing recommended\n`;
      routing += `• **Priority**: Medium\n`;
      routing += `• **Recommended Validation**: Full enterprise validation\n`;
    }
    
    // Add issue-specific routing
    if (issues.includes('deliverability')) {
      routing += `• **Deliverability Focus**: Will prioritize email validation accuracy\n`;
    }
    if (issues.includes('duplicates')) {
      routing += `• **Deduplication Focus**: Enhanced AI duplicate detection enabled\n`;
    }
    if (issues.includes('compliance')) {
      routing += `• **Compliance Check**: Will include GDPR/CCPA compliance validation\n`;
    }
    
    // Volume-based routing
    if (volume > 10000) {
      routing += `• **Enterprise Processing**: Large volume will be processed in optimized batches\n`;
    }
    
    routing += `\n`;
    return routing;
  }

  /**
   * Get source statistics for recommendations
   * @param {string} source - Data source type
   * @param {number} volume - Number of records
   * @returns {Object} Statistics
   */
  getSourceStatistics(source, volume) {
    const stats = {
      trade_show: { duplicateRate: 25, invalidRate: 20, costSavings: 35 },
      event: { duplicateRate: 20, invalidRate: 15, costSavings: 30 },
      website: { duplicateRate: 15, invalidRate: 10, costSavings: 20 },
      purchased_list: { duplicateRate: 30, invalidRate: 25, costSavings: 40 },
      unknown: { duplicateRate: 20, invalidRate: 15, costSavings: 25 }
    };

    const sourceStats = stats[source] || stats.unknown;
    
    return {
      duplicates: Math.round(volume * (sourceStats.duplicateRate / 100)),
      invalid: Math.round(volume * (sourceStats.invalidRate / 100)),
      clean: volume - Math.round(volume * (sourceStats.duplicateRate + sourceStats.invalidRate) / 100),
      duplicateRate: sourceStats.duplicateRate,
      invalidRate: sourceStats.invalidRate,
      costSavings: sourceStats.costSavings
    };
  }

  /**
   * Get batch size recommendation
   * @param {number} volume - Number of records
   * @returns {string} Recommendation text
   */
  getBatchSizeRecommendation(volume) {
    if (volume < 1000) return '(small batch - quick processing)';
    if (volume < 5000) return '(ideal batch size)';
    if (volume < 10000) return '(large batch - may split for processing)';
    return '(enterprise volume - will optimize processing)';
  }

  /**
   * Get source description
   * @param {string} source - Source type
   * @returns {string} Human-readable description
   */
  getSourceDescription(source) {
    const descriptions = {
      trade_show: 'Trade show data',
      event: 'Event/webinar data',
      website: 'Website form data',
      purchased_list: 'Purchased list',
      unknown: 'External data source'
    };
    return descriptions[source] || descriptions.unknown;
  }

  /**
   * Get issue description
   * @param {string} issue - Issue type
   * @returns {string} Human-readable description
   */
  getIssueDescription(issue) {
    const descriptions = {
      deliverability: 'Email deliverability',
      duplicates: 'Duplicate records',
      invalid_data: 'Invalid data',
      compliance: 'Compliance concerns'
    };
    return descriptions[issue] || issue;
  }

  /**
   * Get processing time estimate
   * @param {number} volume - Number of records
   * @returns {string} Time estimate
   */
  getProcessingTime(volume) {
    if (volume < 1000) return '1-2 minutes';
    if (volume < 5000) return '2-4 minutes';
    if (volume < 10000) return '4-6 minutes';
    return '6-10 minutes';
  }

  /**
   * Generate initial validation inquiry response
   * @returns {string} Initial response
   */
  generateValidationInquiryResponse() {
    return `🤖 **Connexio AI - Marketing Operations Expert:**

Thank you for your interest in validation services. To provide the most relevant recommendations, I'd like to understand a few key details about your specific needs:

1. **What type of data** are you looking to validate? (For example: email addresses, physical addresses, phone numbers)
2. **What's the approximate volume** of records you need to validate monthly?
3. **Are you experiencing any specific issues** that prompted this interest? (Such as high bounce rates or deliverability problems)

From my experience working with similar clients, validation services can significantly impact:
• Email deliverability rates (often seeing 15-20% improvement)
• Marketing campaign ROI  
• Database quality and compliance

Once you provide these details, I can recommend the most appropriate validation approach and implementation steps based on what's worked best for companies in similar situations.

Would you mind sharing those details so I can provide more specific guidance?`;
  }

  /**
   * Find conversation by thread and user
   * @param {string} threadTs - Thread timestamp
   * @param {string} userId - User ID
   * @returns {string|null} Conversation ID
   */
  findConversationByThread(threadTs, userId) {
    for (const [conversationId, conversation] of this.conversations.entries()) {
      if (conversation.threadTs === threadTs && conversation.userId === userId) {
        return conversationId;
      }
    }
    return null;
  }

  /**
   * Check if text looks like a validation response
   * @param {string} text - Message text
   * @returns {boolean} True if looks like validation response
   */
  looksLikeValidationResponse(text) {
    const lowerText = text.toLowerCase();
    
    // Look for common indicators of validation responses
    const indicators = [
      'records', 'contacts', 'leads', 'data', 'emails', 'addresses',
      'trade show', 'tradeshow', 'event', 'webinar', 'list', 'database', 
      'duplicate', 'duplicates', 'bounce', 'deliverability', 'validation',
      'csv', 'excel', 'file', 'upload', 'contact data', 'received from'
    ];

    // Check for specific patterns that indicate validation responses
    const patterns = [
      /\d+\s*(records?|contacts?|leads?|entries?)/i,
      /contact\s+data/i,
      /trade\s*show/i,
      /deliverability/i,
      /duplicate/i,
      /fields.*validate/i,
      /validate.*fields/i,
      /approximately?\s*\d+/i
    ];

    return indicators.some(indicator => lowerText.includes(indicator)) ||
           patterns.some(pattern => pattern.test(text));
  }

  /**
   * Start validation conversation from thread response
   * @param {Object} context - Thread context
   * @returns {string} Conversation ID
   */
  startValidationConversationFromThread(context) {
    const conversationId = this.generateConversationId(context);
    
    const conversationState = {
      id: conversationId,
      stage: this.STAGES.AWAITING_VALIDATION_DETAILS,
      userId: context.userId,
      threadTs: context.threadTs,
      startedAt: new Date().toISOString(),
      awaitingResponse: true,
      context: {
        originalResponse: context.text,
        startedFromThread: true,
        platform: 'slack'
      }
    };

    this.conversations.set(conversationId, conversationState);
    
    this.logger.info('Validation conversation started from thread', {
      conversationId,
      userId: context.userId,
      threadTs: context.threadTs
    });

    return conversationId;
  }

  /**
   * Generate conversation ID
   * @param {Object} context - Context object
   * @returns {string} Conversation ID
   */
  generateConversationId(context) {
    return `conv_${context.userId}_${Date.now()}`;
  }

  /**
   * Check if message is from bot
   * @param {string} userId - User ID to check
   * @returns {boolean} True if from bot
   */
  isFromBot(userId) {
    return userId === this.botUserId;
  }

  /**
   * Clean up old conversations
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanupOldConversations(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const cutoffTime = Date.now() - maxAge;
    let cleanedCount = 0;

    for (const [conversationId, conversation] of this.conversations.entries()) {
      const conversationTime = new Date(conversation.startedAt).getTime();
      if (conversationTime < cutoffTime) {
        this.conversations.delete(conversationId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info('Old conversations cleaned up', { cleanedCount });
    }

    return cleanedCount;
  }

  /**
   * Get conversation statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const conversations = Array.from(this.conversations.values());
    
    return {
      total: conversations.length,
      stages: conversations.reduce((acc, conv) => {
        acc[conv.stage] = (acc[conv.stage] || 0) + 1;
        return acc;
      }, {}),
      activeConversations: conversations.filter(c => c.awaitingResponse).length
    };
  }
}

module.exports = ConversationManager;