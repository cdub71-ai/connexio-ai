import axios from 'axios';
import pRetry from 'p-retry';
import PQueue from 'p-queue';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { createContextLogger, createTimer } from '../utils/logger.js';

/**
 * Sureshot API Client for Eloqua Integration
 * Handles authentication, rate limiting, retries, and comprehensive error handling
 */
class SureshotApiClient {
  constructor() {
    this.baseURL = config.sureshot.baseUrl || 'https://api.sureshot.com';
    this.apiKey = config.sureshot.apiKey;
    this.eloquaInstance = config.sureshot.eloquaInstance;
    this.eloquaUser = config.sureshot.eloquaUser;
    this.eloquaPassword = config.sureshot.eloquaPassword;

    // Initialize HTTP client
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.sureshot.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Connexio-AI-Worker/1.0',
      },
    });

    // Rate limiting queue
    this.queue = new PQueue({
      concurrency: config.sureshot.maxConcurrent || 5,
      intervalCap: config.sureshot.intervalCap || 100,
      interval: config.sureshot.interval || 60000, // 1 minute
    });

    this.logger = createContextLogger({ service: 'sureshot-api-client' });
    
    // Performance and error tracking
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitHits: 0,
      averageResponseTime: 0,
      errorsByType: {},
    };

    // Authentication state
    this.authToken = null;
    this.authExpiry = null;
    this.isConnected = false;

    // Setup interceptors
    this.setupInterceptors();

    this.logger.info('Sureshot API client initialized', {
      baseURL: this.baseURL,
      eloquaInstance: this.eloquaInstance,
      maxConcurrent: config.sureshot.maxConcurrent || 5,
    });
  }

  /**
   * Setup request and response interceptors
   * @private
   */
  setupInterceptors() {
    // Request interceptor for authentication
    this.client.interceptors.request.use(
      async (config) => {
        await this.ensureAuthenticated();
        
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }

        // Add request ID for tracking
        config.metadata = {
          requestId: uuidv4(),
          startTime: Date.now(),
        };

        this.logger.debug('API request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          requestId: config.metadata.requestId,
        });

        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        
        this.logger.debug('API response', {
          method: response.config.method?.toUpperCase(),
          url: response.config.url,
          status: response.status,
          duration,
          requestId: response.config.metadata.requestId,
        });

        this._updateMetrics(true, duration);
        return response;
      },
      (error) => {
        const duration = error.config?.metadata?.startTime 
          ? Date.now() - error.config.metadata.startTime 
          : 0;

        this.logger.error('API error response', {
          method: error.config?.method?.toUpperCase(),
          url: error.config?.url,
          status: error.response?.status,
          duration,
          requestId: error.config?.metadata?.requestId,
          error: error.response?.data || error.message,
        });

        this._updateMetrics(false, duration);
        return Promise.reject(this._enhanceError(error));
      }
    );
  }

  /**
   * Ensure client is authenticated
   * @private
   */
  async ensureAuthenticated() {
    if (this.authToken && this.authExpiry && Date.now() < this.authExpiry) {
      return; // Token is still valid
    }

    try {
      await this.authenticate();
    } catch (error) {
      this.logger.error('Authentication failed', { error: error.message });
      throw new Error('Authentication failed: ' + error.message);
    }
  }

  /**
   * Authenticate with Sureshot API
   * @private
   */
  async authenticate() {
    this.logger.info('Authenticating with Sureshot API');

    try {
      const response = await axios.post(`${this.baseURL}/auth/login`, {
        apiKey: this.apiKey,
        eloquaInstance: this.eloquaInstance,
        eloquaUser: this.eloquaUser,
        eloquaPassword: this.eloquaPassword,
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      this.authToken = response.data.accessToken;
      this.authExpiry = Date.now() + (response.data.expiresIn * 1000);
      this.isConnected = true;

      this.logger.info('Authentication successful', {
        expiresIn: response.data.expiresIn,
        eloquaInstance: this.eloquaInstance,
      });

    } catch (error) {
      this.isConnected = false;
      const enhancedError = new Error('Authentication failed');
      enhancedError.code = 'AUTHENTICATION_ERROR';
      enhancedError.originalError = error;
      throw enhancedError;
    }
  }

  /**
   * Make authenticated API request with rate limiting and retries
   * @private
   */
  async makeRequest(method, endpoint, data = null, options = {}) {
    const requestId = uuidv4();
    const logger = createContextLogger({
      service: 'sureshot-api-client',
      requestId,
      method: method.toUpperCase(),
      endpoint,
    });

    return await this.queue.add(
      () => this._executeRequest(method, endpoint, data, options, logger),
      { priority: options.priority || 0 }
    );
  }

  /**
   * Execute request with retries
   * @private
   */
  async _executeRequest(method, endpoint, data, options, logger) {
    return await pRetry(
      async (attemptNumber) => {
        logger.debug('API request attempt', { attemptNumber, endpoint });

        try {
          const config = {
            method,
            url: endpoint,
            ...options,
          };

          if (data) {
            config.data = data;
          }

          const response = await this.client(config);
          return response.data;

        } catch (error) {
          if (error.response?.status === 429) {
            this.metrics.rateLimitHits++;
            const retryAfter = error.response.headers['retry-after'] 
              ? parseInt(error.response.headers['retry-after']) * 1000 
              : 5000;
            
            logger.warn('Rate limit hit, retrying', { retryAfter, attemptNumber });
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            throw error; // Retry
          }

          if (error.response?.status === 401) {
            // Token expired, re-authenticate
            this.authToken = null;
            this.authExpiry = null;
            await this.ensureAuthenticated();
            throw error; // Retry with new token
          }

          if (error.response?.status >= 500) {
            // Server errors are retryable
            throw error;
          }

          // Client errors (400-499) are not retryable except 401 and 429
          const nonRetryableError = new Error(error.message);
          nonRetryableError.shouldRetry = false;
          nonRetryableError.response = error.response;
          throw nonRetryableError;
        }
      },
      {
        retries: options.maxRetries || 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000,
        onFailedAttempt: (error) => {
          logger.warn('Request failed, retrying', {
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
            error: error.message,
          });
        },
        shouldRetry: (error) => error.shouldRetry !== false,
      }
    );
  }

  /**
   * Create email campaign in Eloqua
   */
  async createEmailCampaign(campaignData) {
    this.logger.info('Creating email campaign', { campaignName: campaignData.name });

    const payload = {
      name: campaignData.name,
      description: campaignData.description,
      type: 'Email',
      folderId: campaignData.folderId,
      email: {
        name: campaignData.email.name,
        subject: campaignData.email.subject,
        htmlContent: campaignData.email.htmlContent,
        textContent: campaignData.email.textContent,
        fromName: campaignData.email.fromName,
        fromAddress: campaignData.email.fromAddress,
        replyToAddress: campaignData.email.replyToAddress,
        templateId: campaignData.email.templateId,
      },
      audience: {
        listIds: campaignData.audienceListIds,
        segmentIds: campaignData.audienceSegmentIds,
      },
    };

    const response = await this.makeRequest('POST', '/api/v2/campaigns', payload);
    
    this.logger.info('Email campaign created', {
      campaignId: response.id,
      eloquaCampaignId: response.eloquaId,
    });

    return response;
  }

  /**
   * Create contact list
   */
  async createContactList(listData) {
    this.logger.info('Creating contact list', { listName: listData.name });

    const payload = {
      name: listData.name,
      description: listData.description,
      folderId: listData.folderId,
      dataSource: listData.dataSource,
      criteria: listData.criteria,
      contacts: listData.contacts,
    };

    const response = await this.makeRequest('POST', '/api/v2/contact-lists', payload);
    
    this.logger.info('Contact list created', {
      listId: response.id,
      contactCount: response.contactCount,
    });

    return response;
  }

  /**
   * Create contact segment
   */
  async createContactSegment(segmentData) {
    this.logger.info('Creating contact segment', { segmentName: segmentData.name });

    const payload = {
      name: segmentData.name,
      description: segmentData.description,
      folderId: segmentData.folderId,
      criteria: segmentData.criteria,
      sourceListIds: segmentData.sourceListIds,
    };

    const response = await this.makeRequest('POST', '/api/v2/contact-segments', payload);
    
    this.logger.info('Contact segment created', {
      segmentId: response.id,
      contactCount: response.contactCount,
    });

    return response;
  }

  /**
   * Update contact list
   */
  async updateContactList(listId, updates) {
    this.logger.info('Updating contact list', { listId });

    const response = await this.makeRequest('PUT', `/api/v2/contact-lists/${listId}`, updates);
    
    this.logger.info('Contact list updated', {
      listId,
      contactCount: response.contactCount,
    });

    return response;
  }

  /**
   * Delete contact list
   */
  async deleteContactList(listId) {
    this.logger.info('Deleting contact list', { listId });

    await this.makeRequest('DELETE', `/api/v2/contact-lists/${listId}`);
    
    this.logger.info('Contact list deleted', { listId });

    return { success: true, listId };
  }

  /**
   * Sync contact list with external data source
   */
  async syncContactList(listId, syncOptions) {
    this.logger.info('Syncing contact list', { listId, syncMode: syncOptions.syncMode });

    const response = await this.makeRequest('POST', `/api/v2/contact-lists/${listId}/sync`, syncOptions);
    
    this.logger.info('Contact list sync completed', {
      listId,
      recordsProcessed: response.recordsProcessed,
      recordsAdded: response.recordsAdded,
      recordsUpdated: response.recordsUpdated,
    });

    return response;
  }

  /**
   * Get campaign status
   */
  async getCampaignStatus(campaignId) {
    this.logger.info('Getting campaign status', { campaignId });

    const response = await this.makeRequest('GET', `/api/v2/campaigns/${campaignId}/status`);
    
    return response;
  }

  /**
   * Get campaign metrics
   */
  async getCampaignMetrics(campaignId) {
    this.logger.info('Getting campaign metrics', { campaignId });

    const response = await this.makeRequest('GET', `/api/v2/campaigns/${campaignId}/metrics`);
    
    return response;
  }

  /**
   * Get campaign execution history
   */
  async getCampaignExecutionHistory(campaignId) {
    this.logger.info('Getting campaign execution history', { campaignId });

    const response = await this.makeRequest('GET', `/api/v2/campaigns/${campaignId}/executions`);
    
    return response;
  }

  /**
   * Update campaign settings
   */
  async updateCampaignSettings(campaignId, settings) {
    this.logger.info('Updating campaign settings', { campaignId });

    const response = await this.makeRequest('PUT', `/api/v2/campaigns/${campaignId}/settings`, settings);
    
    this.logger.info('Campaign settings updated', { campaignId });

    return response;
  }

  /**
   * Execute campaign immediately
   */
  async executeCampaignImmediate(campaignId) {
    this.logger.info('Executing campaign immediately', { campaignId });

    const response = await this.makeRequest('POST', `/api/v2/campaigns/${campaignId}/execute`);
    
    this.logger.info('Campaign execution started', {
      campaignId,
      executionId: response.executionId,
      status: response.status,
    });

    return response;
  }

  /**
   * Schedule campaign execution
   */
  async scheduleCampaign(campaignId, scheduledTime) {
    this.logger.info('Scheduling campaign', { campaignId, scheduledTime });

    const payload = {
      scheduledTime: scheduledTime,
      timeZone: config.sureshot.defaultTimeZone || 'UTC',
    };

    const response = await this.makeRequest('POST', `/api/v2/campaigns/${campaignId}/schedule`, payload);
    
    this.logger.info('Campaign scheduled', {
      campaignId,
      scheduledTime: response.scheduledTime,
      status: response.status,
    });

    return response;
  }

  /**
   * Setup triggered campaign
   */
  async setupTriggeredCampaign(campaignId, triggers) {
    this.logger.info('Setting up triggered campaign', { campaignId, triggerCount: triggers.length });

    const payload = {
      triggers: triggers,
    };

    const response = await this.makeRequest('POST', `/api/v2/campaigns/${campaignId}/triggers`, payload);
    
    this.logger.info('Triggered campaign configured', {
      campaignId,
      activeTriggers: response.activeTriggers,
      status: response.status,
    });

    return response;
  }

  /**
   * Enhance error with additional context
   * @private
   */
  _enhanceError(error) {
    const enhanced = new Error(error.message);
    enhanced.originalError = error;

    // Classify error types
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      enhanced.code = 'NETWORK_ERROR';
    } else if (error.response?.status === 401) {
      enhanced.code = 'AUTHENTICATION_ERROR';
    } else if (error.response?.status === 429) {
      enhanced.code = 'RATE_LIMIT_EXCEEDED';
    } else if (error.response?.status >= 400 && error.response?.status < 500) {
      enhanced.code = 'VALIDATION_ERROR';
    } else if (error.response?.status >= 500) {
      enhanced.code = 'ELOQUA_API_ERROR';
    } else if (error.code === 'ECONNABORTED') {
      enhanced.code = 'TIMEOUT_ERROR';
    } else {
      enhanced.code = 'UNKNOWN_ERROR';
    }

    enhanced.statusCode = error.response?.status;
    enhanced.responseData = error.response?.data;
    
    // Track error by type
    this.metrics.errorsByType[enhanced.code] = (this.metrics.errorsByType[enhanced.code] || 0) + 1;

    return enhanced;
  }

  /**
   * Update performance metrics
   * @private
   */
  _updateMetrics(success, duration) {
    this.metrics.totalRequests++;
    
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Update rolling average response time
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + duration;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalRequests;
  }

  /**
   * Check if client is connected
   */
  isConnected() {
    return this.isConnected && this.authToken && Date.now() < this.authExpiry;
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    return {
      connected: this.isConnected(),
      baseURL: this.baseURL,
      eloquaInstance: this.eloquaInstance,
      metrics: this.metrics,
      queueStatus: {
        size: this.queue.size,
        pending: this.queue.pending,
        concurrency: this.queue.concurrency,
      },
      authentication: {
        hasToken: !!this.authToken,
        tokenExpiry: this.authExpiry,
        isExpired: this.authExpiry ? Date.now() >= this.authExpiry : true,
      },
    };
  }

  /**
   * Shutdown client gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down Sureshot API client');

    try {
      // Wait for pending requests to complete
      await this.queue.onIdle();
      
      // Clear authentication
      this.authToken = null;
      this.authExpiry = null;
      this.isConnected = false;

      this.logger.info('Sureshot API client shutdown complete', {
        totalRequests: this.metrics.totalRequests,
        successRate: this.metrics.totalRequests > 0 
          ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
          : 0,
      });
    } catch (error) {
      this.logger.error('Error during API client shutdown', { error: error.message });
    }
  }
}

export default SureshotApiClient;