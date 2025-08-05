/**
 * Enhanced Claude API Integration Worker
 * Advanced Little Horse workflow patterns for marketing automation
 * Implements saga patterns, advanced error recovery, and comprehensive monitoring
 */

import { LHTaskWorker } from 'littlehorse-client';
import ClaudeApiService from '../services/claude-api.js';
import config from '../config/index.js';
import { createContextLogger, createTimer } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import pRetry from 'p-retry';

// Import monitoring if available
let monitoringSystem = null;
try {
  const { monitoringSystem: ms } = await import('../../../monitoring/monitoring-setup.js');
  monitoringSystem = ms;
} catch (error) {
  console.warn('Monitoring system not available:', error.message);
}

/**
 * Enhanced Claude Task Worker with Advanced Little Horse Patterns
 */
class EnhancedClaudeWorker {
  constructor() {
    this.claudeService = new ClaudeApiService();
    this.logger = createContextLogger({ service: 'enhanced-claude-worker' });
    
    // Workflow state management
    this.workflowStates = new Map();
    this.sagaCompensations = new Map();
    
    // Advanced metrics
    this.metrics = {
      // Basic metrics
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      averageProcessingTime: 0,
      
      // Workflow-specific metrics
      workflowTypes: new Map(),
      sagaCompensations: 0,
      crossWorkflowCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      
      // Performance metrics
      tokenUsage: {
        total: 0,
        averagePerRequest: 0,
        maxInSingleRequest: 0
      },
      
      // Error metrics
      errorTypes: new Map(),
      retrySuccessRate: 0,
      circuitBreakerTrips: 0
    };

    // Response cache for similar requests
    this.responseCache = new Map();
    this.cacheConfig = {
      maxSize: 1000,
      ttlMs: 300000, // 5 minutes
    };

    // Workflow monitoring integration
    this.workflowMonitor = monitoringSystem?.createWorkflowHelpers() || null;
    
    this.logger.info('Enhanced Claude worker initialized', {
      cacheEnabled: true,
      monitoringEnabled: !!this.workflowMonitor,
      sagaPatternsEnabled: true
    });
  }

  /**
   * Primary task method - Enhanced marketing command parsing
   * Implements advanced Little Horse patterns
   */
  @LHTaskWorker('parse-marketing-command-enhanced')
  async parseMarketingCommandEnhanced(input, lhContext = {}) {
    const taskId = uuidv4();
    const workflowId = lhContext.wfRunId || input.workflowId || 'unknown';
    const timer = createTimer('enhanced-task-execution');
    
    const logger = createContextLogger({
      service: 'enhanced-claude-worker',
      taskId,
      workflowId,
      nodeRunId: lhContext.nodeRunId,
      threadRunId: lhContext.threadRunId
    });

    // Track workflow start
    this.workflowMonitor?.start(workflowId, 'claude-marketing-parse', '2.0', {
      taskType: 'marketing-command-parse',
      inputType: typeof input,
      hasContext: !!lhContext.wfRunId
    });

    try {
      // Enhanced input validation with workflow context
      const validatedInput = await this._validateEnhancedInput(input, lhContext);
      
      // Check cache first
      const cacheKey = this._generateCacheKey(validatedInput);
      const cachedResult = this._getCachedResponse(cacheKey);
      
      if (cachedResult) {
        this.metrics.cacheHits++;
        logger.info('Cache hit for marketing command', { cacheKey });
        
        const duration = timer.end();
        this._updateMetrics(true, duration, 0, 'cache-hit');
        
        this.workflowMonitor?.complete(workflowId, 'completed');
        return this._enhanceResponseWithWorkflowContext(cachedResult, lhContext);
      }

      this.metrics.cacheMisses++;
      
      // Prepare enhanced context with workflow state
      const enhancedContext = await this._prepareEnhancedContext(
        validatedInput, 
        lhContext,
        taskId
      );

      // Execute with workflow-aware processing
      const result = await this._executeWithWorkflowPatterns(
        validatedInput,
        enhancedContext,
        logger
      );

      // Cache successful results
      this._cacheResponse(cacheKey, result);
      
      const duration = timer.end();
      this._updateMetrics(true, duration, result.tokenUsage || 0, 'success');
      
      logger.taskComplete(taskId, workflowId, result, duration);
      this.workflowMonitor?.complete(workflowId, 'completed');
      
      return result;

    } catch (error) {
      const duration = timer.end();
      this._updateMetrics(false, duration, 0, 'error');
      
      logger.taskError(taskId, workflowId, error, duration);
      this.workflowMonitor?.error(workflowId, error);
      
      // Return structured error for workflow continuation
      return this._createEnhancedErrorResponse(error, {
        taskId,
        workflowId,
        lhContext,
        input
      });
    }
  }

  /**
   * Saga-aware campaign content generation
   * Implements compensation patterns for distributed transactions
   */
  @LHTaskWorker('generate-campaign-content-saga')
  async generateCampaignContentSaga(campaignRequest, sagaContext = {}) {
    const taskId = uuidv4();
    const workflowId = sagaContext.wfRunId || campaignRequest.workflowId || 'saga-unknown';
    const sagaId = sagaContext.sagaId || uuidv4();
    
    const logger = createContextLogger({
      service: 'enhanced-claude-worker',
      taskId,
      workflowId,
      sagaId,
      stepName: 'content-generation'
    });

    // Track saga step start
    this.workflowMonitor?.taskStart(workflowId, taskId, 'generate-campaign-content', {
      sagaId,
      campaignType: campaignRequest.type,
      channelCount: campaignRequest.channels?.length || 0
    });

    try {
      // Validate campaign request
      const validatedRequest = await this._validateCampaignRequest(campaignRequest);
      
      // Prepare saga-specific context
      const sagaSpecificContext = {
        ...sagaContext,
        sagaId,
        stepName: 'content-generation',
        compensationRequired: true,
        rollbackData: {
          campaignId: validatedRequest.campaignId,
          contentIds: [],
          resourcesUsed: []
        }
      };

      // Generate content with saga awareness
      const contentResult = await this._generateContentWithSagaPattern(
        validatedRequest,
        sagaSpecificContext,
        logger
      );

      // Prepare compensation data
      const compensationData = {
        contentIds: contentResult.generatedContentIds || [],
        resourcesAllocated: contentResult.resourcesUsed || [],
        tokensUsed: contentResult.tokenUsage || 0,
        cacheKeys: contentResult.cacheKeys || [],
        sagaStepId: taskId,
        compensationHandler: 'compensate-content-generation'
      };

      // Store compensation data for potential rollback
      this.sagaCompensations.set(sagaId, {
        stepName: 'content-generation',
        compensationData,
        timestamp: Date.now()
      });

      const enhancedResult = {
        ...contentResult,
        sagaMetadata: {
          sagaId,
          stepName: 'content-generation',
          canCompensate: true,
          compensationData
        }
      };

      this.workflowMonitor?.taskComplete(workflowId, taskId, 'completed', enhancedResult);
      
      return enhancedResult;

    } catch (error) {
      logger.error('Saga content generation failed', {
        error: error.message,
        sagaId,
        campaignId: campaignRequest.campaignId
      });
      
      this.workflowMonitor?.taskComplete(workflowId, taskId, 'failed', null, error);
      
      // Return saga-aware error response
      return {
        intent: 'saga_step_failed',
        sagaMetadata: {
          sagaId,
          stepName: 'content-generation',
          failureReason: error.message,
          requiresCompensation: false,
          canRetry: this._isRetryableError(error)
        },
        error: {
          code: error.code || 'CONTENT_GENERATION_FAILED',
          message: error.message,
          retryable: this._isRetryableError(error)
        }
      };
    }
  }

  /**
   * Compensation handler for saga rollbacks
   */
  @LHTaskWorker('compensate-content-generation')
  async compensateContentGeneration(compensationData, sagaContext = {}) {
    const taskId = uuidv4();
    const sagaId = sagaContext.sagaId || compensationData.sagaId;
    
    const logger = createContextLogger({
      service: 'enhanced-claude-worker',
      taskId,
      sagaId,
      operation: 'compensation'
    });

    try {
      logger.info('Starting content generation compensation', {
        sagaId,
        contentIds: compensationData.contentIds?.length || 0,
        resourcesCount: compensationData.resourcesAllocated?.length || 0
      });

      const compensationResults = [];

      // Compensate generated content
      if (compensationData.contentIds?.length > 0) {
        const contentCompensation = await this._compensateGeneratedContent(
          compensationData.contentIds
        );
        compensationResults.push(contentCompensation);
      }

      // Release allocated resources
      if (compensationData.resourcesAllocated?.length > 0) {
        const resourceCompensation = await this._compensateAllocatedResources(
          compensationData.resourcesAllocated
        );
        compensationResults.push(resourceCompensation);
      }

      // Clear cache entries
      if (compensationData.cacheKeys?.length > 0) {
        const cacheCompensation = await this._compensateCacheEntries(
          compensationData.cacheKeys
        );
        compensationResults.push(cacheCompensation);
      }

      // Update metrics
      this.metrics.sagaCompensations++;

      // Remove compensation data
      this.sagaCompensations.delete(sagaId);

      logger.info('Content generation compensation completed', {
        sagaId,
        compensationResults: compensationResults.length,
        successful: compensationResults.filter(r => r.success).length
      });

      return {
        compensated: true,
        sagaId,
        results: compensationResults,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('Compensation failed', {
        sagaId,
        error: error.message
      });

      return {
        compensated: false,
        sagaId,
        error: error.message,
        requiresManualIntervention: true,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Multi-workflow coordination task
   * Handles cross-workflow communication and state synchronization
   */
  @LHTaskWorker('coordinate-cross-workflow')
  async coordinateCrossWorkflow(coordinationRequest, lhContext = {}) {
    const taskId = uuidv4();
    const primaryWorkflowId = lhContext.wfRunId || 'primary-unknown';
    const targetWorkflowId = coordinationRequest.targetWorkflowId;
    
    const logger = createContextLogger({
      service: 'enhanced-claude-worker',
      taskId,
      primaryWorkflowId,
      targetWorkflowId,
      coordinationType: coordinationRequest.type
    });

    try {
      this.metrics.crossWorkflowCalls++;

      // Validate coordination request
      if (!targetWorkflowId) {
        throw new Error('Target workflow ID is required for coordination');
      }

      logger.info('Starting cross-workflow coordination', {
        type: coordinationRequest.type,
        primaryWorkflow: primaryWorkflowId,
        targetWorkflow: targetWorkflowId
      });

      let coordinationResult;

      switch (coordinationRequest.type) {
        case 'state_sync':
          coordinationResult = await this._synchronizeWorkflowStates(
            primaryWorkflowId,
            targetWorkflowId,
            coordinationRequest.stateData
          );
          break;

        case 'event_propagation':
          coordinationResult = await this._propagateEventToWorkflow(
            targetWorkflowId,
            coordinationRequest.event
          );
          break;

        case 'resource_handoff':
          coordinationResult = await this._handoffResourceToWorkflow(
            targetWorkflowId,
            coordinationRequest.resources
          );
          break;

        case 'completion_signal':
          coordinationResult = await this._signalWorkflowCompletion(
            targetWorkflowId,
            coordinationRequest.completionData
          );
          break;

        default:
          throw new Error(`Unsupported coordination type: ${coordinationRequest.type}`);
      }

      logger.info('Cross-workflow coordination completed', {
        type: coordinationRequest.type,
        result: coordinationResult.success
      });

      return {
        coordinationSuccessful: true,
        coordinationType: coordinationRequest.type,
        primaryWorkflowId,
        targetWorkflowId,
        result: coordinationResult,
        timestamp: Date.now()
      };

    } catch (error) {
      logger.error('Cross-workflow coordination failed', {
        type: coordinationRequest.type,
        error: error.message
      });

      return {
        coordinationSuccessful: false,
        coordinationType: coordinationRequest.type,
        error: error.message,
        requiresRetry: this._isRetryableError(error),
        timestamp: Date.now()
      };
    }
  }

  // Private helper methods

  /**
   * Enhanced input validation with workflow context
   * @private
   */
  async _validateEnhancedInput(input, lhContext) {
    const errors = [];

    // Basic validation
    if (!input) {
      errors.push('Input is required');
    }

    // Workflow context validation
    if (lhContext.wfRunId && typeof lhContext.wfRunId !== 'string') {
      errors.push('Workflow run ID must be a string');
    }

    // Enhanced validation based on input type
    if (typeof input === 'string') {
      if (input.trim().length === 0) {
        errors.push('Input command cannot be empty');
      }
      if (input.length > 10000) {
        errors.push('Input command too long (max 10000 characters)');
      }
    } else if (typeof input === 'object') {
      if (!input.command && !input.text && !input.message) {
        errors.push('Input object must have command, text, or message property');
      }
    }

    if (errors.length > 0) {
      const error = new Error(`Enhanced input validation failed: ${errors.join(', ')}`);
      error.code = 'ENHANCED_VALIDATION_ERROR';
      error.validationErrors = errors;
      throw error;
    }

    return {
      command: this._extractCommandText(input),
      originalInput: input,
      workflowContext: lhContext
    };
  }

  /**
   * Prepare enhanced context with workflow awareness
   * @private
   */
  async _prepareEnhancedContext(validatedInput, lhContext, taskId) {
    const baseContext = {
      taskId,
      workflowId: lhContext.wfRunId,
      nodeRunId: lhContext.nodeRunId,
      threadRunId: lhContext.threadRunId,
      timestamp: new Date().toISOString()
    };

    // Add workflow state if available
    if (lhContext.wfRunId) {
      const workflowState = this.workflowStates.get(lhContext.wfRunId);
      if (workflowState) {
        baseContext.workflowState = workflowState;
        baseContext.previousCommands = workflowState.commandHistory || [];
      }
    }

    // Add performance context
    baseContext.performanceHints = {
      preferredModel: this._selectOptimalModel(validatedInput.command),
      estimatedComplexity: this._estimateComplexity(validatedInput.command),
      cachePreference: 'enabled'
    };

    return baseContext;
  }

  /**
   * Execute with advanced workflow patterns
   * @private
   */
  async _executeWithWorkflowPatterns(validatedInput, context, logger) {
    // Track workflow state
    this._updateWorkflowState(context.workflowId, {
      lastCommand: validatedInput.command,
      lastExecutionTime: Date.now(),
      executionCount: (this.workflowStates.get(context.workflowId)?.executionCount || 0) + 1
    });

    // Execute with circuit breaker and retry patterns
    const result = await pRetry(
      async (attemptNumber) => {
        logger.debug('Attempting enhanced Claude execution', { 
          attempt: attemptNumber,
          model: context.performanceHints.preferredModel
        });

        return await this.claudeService.parseMarketingCommand(
          validatedInput.command, 
          context
        );
      },
      {
        retries: config.rateLimit.maxRetries,
        factor: 2,
        minTimeout: config.rateLimit.retryDelay,
        maxTimeout: 30000,
        shouldRetry: (error) => this._isRetryableError(error)
      }
    );

    // Enhance result with workflow context
    return this._enhanceResponseWithWorkflowContext(result, context);
  }

  /**
   * Generate cache key for requests
   * @private
   */
  _generateCacheKey(validatedInput) {
    const commandHash = this._hashString(validatedInput.command);
    const contextHash = this._hashString(JSON.stringify({
      workflowType: validatedInput.workflowContext?.type,
      userType: validatedInput.workflowContext?.userType
    }));
    
    return `claude:${commandHash}:${contextHash}`;
  }

  /**
   * Get cached response if available and valid
   * @private
   */
  _getCachedResponse(cacheKey) {
    const cached = this.responseCache.get(cacheKey);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheConfig.ttlMs) {
      this.responseCache.delete(cacheKey);
      return null;
    }

    return cached.response;
  }

  /**
   * Cache successful response
   * @private
   */
  _cacheResponse(cacheKey, response) {
    // Implement LRU eviction
    if (this.responseCache.size >= this.cacheConfig.maxSize) {
      const firstKey = this.responseCache.keys().next().value;
      this.responseCache.delete(firstKey);
    }

    this.responseCache.set(cacheKey, {
      response: { ...response },
      timestamp: Date.now()
    });
  }

  /**
   * Enhanced error response with workflow context
   * @private
   */
  _createEnhancedErrorResponse(error, context) {
    return {
      intent: 'workflow_error',
      confidence: 0.0,
      parameters: {
        errorType: error.code || error.name || 'UNKNOWN_ERROR',
        errorMessage: error.message,
        canRetry: this._isRetryableError(error),
        workflowRecoverable: true,
        fallbackAction: 'continue_workflow'
      },
      workflowMetadata: {
        workflowId: context.workflowId,
        taskId: context.taskId,
        nodeRunId: context.lhContext?.nodeRunId,
        errorOccurredAt: new Date().toISOString(),
        retryRecommended: this._isRetryableError(error),
        compensationRequired: false
      },
      extractedEntities: {},
      summary: `Workflow error: ${error.message}`,
      metadata: {
        timestamp: new Date().toISOString(),
        workerName: config.app.workerName,
        version: '2.0.0'
      }
    };
  }

  /**
   * Update comprehensive metrics
   * @private
   */
  _updateMetrics(success, duration, tokens, resultType) {
    this.metrics.totalTasks++;
    
    if (success) {
      this.metrics.successfulTasks++;
    } else {
      this.metrics.failedTasks++;
    }

    // Update token usage
    this.metrics.tokenUsage.total += tokens;
    if (tokens > this.metrics.tokenUsage.maxInSingleRequest) {
      this.metrics.tokenUsage.maxInSingleRequest = tokens;
    }
    this.metrics.tokenUsage.averagePerRequest = 
      this.metrics.tokenUsage.total / this.metrics.totalTasks;

    // Update average processing time
    const totalTime = this.metrics.averageProcessingTime * (this.metrics.totalTasks - 1) + duration;
    this.metrics.averageProcessingTime = totalTime / this.metrics.totalTasks;

    // Track result types
    const typeCount = this.metrics.workflowTypes.get(resultType) || 0;
    this.metrics.workflowTypes.set(resultType, typeCount + 1);
  }

  /**
   * Utility methods for various operations
   * @private
   */
  _extractCommandText(input) {
    if (typeof input === 'string') return input;
    if (typeof input === 'object') {
      return input.command || input.text || input.message || JSON.stringify(input);
    }
    return String(input);
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  _selectOptimalModel(command) {
    // Simple model selection based on command complexity
    if (command.length > 2000) {
      return 'claude-3-5-sonnet-20241022';
    }
    return config.anthropic.model;
  }

  _estimateComplexity(command) {
    const complexityFactors = [
      command.length > 1000,
      (command.match(/\band\b/gi) || []).length > 3,
      command.includes('personalization'),
      command.includes('dynamic'),
      command.includes('template')
    ].filter(Boolean).length;

    if (complexityFactors >= 3) return 'high';
    if (complexityFactors >= 1) return 'medium';
    return 'low';
  }

  _updateWorkflowState(workflowId, stateUpdate) {
    if (!workflowId) return;

    const currentState = this.workflowStates.get(workflowId) || {
      commandHistory: [],
      executionCount: 0,
      createdAt: Date.now()
    };

    const updatedState = {
      ...currentState,
      ...stateUpdate,
      lastUpdated: Date.now()
    };

    // Maintain command history
    if (stateUpdate.lastCommand) {
      updatedState.commandHistory = [
        ...(currentState.commandHistory || []).slice(-9), // Keep last 10
        stateUpdate.lastCommand
      ];
    }

    this.workflowStates.set(workflowId, updatedState);
  }

  _enhanceResponseWithWorkflowContext(response, context) {
    return {
      ...response,
      workflowEnhancements: {
        workflowId: context.workflowId,
        nodeRunId: context.nodeRunId,
        threadRunId: context.threadRunId,
        recommendedNextActions: this._suggestNextActions(response, context),
        workflowContinuation: this._generateWorkflowContinuation(response),
        contextualInsights: this._generateContextualInsights(response, context)
      }
    };
  }

  _suggestNextActions(response, context) {
    const suggestions = [];
    
    if (response.intent?.includes('create_') && !response.parameters?.timing) {
      suggestions.push({
        action: 'schedule_campaign',
        description: 'Set timing for campaign execution',
        priority: 'medium'
      });
    }

    if (response.confidence < 0.7) {
      suggestions.push({
        action: 'clarify_requirements',
        description: 'Request additional details to improve accuracy',
        priority: 'high'
      });
    }

    return suggestions;
  }

  _generateWorkflowContinuation(response) {
    const { intent } = response;
    
    const continuationMap = {
      'create_email_campaign': ['validate_audience', 'generate_content', 'schedule_send'],
      'create_sms_campaign': ['validate_phone_numbers', 'check_opt_ins', 'schedule_send'],
      'get_campaign_status': ['format_status_report', 'check_metrics'],
      'help': ['show_available_commands', 'provide_examples']
    };

    return {
      suggestedNextSteps: continuationMap[intent] || ['continue'],
      canProceedAutomatically: response.confidence > 0.8,
      requiresHumanApproval: ['create_email_campaign', 'create_sms_campaign'].includes(intent)
    };
  }

  _generateContextualInsights(response, context) {
    const insights = [];
    
    const workflowState = this.workflowStates.get(context.workflowId);
    if (workflowState) {
      insights.push({
        type: 'workflow_history',
        insight: `This workflow has executed ${workflowState.executionCount} commands`,
        data: { executionCount: workflowState.executionCount }
      });

      if (workflowState.commandHistory?.length > 1) {
        insights.push({
          type: 'pattern_detection',
          insight: 'Similar commands detected in recent history',
          data: { patternStrength: 'medium' }
        });
      }
    }

    return insights;
  }

  _isRetryableError(error) {
    const retryableCodes = ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'];
    const retryableStatusCodes = [429, 500, 502, 503, 504];
    
    return retryableCodes.includes(error.code) ||
           retryableStatusCodes.includes(error.statusCode) ||
           retryableStatusCodes.includes(error.status);
  }

  // Saga compensation methods (implementations would be specific to your system)
  async _compensateGeneratedContent(contentIds) {
    // Implementation depends on your content storage system
    return { success: true, compensatedItems: contentIds.length };
  }

  async _compensateAllocatedResources(resources) {
    // Implementation depends on your resource management system
    return { success: true, releasedResources: resources.length };
  }

  async _compensateCacheEntries(cacheKeys) {
    cacheKeys.forEach(key => this.responseCache.delete(key));
    return { success: true, clearedEntries: cacheKeys.length };
  }

  /**
   * Get comprehensive health status
   */
  getHealthStatus() {
    const claudeMetrics = this.claudeService.getHealthMetrics();
    const cacheUtilization = this.responseCache.size / this.cacheConfig.maxSize;
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      worker: {
        name: `${config.app.workerName}-enhanced`,
        version: '2.0.0',
        capabilities: [
          'advanced-workflow-patterns',
          'saga-compensation',
          'cross-workflow-coordination',
          'intelligent-caching',
          'comprehensive-monitoring'
        ],
        metrics: this.metrics,
        successRate: this.metrics.totalTasks > 0 
          ? (this.metrics.successfulTasks / this.metrics.totalTasks) * 100 
          : 0
      },
      claudeApi: claudeMetrics,
      cache: {
        utilization: cacheUtilization,
        size: this.responseCache.size,
        maxSize: this.cacheConfig.maxSize,
        hitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100
      },
      workflow: {
        activeWorkflows: this.workflowStates.size,
        pendingCompensations: this.sagaCompensations.size,
        crossWorkflowCalls: this.metrics.crossWorkflowCalls
      },
      system: {
        nodeVersion: process.version,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };
  }

  /**
   * Graceful shutdown with workflow-aware cleanup
   */
  async shutdown() {
    this.logger.info('Shutting down enhanced Claude worker', {
      activeWorkflows: this.workflowStates.size,
      pendingCompensations: this.sagaCompensations.size,
      cacheSize: this.responseCache.size
    });

    // Clear caches
    this.responseCache.clear();
    this.workflowStates.clear();
    this.sagaCompensations.clear();

    // Shutdown Claude service
    await this.claudeService.shutdown();

    this.logger.info('Enhanced Claude worker shutdown complete', {
      totalTasksProcessed: this.metrics.totalTasks,
      finalSuccessRate: this.metrics.totalTasks > 0 
        ? (this.metrics.successfulTasks / this.metrics.totalTasks) * 100 
        : 0
    });
  }
}

export default EnhancedClaudeWorker;