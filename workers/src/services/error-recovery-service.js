import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';
import pRetry from 'p-retry';
import { createContextLogger, createTimer } from '../utils/logger.js';
import config from '../config/index.js';

/**
 * Comprehensive Error Recovery Service for Data Source Failures
 * Handles circuit breakers, retries, fallbacks, and recovery strategies
 */
class ErrorRecoveryService extends EventEmitter {
  constructor() {
    super();
    
    this.logger = createContextLogger({ service: 'error-recovery' });
    
    // Circuit breaker states for each service
    this.circuitBreakers = new Map();
    
    // Error tracking and analysis
    this.errorTracking = {
      recent: new Map(), // Recent errors by service
      patterns: new Map(), // Error pattern analysis
      recovery: new Map(), // Recovery attempt tracking
    };
    
    // Recovery strategies
    this.recoveryStrategies = {
      retry: this.retryStrategy.bind(this),
      circuitBreaker: this.circuitBreakerStrategy.bind(this),
      fallback: this.fallbackStrategy.bind(this),
      gracefulDegradation: this.gracefulDegradationStrategy.bind(this),
      bulkhead: this.bulkheadStrategy.bind(this),
    };
    
    // Configuration
    this.config = {
      circuitBreaker: {
        failureThreshold: config.errorRecovery?.circuitBreaker?.failureThreshold || 5,
        timeout: config.errorRecovery?.circuitBreaker?.timeout || 60000, // 1 minute
        resetTimeout: config.errorRecovery?.circuitBreaker?.resetTimeout || 300000, // 5 minutes
      },
      retryPolicy: {
        maxRetries: config.errorRecovery?.retry?.maxRetries || 3,
        baseDelay: config.errorRecovery?.retry?.baseDelay || 1000,
        maxDelay: config.errorRecovery?.retry?.maxDelay || 30000,
        backoffFactor: config.errorRecovery?.retry?.backoffFactor || 2,
      },
      errorAnalysis: {
        windowSize: config.errorRecovery?.analysis?.windowSize || 100,
        patternThreshold: config.errorRecovery?.analysis?.patternThreshold || 0.3,
      },
      healthCheck: {
        interval: config.errorRecovery?.healthCheck?.interval || 30000,
        timeout: config.errorRecovery?.healthCheck?.timeout || 5000,
      },
    };
    
    // Performance metrics
    this.metrics = {
      totalErrors: 0,
      recoveredErrors: 0,
      permanentFailures: 0,
      circuitBreakerTrips: 0,
      fallbackActivations: 0,
      averageRecoveryTime: 0,
      errorsByService: {},
      errorsByType: {},
      recoverySuccess: {
        retry: 0,
        fallback: 0,
        gracefulDegradation: 0,
      },
    };

    // Start background processes
    this.startBackgroundProcesses();

    this.logger.info('Error recovery service initialized', {
      strategies: Object.keys(this.recoveryStrategies),
      circuitBreakerConfig: this.config.circuitBreaker,
      retryConfig: this.config.retryPolicy,
    });
  }

  /**
   * Start background monitoring processes
   * @private
   */
  startBackgroundProcesses() {
    // Health check interval
    this.healthCheckIntervalId = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheck.interval);

    // Error pattern analysis
    this.patternAnalysisIntervalId = setInterval(() => {
      this.analyzeErrorPatterns();
    }, 60000); // Every minute

    // Circuit breaker maintenance
    this.circuitBreakerMaintenanceId = setInterval(() => {
      this.maintainCircuitBreakers();
    }, 30000); // Every 30 seconds

    this.logger.info('Background monitoring processes started');
  }

  /**
   * Execute operation with comprehensive error handling
   * @param {Function} operation - Operation to execute
   * @param {Object} options - Error handling options
   * @returns {Promise<Object>} Operation result with error handling
   */
  async executeWithErrorHandling(operation, options = {}) {
    const operationId = uuidv4();
    const timer = createTimer('error-handled-operation');
    const logger = createContextLogger({
      service: 'error-recovery',
      operationId,
      method: 'executeWithErrorHandling',
    });

    const serviceName = options.serviceName || 'unknown';
    const strategies = options.strategies || ['retry', 'circuitBreaker', 'fallback'];

    logger.info('Executing operation with error handling', {
      serviceName,
      strategies,
      operationId,
    });

    try {
      // Check circuit breaker first
      if (strategies.includes('circuitBreaker')) {
        const circuitBreakerCheck = this.checkCircuitBreaker(serviceName);
        if (!circuitBreakerCheck.canExecute) {
          logger.warn('Circuit breaker is open, operation blocked', {
            serviceName,
            state: circuitBreakerCheck.state,
          });

          return await this.handleCircuitBreakerOpen(operation, options, logger);
        }
      }

      // Execute with retry strategy
      let result;
      if (strategies.includes('retry')) {
        result = await this.executeWithRetry(operation, options, logger);
      } else {
        result = await operation();
      }

      // Record success
      this.recordSuccess(serviceName, timer.end());
      
      logger.info('Operation completed successfully', {
        operationId,
        serviceName,
        duration: timer.getElapsed(),
      });

      return {
        success: true,
        result,
        operationId,
        serviceName,
        recoveryUsed: false,
      };

    } catch (error) {
      const duration = timer.end();
      
      logger.error('Operation failed after error handling', {
        operationId,
        serviceName,
        error: error.message,
        duration,
      });

      // Record failure and attempt recovery
      this.recordError(serviceName, error, duration);
      
      // Try recovery strategies
      const recoveryResult = await this.attemptRecovery(
        operation,
        error,
        options,
        logger
      );

      if (recoveryResult.success) {
        this.metrics.recoveredErrors++;
        return recoveryResult;
      } else {
        this.metrics.permanentFailures++;
        return {
          success: false,
          error: error.message,
          operationId,
          serviceName,
          recoveryAttempted: true,
          recoveryResult,
        };
      }
    }
  }

  /**
   * Execute operation with retry strategy
   * @private
   */
  async executeWithRetry(operation, options, logger) {
    const retryOptions = {
      retries: options.maxRetries || this.config.retryPolicy.maxRetries,
      factor: options.backoffFactor || this.config.retryPolicy.backoffFactor,
      minTimeout: options.baseDelay || this.config.retryPolicy.baseDelay,
      maxTimeout: options.maxDelay || this.config.retryPolicy.maxDelay,
      randomize: true,
      onFailedAttempt: (error) => {
        logger.warn('Retry attempt failed', {
          attempt: error.attemptNumber,
          retriesLeft: error.retriesLeft,
          error: error.message,
        });
        
        this.recordRetryAttempt(options.serviceName || 'unknown', error);
      },
    };

    return await pRetry(operation, retryOptions);
  }

  /**
   * Attempt error recovery using available strategies
   * @private
   */
  async attemptRecovery(operation, error, options, logger) {
    const serviceName = options.serviceName || 'unknown';
    const strategies = options.strategies || ['fallback', 'gracefulDegradation'];
    
    logger.info('Attempting error recovery', {
      serviceName,
      error: error.message,
      strategies,
    });

    // Try each recovery strategy in order
    for (const strategyName of strategies) {
      if (strategyName === 'retry') continue; // Already tried
      
      const strategy = this.recoveryStrategies[strategyName];
      if (!strategy) {
        logger.warn('Unknown recovery strategy', { strategy: strategyName });
        continue;
      }

      try {
        logger.info('Trying recovery strategy', { strategy: strategyName });
        
        const recoveryResult = await strategy(operation, error, options, logger);
        
        if (recoveryResult.success) {
          this.metrics.recoverySuccess[strategyName]++;
          
          logger.info('Recovery strategy successful', {
            strategy: strategyName,
            serviceName,
          });

          return {
            success: true,
            result: recoveryResult.result,
            recoveryUsed: true,
            recoveryStrategy: strategyName,
            serviceName,
          };
        }
      } catch (recoveryError) {
        logger.warn('Recovery strategy failed', {
          strategy: strategyName,
          error: recoveryError.message,
        });
      }
    }

    logger.error('All recovery strategies failed', { serviceName });
    
    return {
      success: false,
      error: 'All recovery strategies exhausted',
      serviceName,
    };
  }

  /**
   * Retry recovery strategy
   * @private
   */
  async retryStrategy(operation, error, options, logger) {
    // This is handled in executeWithRetry
    return { success: false, error: 'Retry already attempted' };
  }

  /**
   * Circuit breaker recovery strategy
   * @private
   */
  async circuitBreakerStrategy(operation, error, options, logger) {
    const serviceName = options.serviceName || 'unknown';
    
    // Update circuit breaker state
    this.updateCircuitBreaker(serviceName, false);
    
    // Circuit breaker doesn't provide recovery, just prevents further calls
    return { success: false, error: 'Circuit breaker activated' };
  }

  /**
   * Fallback recovery strategy
   * @private
   */
  async fallbackStrategy(operation, error, options, logger) {
    const fallbackOperation = options.fallbackOperation;
    
    if (!fallbackOperation) {
      return { success: false, error: 'No fallback operation provided' };
    }

    logger.info('Executing fallback operation');
    
    try {
      const result = await fallbackOperation();
      this.metrics.fallbackActivations++;
      
      return {
        success: true,
        result,
        fallbackUsed: true,
      };
    } catch (fallbackError) {
      return {
        success: false,
        error: `Fallback failed: ${fallbackError.message}`,
      };
    }
  }

  /**
   * Graceful degradation recovery strategy
   * @private
   */
  async gracefulDegradationStrategy(operation, error, options, logger) {
    const degradedOperation = options.degradedOperation;
    
    if (!degradedOperation) {
      // Return minimal/cached response
      const minimalResponse = options.minimalResponse || {
        success: true,
        data: [],
        degraded: true,
        message: 'Service temporarily unavailable, returning minimal response',
      };
      
      return {
        success: true,
        result: minimalResponse,
        degraded: true,
      };
    }

    logger.info('Executing degraded operation');
    
    try {
      const result = await degradedOperation();
      
      return {
        success: true,
        result: {
          ...result,
          degraded: true,
        },
        degraded: true,
      };
    } catch (degradedError) {
      return {
        success: false,
        error: `Degraded operation failed: ${degradedError.message}`,
      };
    }
  }

  /**
   * Bulkhead recovery strategy
   * @private
   */
  async bulkheadStrategy(operation, error, options, logger) {
    // Isolate the failing operation to prevent cascade failures
    logger.info('Applying bulkhead isolation');
    
    // This strategy typically involves resource isolation
    // For now, we'll just prevent the error from propagating
    return {
      success: true,
      result: {
        success: false,
        error: error.message,
        isolated: true,
        message: 'Operation isolated to prevent cascade failure',
      },
      isolated: true,
    };
  }

  /**
   * Check circuit breaker state for service
   * @private
   */
  checkCircuitBreaker(serviceName) {
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    
    if (!circuitBreaker) {
      // Initialize circuit breaker for new service
      this.initializeCircuitBreaker(serviceName);
      return { canExecute: true, state: 'CLOSED' };
    }

    const now = Date.now();
    
    switch (circuitBreaker.state) {
      case 'CLOSED':
        return { canExecute: true, state: 'CLOSED' };
        
      case 'OPEN':
        if (now - circuitBreaker.lastFailureTime > this.config.circuitBreaker.resetTimeout) {
          // Move to half-open state
          circuitBreaker.state = 'HALF_OPEN';
          circuitBreaker.consecutiveFailures = 0;
          return { canExecute: true, state: 'HALF_OPEN' };
        }
        return { canExecute: false, state: 'OPEN' };
        
      case 'HALF_OPEN':
        return { canExecute: true, state: 'HALF_OPEN' };
        
      default:
        return { canExecute: true, state: 'CLOSED' };
    }
  }

  /**
   * Handle circuit breaker open state
   * @private
   */
  async handleCircuitBreakerOpen(operation, options, logger) {
    const serviceName = options.serviceName || 'unknown';
    
    // Try fallback or degraded operation if available
    if (options.fallbackOperation) {
      logger.info('Circuit breaker open, using fallback');
      
      try {
        const result = await options.fallbackOperation();
        this.metrics.fallbackActivations++;
        
        return {
          success: true,
          result,
          circuitBreakerOpen: true,
          fallbackUsed: true,
          serviceName,
        };
      } catch (fallbackError) {
        logger.error('Fallback operation failed', { error: fallbackError.message });
      }
    }

    // Return error response
    return {
      success: false,
      error: `Service ${serviceName} is currently unavailable (circuit breaker open)`,
      circuitBreakerOpen: true,
      serviceName,
    };
  }

  /**
   * Initialize circuit breaker for service
   * @private
   */
  initializeCircuitBreaker(serviceName) {
    this.circuitBreakers.set(serviceName, {
      state: 'CLOSED',
      consecutiveFailures: 0,
      lastFailureTime: null,
      totalRequests: 0,
      failedRequests: 0,
    });
  }

  /**
   * Update circuit breaker state
   * @private
   */
  updateCircuitBreaker(serviceName, success) {
    let circuitBreaker = this.circuitBreakers.get(serviceName);
    
    if (!circuitBreaker) {
      this.initializeCircuitBreaker(serviceName);
      circuitBreaker = this.circuitBreakers.get(serviceName);
    }

    circuitBreaker.totalRequests++;

    if (success) {
      // Reset failure count on success
      circuitBreaker.consecutiveFailures = 0;
      
      // Close circuit breaker if it was half-open
      if (circuitBreaker.state === 'HALF_OPEN') {
        circuitBreaker.state = 'CLOSED';
      }
    } else {
      circuitBreaker.failedRequests++;
      circuitBreaker.consecutiveFailures++;
      circuitBreaker.lastFailureTime = Date.now();

      // Open circuit breaker if failure threshold reached
      if (circuitBreaker.consecutiveFailures >= this.config.circuitBreaker.failureThreshold) {
        if (circuitBreaker.state !== 'OPEN') {
          circuitBreaker.state = 'OPEN';
          this.metrics.circuitBreakerTrips++;
          
          this.logger.warn('Circuit breaker opened', {
            serviceName,
            consecutiveFailures: circuitBreaker.consecutiveFailures,
            failureThreshold: this.config.circuitBreaker.failureThreshold,
          });

          this.emit('circuitBreakerOpened', { serviceName, circuitBreaker });
        }
      }
    }
  }

  /**
   * Record successful operation
   * @private
   */
  recordSuccess(serviceName, duration) {
    this.updateCircuitBreaker(serviceName, true);
    
    // Update service metrics
    if (!this.metrics.errorsByService[serviceName]) {
      this.metrics.errorsByService[serviceName] = {
        total: 0,
        success: 0,
        failed: 0,
        circuitBreakerTrips: 0,
      };
    }
    
    this.metrics.errorsByService[serviceName].total++;
    this.metrics.errorsByService[serviceName].success++;
  }

  /**
   * Record error occurrence
   * @private
   */
  recordError(serviceName, error, duration) {
    this.metrics.totalErrors++;
    this.updateCircuitBreaker(serviceName, false);
    
    // Update service metrics
    if (!this.metrics.errorsByService[serviceName]) {
      this.metrics.errorsByService[serviceName] = {
        total: 0,
        success: 0,
        failed: 0,
        circuitBreakerTrips: 0,
      };
    }
    
    this.metrics.errorsByService[serviceName].total++;
    this.metrics.errorsByService[serviceName].failed++;
    
    // Update error type metrics
    const errorType = this.classifyError(error);
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;
    
    // Store recent error for pattern analysis
    this.storeRecentError(serviceName, error, duration);
  }

  /**
   * Record retry attempt
   * @private
   */
  recordRetryAttempt(serviceName, error) {
    if (!this.errorTracking.recent.has(serviceName)) {
      this.errorTracking.recent.set(serviceName, []);
    }
    
    const recentErrors = this.errorTracking.recent.get(serviceName);
    recentErrors.push({
      timestamp: Date.now(),
      error: error.message,
      attempt: error.attemptNumber,
      type: 'retry',
    });
    
    // Keep only recent errors
    if (recentErrors.length > this.config.errorAnalysis.windowSize) {
      recentErrors.shift();
    }
  }

  /**
   * Store recent error for analysis
   * @private
   */
  storeRecentError(serviceName, error, duration) {
    if (!this.errorTracking.recent.has(serviceName)) {
      this.errorTracking.recent.set(serviceName, []);
    }
    
    const recentErrors = this.errorTracking.recent.get(serviceName);
    recentErrors.push({
      timestamp: Date.now(),
      error: error.message,
      type: this.classifyError(error),
      duration,
    });
    
    // Keep only recent errors
    if (recentErrors.length > this.config.errorAnalysis.windowSize) {
      recentErrors.shift();
    }
  }

  /**
   * Classify error type
   * @private
   */
  classifyError(error) {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('timeout') || message.includes('etimedout')) {
      return 'timeout';
    }
    if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) {
      return 'network';
    }
    if (message.includes('rate limit') || message.includes('429')) {
      return 'rate_limit';
    }
    if (message.includes('auth') || message.includes('401') || message.includes('403')) {
      return 'authentication';
    }
    if (message.includes('400') || message.includes('validation')) {
      return 'validation';
    }
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return 'server_error';
    }
    
    return 'unknown';
  }

  /**
   * Perform health checks on services
   * @private
   */
  async performHealthChecks() {
    for (const [serviceName, circuitBreaker] of this.circuitBreakers.entries()) {
      if (circuitBreaker.state === 'OPEN') {
        // Try to perform a health check to see if service is recovering
        try {
          await this.performServiceHealthCheck(serviceName);
          
          // If health check passes, move to half-open
          circuitBreaker.state = 'HALF_OPEN';
          circuitBreaker.consecutiveFailures = 0;
          
          this.logger.info('Service health check passed, moving to half-open', {
            serviceName,
          });
          
          this.emit('serviceRecovering', { serviceName });
          
        } catch (error) {
          // Health check failed, keep circuit breaker open
          this.logger.debug('Service health check failed', {
            serviceName,
            error: error.message,
          });
        }
      }
    }
  }

  /**
   * Perform health check for specific service
   * @private
   */
  async performServiceHealthCheck(serviceName) {
    // This would typically make a lightweight request to the service
    // For now, we'll simulate a health check
    
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate health check result
        const isHealthy = Math.random() > 0.3; // 70% chance of being healthy
        
        if (isHealthy) {
          resolve({ status: 'healthy', service: serviceName });
        } else {
          reject(new Error(`Health check failed for ${serviceName}`));
        }
      }, 100);
    });
  }

  /**
   * Analyze error patterns
   * @private
   */
  async analyzeErrorPatterns() {
    for (const [serviceName, recentErrors] of this.errorTracking.recent.entries()) {
      if (recentErrors.length < 10) continue; // Need enough data
      
      const patterns = this.detectErrorPatterns(recentErrors);
      
      if (patterns.length > 0) {
        this.errorTracking.patterns.set(serviceName, patterns);
        
        this.logger.info('Error patterns detected', {
          serviceName,
          patterns: patterns.map(p => ({ type: p.type, frequency: p.frequency })),
        });
        
        this.emit('errorPatternsDetected', { serviceName, patterns });
      }
    }
  }

  /**
   * Detect error patterns in recent errors
   * @private
   */
  detectErrorPatterns(errors) {
    const patterns = [];
    const errorTypes = {};
    
    // Count error types
    errors.forEach(error => {
      errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
    });
    
    // Detect high-frequency patterns
    Object.entries(errorTypes).forEach(([type, count]) => {
      const frequency = count / errors.length;
      
      if (frequency > this.config.errorAnalysis.patternThreshold) {
        patterns.push({
          type,
          frequency,
          count,
          severity: this.getPatternSeverity(type, frequency),
        });
      }
    });
    
    return patterns;
  }

  /**
   * Get pattern severity
   * @private
   */
  getPatternSeverity(type, frequency) {
    if (frequency > 0.8) return 'critical';
    if (frequency > 0.6) return 'high';
    if (frequency > 0.4) return 'medium';
    return 'low';
  }

  /**
   * Maintain circuit breakers
   * @private
   */
  maintainCircuitBreakers() {
    const now = Date.now();
    
    for (const [serviceName, circuitBreaker] of this.circuitBreakers.entries()) {
      // Reset circuit breaker if it's been open too long
      if (circuitBreaker.state === 'OPEN' && 
          circuitBreaker.lastFailureTime && 
          now - circuitBreaker.lastFailureTime > this.config.circuitBreaker.resetTimeout * 2) {
        
        circuitBreaker.state = 'HALF_OPEN';
        circuitBreaker.consecutiveFailures = 0;
        
        this.logger.info('Circuit breaker reset due to timeout', { serviceName });
        this.emit('circuitBreakerReset', { serviceName });
      }
    }
  }

  /**
   * Get error recovery status for service
   * @param {string} serviceName - Service name
   * @returns {Object} Service status
   */
  getServiceStatus(serviceName) {
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    const recentErrors = this.errorTracking.recent.get(serviceName) || [];
    const patterns = this.errorTracking.patterns.get(serviceName) || [];
    const serviceMetrics = this.metrics.errorsByService[serviceName] || {};

    return {
      serviceName,
      circuitBreaker: circuitBreaker ? {
        state: circuitBreaker.state,
        consecutiveFailures: circuitBreaker.consecutiveFailures,
        totalRequests: circuitBreaker.totalRequests,
        failedRequests: circuitBreaker.failedRequests,
        lastFailureTime: circuitBreaker.lastFailureTime,
      } : null,
      recentErrors: recentErrors.slice(-10), // Last 10 errors
      errorPatterns: patterns,
      metrics: serviceMetrics,
      health: this.assessServiceHealth(serviceName),
    };
  }

  /**
   * Assess service health
   * @private
   */
  assessServiceHealth(serviceName) {
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    const recentErrors = this.errorTracking.recent.get(serviceName) || [];
    
    if (!circuitBreaker) {
      return { status: 'unknown', reason: 'No data available' };
    }
    
    if (circuitBreaker.state === 'OPEN') {
      return { status: 'unhealthy', reason: 'Circuit breaker open' };
    }
    
    const recentErrorCount = recentErrors.filter(
      e => Date.now() - e.timestamp < 300000 // Last 5 minutes
    ).length;
    
    if (recentErrorCount > 10) {
      return { status: 'degraded', reason: 'High error rate' };
    }
    
    if (recentErrorCount > 5) {
      return { status: 'warning', reason: 'Elevated error rate' };
    }
    
    return { status: 'healthy', reason: 'Operating normally' };
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    const activeCircuitBreakers = Array.from(this.circuitBreakers.entries()).map(([name, cb]) => ({
      service: name,
      state: cb.state,
      consecutiveFailures: cb.consecutiveFailures,
    }));

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      activeCircuitBreakers,
      errorPatterns: Array.from(this.errorTracking.patterns.entries()).map(([service, patterns]) => ({
        service,
        patternCount: patterns.length,
      })),
      config: this.config,
    };
  }

  /**
   * Shutdown service gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down error recovery service');

    try {
      // Clear intervals
      if (this.healthCheckIntervalId) {
        clearInterval(this.healthCheckIntervalId);
      }
      
      if (this.patternAnalysisIntervalId) {
        clearInterval(this.patternAnalysisIntervalId);
      }
      
      if (this.circuitBreakerMaintenanceId) {
        clearInterval(this.circuitBreakerMaintenanceId);
      }

      // Clear tracking data
      this.circuitBreakers.clear();
      this.errorTracking.recent.clear();
      this.errorTracking.patterns.clear();
      this.errorTracking.recovery.clear();

      this.logger.info('Error recovery service shutdown complete', {
        totalErrors: this.metrics.totalErrors,
        recoveredErrors: this.metrics.recoveredErrors,
        recoveryRate: this.metrics.totalErrors > 0 
          ? Math.round((this.metrics.recoveredErrors / this.metrics.totalErrors) * 100)
          : 0,
      });

    } catch (error) {
      this.logger.error('Error during shutdown', { error: error.message });
    }
  }
}

export default ErrorRecoveryService;