import { LHTaskWorker } from 'littlehorse-client';
import ClaudeApiService from '../services/claude-api.js';
import config from '../config/index.js';
import { createContextLogger, createTimer } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Little Horse Task Worker for Claude API integration
 * Processes marketing campaign commands using Claude API
 */
class ClaudeTaskWorker {
  constructor() {
    this.claudeService = new ClaudeApiService();
    this.logger = createContextLogger({ service: 'claude-task-worker' });
    this.activeTasksCount = 0;
    this.taskMetrics = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      averageProcessingTime: 0,
    };

    this.logger.info('Claude task worker initialized', {
      taskName: config.worker.taskName,
      maxConcurrentTasks: config.worker.maxConcurrentTasks,
    });
  }

  /**
   * Main task execution method for Little Horse
   * This method will be called by Little Horse for each task
   */
  @LHTaskWorker(config.worker.taskName)
  async parseMarketingCommand(slackCommand, userId, channelId, additionalContext = {}) {
    const taskId = uuidv4();
    const workflowId = additionalContext.wfRunId || 'unknown';
    const timer = createTimer('task-execution');
    
    const logger = createContextLogger({
      service: 'claude-task-worker',
      taskId,
      workflowId,
      userId,
      channelId,
    });

    this.activeTasksCount++;
    this.taskMetrics.totalTasks++;

    logger.taskStart(taskId, workflowId, { slackCommand, userId, channelId });

    try {
      // Validate input
      const validatedInput = this._validateInput(slackCommand, userId, channelId);
      
      // Extract command text from Slack command object
      const commandText = this._extractCommandText(validatedInput.slackCommand);
      
      // Prepare context for Claude API
      const context = this._prepareContext(validatedInput, additionalContext, {
        taskId,
        workflowId,
        requestId: taskId,
      });

      logger.info('Processing marketing command', {
        commandText: commandText.substring(0, 100) + (commandText.length > 100 ? '...' : ''),
        contextKeys: Object.keys(context),
      });

      // Call Claude API service
      const result = await this.claudeService.parseMarketingCommand(commandText, context);

      // Validate and enhance result
      const enhancedResult = this._enhanceResult(result, validatedInput, context);

      const duration = timer.end();
      this._updateTaskMetrics(true, duration);
      
      logger.taskComplete(taskId, workflowId, enhancedResult, duration);

      return enhancedResult;

    } catch (error) {
      const duration = timer.end();
      this._updateTaskMetrics(false, duration);
      
      logger.taskError(taskId, workflowId, error, duration);

      // Return structured error response instead of throwing
      // This allows the workflow to continue and handle the error gracefully
      return this._createErrorResponse(error, {
        taskId,
        workflowId,
        userId,
        channelId,
        command: slackCommand,
      });

    } finally {
      this.activeTasksCount--;
    }
  }

  /**
   * Validate input parameters
   * @private
   */
  _validateInput(slackCommand, userId, channelId) {
    const errors = [];

    // Validate slackCommand
    if (!slackCommand) {
      errors.push('slackCommand is required');
    } else if (typeof slackCommand === 'string') {
      // If it's a string, wrap it in an object
      slackCommand = { text: slackCommand, command: '/connexio' };
    } else if (typeof slackCommand === 'object') {
      if (!slackCommand.text && !slackCommand.command) {
        errors.push('slackCommand must have text or command property');
      }
    } else {
      errors.push('slackCommand must be string or object');
    }

    // Validate userId (optional but recommended)
    if (userId && typeof userId !== 'string') {
      errors.push('userId must be a string');
    }

    // Validate channelId (optional but recommended)
    if (channelId && typeof channelId !== 'string') {
      errors.push('channelId must be a string');
    }

    if (errors.length > 0) {
      const error = new Error(`Input validation failed: ${errors.join(', ')}`);
      error.code = 'INVALID_INPUT';
      error.validationErrors = errors;
      throw error;
    }

    return {
      slackCommand,
      userId: userId || 'anonymous',
      channelId: channelId || 'unknown',
    };
  }

  /**
   * Extract command text from various Slack command formats
   * @private
   */
  _extractCommandText(slackCommand) {
    if (typeof slackCommand === 'string') {
      return slackCommand;
    }

    if (typeof slackCommand === 'object') {
      // Try different properties that might contain the command text
      return slackCommand.text || 
             slackCommand.command || 
             slackCommand.message || 
             JSON.stringify(slackCommand);
    }

    return String(slackCommand);
  }

  /**
   * Prepare context object for Claude API
   * @private
   */
  _prepareContext(validatedInput, additionalContext, taskContext) {
    const context = {
      // User context
      userId: validatedInput.userId,
      channelId: validatedInput.channelId,
      
      // Slack context
      teamId: validatedInput.slackCommand.team_id,
      teamDomain: validatedInput.slackCommand.team_domain,
      userName: validatedInput.slackCommand.user_name,
      channelName: validatedInput.slackCommand.channel_name,
      
      // Task context
      ...taskContext,
      
      // Workflow context
      workflowId: additionalContext.wfRunId,
      nodeRunId: additionalContext.nodeRunId,
      
      // Timing context
      timestamp: new Date().toISOString(),
      timezone: additionalContext.timezone || 'UTC',
      
      // Additional context
      ...additionalContext,
    };

    // Remove undefined values
    Object.keys(context).forEach(key => {
      if (context[key] === undefined) {
        delete context[key];
      }
    });

    return context;
  }

  /**
   * Enhance the result from Claude API
   * @private
   */
  _enhanceResult(result, validatedInput, context) {
    // Add task execution metadata
    result.taskExecution = {
      taskId: context.taskId,
      workflowId: context.workflowId,
      executedAt: new Date().toISOString(),
      executedBy: config.app.workerName,
      version: '1.0.0',
    };

    // Add input validation status
    result.inputValidation = {
      valid: true,
      userId: validatedInput.userId,
      channelId: validatedInput.channelId,
      commandLength: this._extractCommandText(validatedInput.slackCommand).length,
    };

    // Ensure required response structure for workflow
    if (!result.intent) {
      result.intent = 'help';
      result.confidence = 0.5;
    }

    if (!result.parameters) {
      result.parameters = {};
    }

    // Add computed fields
    result.computedFields = {
      isUrgent: this._isUrgentRequest(result),
      estimatedComplexity: this._estimateComplexity(result),
      recommendedChannel: this._recommendChannel(result),
      suggestedActions: this._suggestActions(result),
    };

    return result;
  }

  /**
   * Create structured error response
   * @private
   */
  _createErrorResponse(error, context) {
    const errorResponse = {
      intent: 'error',
      confidence: 0.0,
      parameters: {
        errorType: error.code || error.name || 'UNKNOWN_ERROR',
        errorMessage: error.message,
        canRetry: this._isRetryableError(error),
        fallbackAction: 'help',
      },
      extractedEntities: {},
      summary: `Error processing command: ${error.message}`,
      taskExecution: {
        taskId: context.taskId,
        workflowId: context.workflowId,
        executedAt: new Date().toISOString(),
        executedBy: config.app.workerName,
        error: {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          requestId: error.requestId,
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        userId: context.userId,
        channelId: context.channelId,
        originalCommand: context.command,
      },
    };

    return errorResponse;
  }

  /**
   * Check if request appears urgent
   * @private
   */
  _isUrgentRequest(result) {
    const urgentKeywords = ['urgent', 'asap', 'immediately', 'now', 'emergency', 'critical'];
    const text = JSON.stringify(result).toLowerCase();
    return urgentKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Estimate complexity of the request
   * @private
   */
  _estimateComplexity(result) {
    let complexity = 'low';
    
    const params = result.parameters || {};
    
    // Check for multiple channels
    if (params.channels && params.channels.length > 1) {
      complexity = 'medium';
    }
    
    // Check for scheduling
    if (params.timing && params.timing.type !== 'immediate') {
      complexity = 'medium';
    }
    
    // Check for complex targeting
    if (params.audience && Array.isArray(params.audience)) {
      complexity = 'medium';
    }
    
    // Check for personalization or dynamic content
    if (params.personalization || params.dynamicContent) {
      complexity = 'high';
    }
    
    return complexity;
  }

  /**
   * Recommend best channel based on intent
   * @private
   */
  _recommendChannel(result) {
    const intent = result.intent;
    const params = result.parameters || {};
    
    if (intent.includes('email')) return 'email';
    if (intent.includes('sms')) return 'sms';
    
    // Smart recommendations based on content
    if (params.message && params.message.length > 160) {
      return 'email'; // Long content better for email
    }
    
    if (this._isUrgentRequest(result)) {
      return 'sms'; // Urgent messages via SMS
    }
    
    return 'email'; // Default recommendation
  }

  /**
   * Suggest follow-up actions
   * @private
   */
  _suggestActions(result) {
    const suggestions = [];
    const intent = result.intent;
    const params = result.parameters || {};
    
    if (intent.includes('create_') && !params.audience) {
      suggestions.push('define_target_audience');
    }
    
    if (intent.includes('create_') && !params.timing) {
      suggestions.push('set_campaign_timing');
    }
    
    if (intent === 'help') {
      suggestions.push('show_examples', 'list_capabilities');
    }
    
    if (result.confidence < 0.7) {
      suggestions.push('clarify_request', 'provide_more_details');
    }
    
    return suggestions;
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryableError(error) {
    // Network errors, rate limits, and server errors are retryable
    if (error.code === 'ECONNRESET' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'ETIMEDOUT') {
      return true;
    }
    
    if (error.statusCode >= 500) {
      return true;
    }
    
    if (error.statusCode === 429) {
      return true;
    }
    
    // Input validation errors are not retryable
    if (error.code === 'INVALID_INPUT') {
      return false;
    }
    
    return false;
  }

  /**
   * Update task metrics
   * @private
   */
  _updateTaskMetrics(success, duration) {
    if (success) {
      this.taskMetrics.successfulTasks++;
    } else {
      this.taskMetrics.failedTasks++;
    }

    // Update rolling average processing time
    const totalTime = this.taskMetrics.averageProcessingTime * (this.taskMetrics.totalTasks - 1) + duration;
    this.taskMetrics.averageProcessingTime = totalTime / this.taskMetrics.totalTasks;
  }

  /**
   * Get worker health status
   */
  getHealthStatus() {
    const claudeMetrics = this.claudeService.getHealthMetrics();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      worker: {
        name: config.app.workerName,
        taskName: config.worker.taskName,
        activeTasksCount: this.activeTasksCount,
        maxConcurrentTasks: config.worker.maxConcurrentTasks,
        metrics: this.taskMetrics,
        successRate: this.taskMetrics.totalTasks > 0 
          ? (this.taskMetrics.successfulTasks / this.taskMetrics.totalTasks) * 100 
          : 0,
      },
      claudeApi: claudeMetrics,
      system: {
        nodeVersion: process.version,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
    };
  }

  /**
   * Shutdown worker gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down Claude task worker', {
      activeTasksCount: this.activeTasksCount,
      totalTasksProcessed: this.taskMetrics.totalTasks,
    });

    // Wait for active tasks to complete (with timeout)
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.activeTasksCount > 0 && (Date.now() - startTime) < maxWaitTime) {
      this.logger.info('Waiting for active tasks to complete', {
        activeTasksCount: this.activeTasksCount,
        waitingTimeMs: Date.now() - startTime,
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Shutdown Claude service
    await this.claudeService.shutdown();

    this.logger.info('Claude task worker shutdown complete', {
      finalTaskCount: this.taskMetrics.totalTasks,
      finalSuccessRate: this.taskMetrics.totalTasks > 0 
        ? (this.taskMetrics.successfulTasks / this.taskMetrics.totalTasks) * 100 
        : 0,
    });
  }
}

export default ClaudeTaskWorker;