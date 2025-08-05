/**
 * API Integration Monitoring and Rate Limiting System
 * Comprehensive monitoring for all external API integrations
 */

import { metricsCollector } from './metrics-collector.js';
import { createServiceLogger, logAPICall } from './logger.js';
import EventEmitter from 'events';

const logger = createServiceLogger('api-integration-monitor');

class APIIntegrationMonitor extends EventEmitter {
  constructor() {
    super();
    
    // API provider configurations
    this.apiProviders = new Map();
    this.rateLimiters = new Map();
    this.circuitBreakers = new Map();
    this.requestHistory = new Map();
    this.quotaTracking = new Map();
    
    // Monitoring intervals
    this.monitoringInterval = null;
    this.cleanupInterval = null;
    
    this.initializeProviders();
    this.startMonitoring();
  }

  /**
   * Initialize API provider configurations
   */
  initializeProviders() {
    const providers = {
      anthropic: {
        name: 'Anthropic Claude',
        baseUrl: 'https://api.anthropic.com',
        rateLimits: {
          requestsPerMinute: 100,
          tokensPerMinute: 60000,
          requestsPerDay: 10000
        },
        quotas: {
          monthly_requests: 1000000,
          monthly_tokens: 10000000
        },
        circuitBreaker: {
          failureThreshold: 5,
          recoveryTime: 30000,
          timeout: 10000
        },
        costPerRequest: 0.002,
        costPerToken: 0.000002
      },
      
      slack: {
        name: 'Slack API',
        baseUrl: 'https://slack.com/api',
        rateLimits: {
          requestsPerMinute: 100,
          requestsPerSecond: 1
        },
        quotas: {
          daily_messages: 10000
        },
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTime: 60000,
          timeout: 5000
        },
        costPerRequest: 0.0001
      },
      
      twilio: {
        name: 'Twilio',
        baseUrl: 'https://api.twilio.com',
        rateLimits: {
          requestsPerSecond: 10,
          messagesPerMinute: 200
        },
        quotas: {
          monthly_messages: 50000,
          monthly_calls: 10000
        },
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTime: 30000,
          timeout: 15000
        },
        costPerMessage: 0.0075,
        costPerCall: 0.013
      },
      
      apollo: {
        name: 'Apollo.io',
        baseUrl: 'https://api.apollo.io',
        rateLimits: {
          requestsPerMinute: 200,
          requestsPerHour: 10000
        },
        quotas: {
          monthly_enrichments: 100000,
          monthly_searches: 50000
        },
        circuitBreaker: {
          failureThreshold: 5,
          recoveryTime: 60000,
          timeout: 30000
        },
        costPerEnrichment: 0.02,
        costPerSearch: 0.05
      },
      
      leadspace: {
        name: 'Leadspace',
        baseUrl: 'https://api.leadspace.com',
        rateLimits: {
          requestsPerMinute: 100,
          requestsPerHour: 5000
        },
        quotas: {
          monthly_enrichments: 50000
        },
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTime: 120000,
          timeout: 45000
        },
        costPerEnrichment: 0.03
      },
      
      sureshot: {
        name: 'Sureshot',
        baseUrl: 'https://api.sureshot.io',
        rateLimits: {
          requestsPerMinute: 60,
          requestsPerHour: 3000
        },
        quotas: {
          monthly_campaigns: 1000,
          monthly_emails: 100000
        },
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTime: 60000,
          timeout: 20000
        },
        costPerCampaign: 0.10,
        costPerEmail: 0.001
      },
      
      microsoft: {
        name: 'Microsoft Graph',
        baseUrl: 'https://graph.microsoft.com',
        rateLimits: {
          requestsPerSecond: 10,
          requestsPerMinute: 600
        },
        quotas: {
          daily_requests: 50000
        },
        circuitBreaker: {
          failureThreshold: 5,
          recoveryTime: 30000,
          timeout: 10000
        },
        costPerRequest: 0.0005
      }
    };

    for (const [providerId, config] of Object.entries(providers)) {
      this.registerProvider(providerId, config);
    }
  }

  /**
   * Register an API provider for monitoring
   */
  registerProvider(providerId, config) {
    const providerData = {
      id: providerId,
      ...config,
      stats: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rateLimitHits: 0,
        circuitBreakerTrips: 0,
        avgResponseTime: 0,
        lastRequestTime: null,
        errorRate: 0,
        availability: 1.0,
        totalCost: 0
      },
      status: 'active',
      lastHealthCheck: Date.now()
    };

    this.apiProviders.set(providerId, providerData);
    
    // Initialize rate limiter
    this.initializeRateLimiter(providerId, config.rateLimits);
    
    // Initialize circuit breaker
    this.initializeCircuitBreaker(providerId, config.circuitBreaker);
    
    // Initialize quota tracking
    this.initializeQuotaTracking(providerId, config.quotas);

    logger.info('API provider registered', { providerId, provider: config.name });
  }

  /**
   * Initialize rate limiter for a provider
   */
  initializeRateLimiter(providerId, rateLimits) {
    const limiter = {
      windows: new Map(),
      limits: rateLimits,
      isLimited: (endpoint) => {
        const now = Date.now();
        
        for (const [period, limit] of Object.entries(rateLimits)) {
          const windowKey = `${providerId}:${endpoint}:${period}`;
          let windowSize;
          
          switch (period) {
            case 'requestsPerSecond':
              windowSize = 1000;
              break;
            case 'requestsPerMinute':
            case 'tokensPerMinute':
            case 'messagesPerMinute':
              windowSize = 60000;
              break;
            case 'requestsPerHour':
              windowSize = 3600000;
              break;
            case 'requestsPerDay':
              windowSize = 86400000;
              break;
            default:
              continue;
          }
          
          const windowStart = Math.floor(now / windowSize) * windowSize;
          const window = this.limiter.windows.get(windowKey) || { start: windowStart, count: 0 };
          
          if (window.start < windowStart) {
            window.start = windowStart;
            window.count = 0;
          }
          
          if (window.count >= limit) {
            return { limited: true, period, limit, current: window.count, resetTime: windowStart + windowSize };
          }
          
          this.limiter.windows.set(windowKey, window);
        }
        
        return { limited: false };
      },
      
      recordRequest: (endpoint, tokens = 1) => {
        const now = Date.now();
        
        for (const [period, limit] of Object.entries(rateLimits)) {
          const windowKey = `${providerId}:${endpoint}:${period}`;
          let windowSize;
          
          switch (period) {
            case 'requestsPerSecond':
              windowSize = 1000;
              break;
            case 'requestsPerMinute':
            case 'messagesPerMinute':
              windowSize = 60000;
              break;
            case 'tokensPerMinute':
              windowSize = 60000;
              break;
            case 'requestsPerHour':
              windowSize = 3600000;
              break;
            case 'requestsPerDay':
              windowSize = 86400000;
              break;
            default:
              continue;
          }
          
          const windowStart = Math.floor(now / windowSize) * windowSize;
          const window = this.limiter.windows.get(windowKey) || { start: windowStart, count: 0 };
          
          if (window.start < windowStart) {
            window.start = windowStart;
            window.count = 0;
          }
          
          if (period.includes('tokens')) {
            window.count += tokens;
          } else {
            window.count += 1;
          }
          
          this.limiter.windows.set(windowKey, window);
        }
      }
    };

    this.rateLimiters.set(providerId, limiter);
  }

  /**
   * Initialize circuit breaker for a provider
   */
  initializeCircuitBreaker(providerId, config) {
    const circuitBreaker = {
      state: 'closed', // closed, open, half-open
      failureCount: 0,
      lastFailureTime: null,
      nextAttemptTime: null,
      config,
      
      canExecute: () => {
        const now = Date.now();
        
        switch (circuitBreaker.state) {
          case 'closed':
            return true;
          case 'open':
            if (now >= circuitBreaker.nextAttemptTime) {
              circuitBreaker.state = 'half-open';
              return true;
            }
            return false;
          case 'half-open':
            return true;
          default:
            return false;
        }
      },
      
      recordSuccess: () => {
        circuitBreaker.failureCount = 0;
        circuitBreaker.state = 'closed';
      },
      
      recordFailure: () => {
        const now = Date.now();
        circuitBreaker.failureCount++;
        circuitBreaker.lastFailureTime = now;
        
        if (circuitBreaker.failureCount >= config.failureThreshold) {
          circuitBreaker.state = 'open';
          circuitBreaker.nextAttemptTime = now + config.recoveryTime;
          
          // Update provider stats
          const provider = this.apiProviders.get(providerId);
          if (provider) {
            provider.stats.circuitBreakerTrips++;
          }
          
          this.emit('circuit_breaker:open', { providerId, failureCount: circuitBreaker.failureCount });
          
          logger.warn('Circuit breaker opened', {
            providerId,
            failureCount: circuitBreaker.failureCount,
            nextAttemptTime: circuitBreaker.nextAttemptTime
          });
        }
      }
    };

    this.circuitBreakers.set(providerId, circuitBreaker);
  }

  /**
   * Initialize quota tracking for a provider
   */
  initializeQuotaTracking(providerId, quotas) {
    if (!quotas) return;
    
    const tracking = {
      quotas,
      usage: {},
      resetTimes: {}
    };
    
    const now = Date.now();
    for (const [quotaType, limit] of Object.entries(quotas)) {
      tracking.usage[quotaType] = 0;
      
      // Set reset time based on quota period
      if (quotaType.includes('daily')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        tracking.resetTimes[quotaType] = tomorrow.getTime();
      } else if (quotaType.includes('monthly')) {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
        nextMonth.setHours(0, 0, 0, 0);
        tracking.resetTimes[quotaType] = nextMonth.getTime();
      }
    }
    
    this.quotaTracking.set(providerId, tracking);
  }

  /**
   * Check if request can be made (rate limits, circuit breaker, quotas)
   */
  canMakeRequest(providerId, endpoint, tokens = 1) {
    const provider = this.apiProviders.get(providerId);
    if (!provider) {
      return { allowed: false, reason: 'Provider not found' };
    }

    if (provider.status !== 'active') {
      return { allowed: false, reason: 'Provider not active' };
    }

    // Check circuit breaker
    const circuitBreaker = this.circuitBreakers.get(providerId);
    if (circuitBreaker && !circuitBreaker.canExecute()) {
      return { 
        allowed: false, 
        reason: 'Circuit breaker open',
        nextAttemptTime: circuitBreaker.nextAttemptTime 
      };
    }

    // Check rate limits
    const rateLimiter = this.rateLimiters.get(providerId);
    if (rateLimiter) {
      const limitCheck = rateLimiter.isLimited(endpoint);
      if (limitCheck.limited) {
        return { 
          allowed: false, 
          reason: 'Rate limit exceeded',
          ...limitCheck 
        };
      }
    }

    // Check quotas
    const quotaTracking = this.quotaTracking.get(providerId);
    if (quotaTracking) {
      for (const [quotaType, limit] of Object.entries(quotaTracking.quotas)) {
        const usage = quotaTracking.usage[quotaType] || 0;
        if (usage >= limit) {
          return { 
            allowed: false, 
            reason: 'Quota exceeded',
            quotaType,
            limit,
            usage,
            resetTime: quotaTracking.resetTimes[quotaType]
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Record API request
   */
  async recordRequest(providerId, endpoint, method, startTime, endTime, statusCode, responseSize = 0, tokens = 1, cost = 0, error = null) {
    const provider = this.apiProviders.get(providerId);
    if (!provider) return;

    const duration = (endTime - startTime) / 1000;
    const isSuccess = statusCode >= 200 && statusCode < 300;

    // Update provider stats
    provider.stats.totalRequests++;
    provider.stats.lastRequestTime = endTime;
    
    if (isSuccess) {
      provider.stats.successfulRequests++;
    } else {
      provider.stats.failedRequests++;
    }

    // Update average response time
    const totalRequests = provider.stats.totalRequests;
    provider.stats.avgResponseTime = 
      ((provider.stats.avgResponseTime * (totalRequests - 1)) + duration) / totalRequests;

    // Update error rate
    provider.stats.errorRate = provider.stats.failedRequests / provider.stats.totalRequests;

    // Update cost
    provider.stats.totalCost += cost;

    // Record in rate limiter
    const rateLimiter = this.rateLimiters.get(providerId);
    if (rateLimiter) {
      rateLimiter.recordRequest(endpoint, tokens);
    }

    // Update quota usage
    const quotaTracking = this.quotaTracking.get(providerId);
    if (quotaTracking) {
      // Determine quota type based on endpoint/method
      let quotaType = null;
      if (endpoint.includes('enrich')) quotaType = 'monthly_enrichments';
      else if (endpoint.includes('search')) quotaType = 'monthly_searches';
      else if (endpoint.includes('message')) quotaType = 'monthly_messages';
      else if (endpoint.includes('campaign')) quotaType = 'monthly_campaigns';
      else if (method === 'POST') quotaType = 'monthly_requests';
      else quotaType = 'daily_requests';
      
      if (quotaType && quotaTracking.usage[quotaType] !== undefined) {
        quotaTracking.usage[quotaType] += tokens;
      }
    }

    // Update circuit breaker
    const circuitBreaker = this.circuitBreakers.get(providerId);
    if (circuitBreaker) {
      if (isSuccess) {
        circuitBreaker.recordSuccess();
      } else if (statusCode >= 500 || error) {
        circuitBreaker.recordFailure();
      }
    }

    // Handle rate limiting
    if (statusCode === 429) {
      provider.stats.rateLimitHits++;
      metricsCollector.recordAPIRateLimit(providerId, endpoint);
      
      this.emit('rate_limit:hit', { providerId, endpoint });
    }

    // Record metrics
    metricsCollector.recordAPIRequest(providerId, endpoint, duration, statusCode);
    if (cost > 0) {
      metricsCollector.recordAPICost(providerId, 'request', cost);
    }

    // Log API call
    logAPICall(providerId, endpoint, `${method} ${endpoint}`, {
      duration,
      statusCode,
      responseSize,
      tokens,
      cost,
      error: error?.message,
      success: isSuccess
    });

    // Store request history for analysis
    this.storeRequestHistory(providerId, {
      endpoint,
      method,
      startTime,
      endTime,
      duration,
      statusCode,
      responseSize,
      tokens,
      cost,
      error: error?.message,
      success: isSuccess
    });

    logger.debug('API request recorded', {
      providerId,
      endpoint,
      method,
      duration,
      statusCode,
      success: isSuccess
    });
  }

  /**
   * Store request history for analysis
   */
  storeRequestHistory(providerId, requestData) {
    if (!this.requestHistory.has(providerId)) {
      this.requestHistory.set(providerId, []);
    }

    const history = this.requestHistory.get(providerId);
    history.push(requestData);

    // Keep only last 1000 requests per provider
    if (history.length > 1000) {
      history.shift();
    }
  }

  /**
   * Get provider statistics
   */
  getProviderStats(providerId = null) {
    if (providerId) {
      const provider = this.apiProviders.get(providerId);
      if (!provider) return null;

      const circuitBreaker = this.circuitBreakers.get(providerId);
      const quotaTracking = this.quotaTracking.get(providerId);
      
      return {
        ...provider,
        circuitBreaker: circuitBreaker ? {
          state: circuitBreaker.state,
          failureCount: circuitBreaker.failureCount,
          nextAttemptTime: circuitBreaker.nextAttemptTime
        } : null,
        quotas: quotaTracking ? {
          usage: quotaTracking.usage,
          limits: quotaTracking.quotas,
          resetTimes: quotaTracking.resetTimes
        } : null
      };
    }

    const stats = [];
    for (const [id, provider] of this.apiProviders.entries()) {
      stats.push(this.getProviderStats(id));
    }
    return stats;
  }

  /**
   * Get quota usage for all providers
   */
  getQuotaUsage() {
    const quotaUsage = {};
    
    for (const [providerId, tracking] of this.quotaTracking.entries()) {
      quotaUsage[providerId] = {};
      
      for (const [quotaType, limit] of Object.entries(tracking.quotas)) {
        const usage = tracking.usage[quotaType] || 0;
        const usagePercent = (usage / limit) * 100;
        
        quotaUsage[providerId][quotaType] = {
          usage,
          limit,
          usagePercent,
          resetTime: tracking.resetTimes[quotaType]
        };
        
        // Record metrics
        metricsCollector.recordAPIQuotaUsage(providerId, quotaType, usagePercent / 100);
      }
    }
    
    return quotaUsage;
  }

  /**
   * Get request history analysis
   */
  getRequestAnalysis(providerId, timeWindow = 3600000) { // 1 hour default
    const history = this.requestHistory.get(providerId);
    if (!history) return null;

    const now = Date.now();
    const cutoff = now - timeWindow;
    const recentRequests = history.filter(req => req.startTime >= cutoff);

    if (recentRequests.length === 0) {
      return { providerId, timeWindow, requestCount: 0 };
    }

    const analysis = {
      providerId,
      timeWindow,
      requestCount: recentRequests.length,
      successRate: recentRequests.filter(r => r.success).length / recentRequests.length,
      avgResponseTime: recentRequests.reduce((sum, r) => sum + r.duration, 0) / recentRequests.length,
      totalCost: recentRequests.reduce((sum, r) => sum + (r.cost || 0), 0),
      totalTokens: recentRequests.reduce((sum, r) => sum + (r.tokens || 0), 0),
      statusCodes: {},
      endpoints: {},
      errors: {}
    };

    // Analyze status codes
    for (const request of recentRequests) {
      analysis.statusCodes[request.statusCode] = (analysis.statusCodes[request.statusCode] || 0) + 1;
    }

    // Analyze endpoints
    for (const request of recentRequests) {
      if (!analysis.endpoints[request.endpoint]) {
        analysis.endpoints[request.endpoint] = {
          count: 0,
          avgDuration: 0,
          successRate: 0,
          totalCost: 0
        };
      }
      
      const endpointStats = analysis.endpoints[request.endpoint];
      endpointStats.count++;
      endpointStats.avgDuration = ((endpointStats.avgDuration * (endpointStats.count - 1)) + request.duration) / endpointStats.count;
      endpointStats.totalCost += request.cost || 0;
    }

    // Calculate endpoint success rates
    for (const [endpoint, stats] of Object.entries(analysis.endpoints)) {
      const endpointRequests = recentRequests.filter(r => r.endpoint === endpoint);
      stats.successRate = endpointRequests.filter(r => r.success).length / endpointRequests.length;
    }

    // Analyze errors
    for (const request of recentRequests) {
      if (request.error) {
        analysis.errors[request.error] = (analysis.errors[request.error] || 0) + 1;
      }
    }

    return analysis;
  }

  /**
   * Perform health check on all providers
   */
  async performHealthCheck() {
    const now = Date.now();
    
    for (const [providerId, provider] of this.apiProviders.entries()) {
      try {
        // Simple health check - analyze recent performance
        const analysis = this.getRequestAnalysis(providerId, 300000); // 5 minutes
        
        if (analysis && analysis.requestCount > 0) {
          // Update availability based on success rate
          provider.stats.availability = analysis.successRate;
          
          // Check if provider should be marked as unhealthy
          if (analysis.successRate < 0.5) { // Less than 50% success rate
            provider.status = 'unhealthy';
            this.emit('provider:unhealthy', { providerId, successRate: analysis.successRate });
          } else if (provider.status === 'unhealthy' && analysis.successRate > 0.8) {
            provider.status = 'active';
            this.emit('provider:recovered', { providerId, successRate: analysis.successRate });
          }
        }
        
        provider.lastHealthCheck = now;
        
      } catch (error) {
        logger.error('Health check failed for provider', {
          providerId,
          error: error.message
        });
      }
    }
  }

  /**
   * Reset quota usage (called by scheduler)
   */
  resetQuotas() {
    const now = Date.now();
    
    for (const [providerId, tracking] of this.quotaTracking.entries()) {
      for (const [quotaType, resetTime] of Object.entries(tracking.resetTimes)) {
        if (now >= resetTime) {
          tracking.usage[quotaType] = 0;
          
          // Set next reset time
          if (quotaType.includes('daily')) {
            const tomorrow = new Date(resetTime);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tracking.resetTimes[quotaType] = tomorrow.getTime();
          } else if (quotaType.includes('monthly')) {
            const nextMonth = new Date(resetTime);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            tracking.resetTimes[quotaType] = nextMonth.getTime();
          }
          
          logger.info('Quota reset', { providerId, quotaType });
        }
      }
    }
  }

  /**
   * Start monitoring
   */
  startMonitoring() {
    // Health checks every 5 minutes
    this.monitoringInterval = setInterval(() => {
      this.performHealthCheck();
    }, 300000);

    // Cleanup and quota reset every hour
    this.cleanupInterval = setInterval(() => {
      this.resetQuotas();
      this.cleanupOldData();
    }, 3600000);

    logger.info('Started API integration monitoring');
  }

  /**
   * Cleanup old data
   */
  cleanupOldData() {
    const now = Date.now();
    const maxAge = 86400000; // 24 hours

    // Clean rate limiter windows
    for (const limiter of this.rateLimiters.values()) {
      for (const [windowKey, window] of limiter.windows.entries()) {
        if (now - window.start > maxAge) {
          limiter.windows.delete(windowKey);
        }
      }
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    logger.info('Stopped API integration monitoring');
  }

  /**
   * Generate monitoring report
   */
  generateReport() {
    return {
      timestamp: Date.now(),
      providers: this.getProviderStats(),
      quotaUsage: this.getQuotaUsage(),
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([id, cb]) => ({
        providerId: id,
        state: cb.state,
        failureCount: cb.failureCount,
        nextAttemptTime: cb.nextAttemptTime
      })),
      summary: {
        totalProviders: this.apiProviders.size,
        activeProviders: Array.from(this.apiProviders.values()).filter(p => p.status === 'active').length,
        totalRequests: Array.from(this.apiProviders.values()).reduce((sum, p) => sum + p.stats.totalRequests, 0),
        totalCost: Array.from(this.apiProviders.values()).reduce((sum, p) => sum + p.stats.totalCost, 0),
        avgSuccessRate: Array.from(this.apiProviders.values()).reduce((sum, p) => sum + (1 - p.stats.errorRate), 0) / this.apiProviders.size
      }
    };
  }
}

// Export singleton instance
const apiIntegrationMonitor = new APIIntegrationMonitor();

export { APIIntegrationMonitor, apiIntegrationMonitor };
export default apiIntegrationMonitor;