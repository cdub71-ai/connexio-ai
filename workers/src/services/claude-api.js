import Anthropic from '@anthropic-ai/sdk';
import pRetry from 'p-retry';
import PQueue from 'p-queue';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { createContextLogger, createTimer, logError } from '../utils/logger.js';

/**
 * Claude API Service for marketing campaign natural language processing
 * Handles rate limiting, retries, and structured response parsing
 */
class ClaudeApiService {
  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
      baseURL: config.anthropic.baseUrl,
      timeout: config.anthropic.timeout,
    });

    // Rate limiting queue
    this.queue = new PQueue({
      concurrency: config.rateLimit.maxConcurrent,
      intervalCap: config.rateLimit.intervalCap,
      interval: config.rateLimit.interval,
    });

    this.logger = createContextLogger({ service: 'claude-api' });
    
    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokensUsed: 0,
      averageResponseTime: 0,
      rateLimitHits: 0,
    };

    this.logger.info('Claude API service initialized', {
      model: config.anthropic.model,
      maxTokens: config.anthropic.maxTokens,
      temperature: config.anthropic.temperature,
      maxConcurrent: config.rateLimit.maxConcurrent,
    });
  }

  /**
   * Parse marketing campaign command using Claude API
   * @param {string} command - Natural language campaign command
   * @param {Object} context - Additional context (user, channel, etc.)
   * @returns {Promise<Object>} Structured campaign data
   */
  async parseMarketingCommand(command, context = {}) {
    const requestId = uuidv4();
    const timer = createTimer('claude-api-request');
    const logger = createContextLogger({ 
      service: 'claude-api', 
      requestId,
      userId: context.userId,
      channelId: context.channelId 
    });

    logger.info('Parsing marketing command', { 
      commandLength: command.length,
      context: Object.keys(context)
    });

    try {
      // Add to rate limiting queue
      const result = await this.queue.add(
        () => this._makeClaudeRequest(command, context, requestId, logger),
        { priority: this._getPriority(context) }
      );

      const duration = timer.end();
      this._updateMetrics(true, duration, result.usage?.total_tokens || 0);
      
      logger.taskComplete(requestId, context.workflowId, result, duration);
      
      return result;
    } catch (error) {
      const duration = timer.end();
      this._updateMetrics(false, duration, 0);
      
      logger.taskError(requestId, context.workflowId, error, duration);
      throw this._enhanceError(error, requestId, command, context);
    }
  }

  /**
   * Make the actual Claude API request with retries
   * @private
   */
  async _makeClaudeRequest(command, context, requestId, logger) {
    const systemPrompt = this._buildSystemPrompt();
    const userPrompt = this._buildUserPrompt(command, context);

    return await pRetry(
      async (attemptNumber) => {
        logger.debug('Claude API attempt', { attemptNumber, requestId });

        const timer = createTimer('claude-api-call');
        
        try {
          const response = await this.client.messages.create({
            model: config.anthropic.model,
            max_tokens: config.anthropic.maxTokens,
            temperature: config.anthropic.temperature,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: userPrompt,
              },
            ],
          });

          const duration = timer.end();
          logger.apiCall('POST', '/v1/messages', 200, duration, requestId);

          return this._parseClaudeResponse(response, command, context, logger);
        } catch (error) {
          const duration = timer.end();
          const statusCode = error.status || error.statusCode || 500;
          
          logger.apiCall('POST', '/v1/messages', statusCode, duration, requestId);

          // Handle specific error types
          if (statusCode === 429) {
            this.metrics.rateLimitHits++;
            const retryAfter = error.headers?.['retry-after'] 
              ? parseInt(error.headers['retry-after']) * 1000 
              : config.rateLimit.retryDelay;
            
            logger.rateLimitHit('claude-api', retryAfter);
            
            // Exponential backoff for rate limits
            const delay = Math.min(retryAfter * attemptNumber, 30000);
            await new Promise(resolve => setTimeout(resolve, delay));
            throw error; // Retry
          }
          
          if (statusCode >= 500) {
            // Server errors are retryable
            throw error;
          }
          
          // Client errors (400-499) are not retryable except 429
          const nonRetryableError = new Error(error.message);
          nonRetryableError.shouldRetry = false;
          throw nonRetryableError;
        }
      },
      {
        retries: config.rateLimit.maxRetries,
        factor: 2,
        minTimeout: config.rateLimit.retryDelay,
        maxTimeout: 30000,
        onFailedAttempt: (error) => {
          logger.retryAttempt(
            error.attemptNumber,
            config.rateLimit.maxRetries + 1,
            error,
            error.retriesLeft > 0 ? config.rateLimit.retryDelay * error.attemptNumber : 0
          );
        },
        shouldRetry: (error) => {
          return error.shouldRetry !== false;
        }
      }
    );
  }

  /**
   * Build system prompt for Claude API
   * @private
   */
  _buildSystemPrompt() {
    return `You are Connexio.ai, an expert AI Marketing Operations Agent specializing in campaign creation and management.

Your task is to parse natural language marketing campaign requests and extract structured information.

IMPORTANT: You must respond with ONLY a valid JSON object. No additional text, explanations, or markdown formatting.

Extract the following information:
1. **Campaign Intent**: The primary action (create_email_campaign, create_sms_campaign, get_campaign_status, list_campaigns, help)
2. **Campaign Parameters**: Specific details like name, subject, message, audience, timing
3. **Channels**: Communication channels (email, sms, push, social)  
4. **Audience**: Target audience segments or criteria
5. **Timing**: When to send (immediate, scheduled, recurring)
6. **Content Elements**: Subject lines, messages, CTAs, offers
7. **Metadata**: Priority, tags, campaign type

Response format:
{
  "intent": "create_email_campaign",
  "confidence": 0.95,
  "parameters": {
    "name": "Campaign Name",
    "type": "email",
    "subject": "Email Subject",
    "message": "Campaign message content",
    "audience": "target_audience_segment",
    "timing": {
      "type": "immediate|scheduled|recurring",
      "scheduleTime": "ISO date string if scheduled",
      "frequency": "daily|weekly|monthly if recurring"
    },
    "channels": ["email"],
    "priority": "high|medium|low",
    "tags": ["tag1", "tag2"],
    "offers": {
      "discount": "percentage or amount",
      "promoCode": "code if applicable",
      "expiry": "expiry date if applicable"
    }
  },
  "extractedEntities": {
    "dates": [],
    "percentages": [],
    "promoCodes": [],
    "audiences": [],
    "channels": []
  },
  "summary": "Brief description of the campaign intent"
}

Campaign Types:
- **Email Campaigns**: Newsletters, promotions, announcements, drip sequences
- **SMS Campaigns**: Flash sales, reminders, alerts, welcome messages  
- **Multi-channel**: Campaigns across multiple channels
- **Status Queries**: Check campaign performance and metrics
- **List Operations**: View active campaigns and analytics

Audience Segments:
- all_subscribers, premium_customers, new_customers, inactive_users
- geographic: us_customers, eu_customers, apac_customers
- behavioral: high_value, frequent_buyers, cart_abandoners
- demographic: millennials, gen_z, enterprise_clients

Timing Keywords:
- Immediate: now, asap, immediately, right away
- Scheduled: tomorrow, next week, at 2pm, on Friday
- Recurring: weekly, monthly, every Tuesday, daily digest

Always provide a confidence score (0.0-1.0) based on how clearly you understood the request.`;
  }

  /**
   * Build user prompt with command and context
   * @private
   */
  _buildUserPrompt(command, context) {
    let prompt = `Parse this marketing campaign command and extract structured data:\n\n`;
    prompt += `Command: "${command}"\n\n`;

    if (context.userId) {
      prompt += `User ID: ${context.userId}\n`;
    }
    if (context.channelId) {
      prompt += `Channel: ${context.channelId}\n`;
    }
    if (context.teamDomain) {
      prompt += `Organization: ${context.teamDomain}\n`;
    }
    if (context.previousCommands) {
      prompt += `Recent commands: ${context.previousCommands.slice(-3).join(', ')}\n`;
    }

    prompt += `\nProvide your response as a valid JSON object only.`;

    return prompt;
  }

  /**
   * Parse Claude's response and validate structure
   * @private
   */
  _parseClaudeResponse(response, originalCommand, context, logger) {
    try {
      const content = response.content[0]?.text;
      if (!content) {
        throw new Error('Empty response from Claude API');
      }

      logger.debug('Raw Claude response', { 
        contentLength: content.length,
        usage: response.usage 
      });

      // Try to extract JSON from response
      let parsedContent;
      try {
        // Look for JSON object in response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedContent = JSON.parse(jsonMatch[0]);
        } else {
          parsedContent = JSON.parse(content);
        }
      } catch (parseError) {
        logger.warn('Failed to parse Claude JSON response, using fallback', {
          parseError: parseError.message,
          contentPreview: content.substring(0, 200)
        });
        
        // Fallback parsing
        parsedContent = this._createFallbackResponse(originalCommand, context);
      }

      // Validate and enhance response
      const validatedResponse = this._validateAndEnhanceResponse(
        parsedContent, 
        originalCommand, 
        context
      );

      // Add metadata
      validatedResponse.metadata = {
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
        model: config.anthropic.model,
        tokenUsage: response.usage,
        processingTimeMs: context.processingTime,
        originalCommand,
        userId: context.userId,
        channelId: context.channelId,
      };

      logger.info('Successfully parsed campaign intent', {
        intent: validatedResponse.intent,
        confidence: validatedResponse.confidence,
        channelsCount: validatedResponse.parameters?.channels?.length || 0,
        hasAudience: !!validatedResponse.parameters?.audience,
        hasTiming: !!validatedResponse.parameters?.timing,
      });

      return validatedResponse;
    } catch (error) {
      logger.error('Failed to parse Claude response', { 
        error: error.message,
        responsePreview: response.content?.[0]?.text?.substring(0, 200)
      });
      throw new Error(`Response parsing failed: ${error.message}`);
    }
  }

  /**
   * Validate and enhance the parsed response
   * @private
   */
  _validateAndEnhanceResponse(response, originalCommand, context) {
    // Ensure required fields
    if (!response.intent) {
      response.intent = this._inferIntent(originalCommand);
    }

    if (!response.confidence || response.confidence < 0 || response.confidence > 1) {
      response.confidence = 0.7; // Default confidence
    }

    if (!response.parameters) {
      response.parameters = {};
    }

    // Enhance parameters based on intent
    switch (response.intent) {
      case 'create_email_campaign':
        response.parameters.type = 'email';
        response.parameters.channels = response.parameters.channels || ['email'];
        if (!response.parameters.name && !response.parameters.subject) {
          response.parameters.name = 'Email Campaign';
        }
        break;

      case 'create_sms_campaign':
        response.parameters.type = 'sms';
        response.parameters.channels = response.parameters.channels || ['sms'];
        if (!response.parameters.name && !response.parameters.message) {
          response.parameters.name = 'SMS Campaign';
        }
        break;

      case 'get_campaign_status':
        // Extract campaign ID from command
        const campaignIdMatch = originalCommand.match(/CAMP-[A-Z]+-\d+/);
        if (campaignIdMatch) {
          response.parameters.campaignId = campaignIdMatch[0];
        }
        break;
    }

    // Set default timing if not specified
    if (!response.parameters.timing && response.intent.includes('create_')) {
      response.parameters.timing = {
        type: 'immediate'
      };
    }

    // Set default priority
    if (!response.parameters.priority) {
      response.parameters.priority = 'medium';
    }

    // Ensure summary exists
    if (!response.summary) {
      response.summary = this._generateSummary(response);
    }

    return response;
  }

  /**
   * Create fallback response when Claude parsing fails
   * @private
   */
  _createFallbackResponse(command, context) {
    const lowerCommand = command.toLowerCase();
    
    let intent = 'help';
    let confidence = 0.6;
    const parameters = {};

    // Simple intent detection
    if (lowerCommand.includes('email') && lowerCommand.includes('campaign')) {
      intent = 'create_email_campaign';
      parameters.type = 'email';
      parameters.channels = ['email'];
    } else if (lowerCommand.includes('sms') && lowerCommand.includes('campaign')) {
      intent = 'create_sms_campaign';
      parameters.type = 'sms';
      parameters.channels = ['sms'];
    } else if (lowerCommand.includes('status') || lowerCommand.includes('check')) {
      intent = 'get_campaign_status';
    } else if (lowerCommand.includes('list') || lowerCommand.includes('show')) {
      intent = 'list_campaigns';
    }

    // Extract basic parameters
    if (lowerCommand.includes('urgent') || lowerCommand.includes('asap')) {
      parameters.priority = 'high';
    }
    
    if (lowerCommand.includes('sale') || lowerCommand.includes('discount')) {
      parameters.tags = ['promotion', 'sale'];
    }

    return {
      intent,
      confidence,
      parameters,
      extractedEntities: {},
      summary: `Fallback parsing of: ${command.substring(0, 50)}...`,
    };
  }

  /**
   * Infer intent from command text
   * @private
   */
  _inferIntent(command) {
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand.includes('help')) return 'help';
    if (lowerCommand.includes('status') || lowerCommand.includes('check')) return 'get_campaign_status';
    if (lowerCommand.includes('list') || lowerCommand.includes('show')) return 'list_campaigns';
    if (lowerCommand.includes('email')) return 'create_email_campaign';
    if (lowerCommand.includes('sms') || lowerCommand.includes('text')) return 'create_sms_campaign';
    if (lowerCommand.includes('create') || lowerCommand.includes('campaign')) return 'create_email_campaign';
    
    return 'help';
  }

  /**
   * Generate summary from response data
   * @private
   */
  _generateSummary(response) {
    const { intent, parameters } = response;
    
    switch (intent) {
      case 'create_email_campaign':
        return `Create email campaign: ${parameters.name || parameters.subject || 'New campaign'}`;
      case 'create_sms_campaign':
        return `Create SMS campaign: ${parameters.name || 'New SMS campaign'}`;
      case 'get_campaign_status':
        return `Check status of campaign: ${parameters.campaignId || 'specified campaign'}`;
      case 'list_campaigns':
        return 'List all campaigns';
      case 'help':
        return 'Provide help and available commands';
      default:
        return `Execute marketing action: ${intent}`;
    }
  }

  /**
   * Get request priority based on context
   * @private
   */
  _getPriority(context) {
    // Higher priority for certain users or channels
    if (context.priority === 'high' || context.channelId?.includes('urgent')) {
      return 10;
    }
    if (context.userId?.includes('admin') || context.userId?.includes('manager')) {
      return 5;
    }
    return 0; // Default priority
  }

  /**
   * Update performance metrics
   * @private
   */
  _updateMetrics(success, duration, tokens) {
    this.metrics.totalRequests++;
    
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }
    
    this.metrics.totalTokensUsed += tokens;
    
    // Update rolling average
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + duration;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalRequests;
  }

  /**
   * Enhance error with additional context
   * @private
   */
  _enhanceError(error, requestId, command, context) {
    const enhancedError = new Error(error.message);
    enhancedError.name = error.name || 'ClaudeApiError';
    enhancedError.code = error.code;
    enhancedError.statusCode = error.status || error.statusCode;
    enhancedError.requestId = requestId;
    enhancedError.command = command.substring(0, 100); // Truncate for privacy
    enhancedError.userId = context.userId;
    enhancedError.originalError = error;
    
    return enhancedError;
  }

  /**
   * Get service health metrics
   */
  getHealthMetrics() {
    return {
      ...this.metrics,
      queueSize: this.queue.size,
      queuePending: this.queue.pending,
      successRate: this.metrics.totalRequests > 0 
        ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
        : 0,
      averageTokensPerRequest: this.metrics.totalRequests > 0
        ? this.metrics.totalTokensUsed / this.metrics.totalRequests
        : 0,
    };
  }

  /**
   * Cleanup resources
   */
  async shutdown() {
    this.logger.info('Shutting down Claude API service');
    await this.queue.onIdle();
    this.logger.info('Claude API service shut down complete');
  }
}

export default ClaudeApiService;