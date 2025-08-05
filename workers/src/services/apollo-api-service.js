import axios from 'axios';
import pRetry from 'p-retry';
import PQueue from 'p-queue';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { createContextLogger, createTimer } from '../utils/logger.js';

/**
 * Apollo API Integration Service
 * Handles contact enrichment, person search, and company data from Apollo.io
 */
class ApolloApiService {
  constructor() {
    this.baseURL = 'https://api.apollo.io/v1';
    this.apiKey = config.apollo.apiKey;

    // Initialize HTTP client
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.apollo.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });

    // Rate limiting queue - Apollo has strict rate limits
    this.queue = new PQueue({
      concurrency: config.apollo.maxConcurrent || 2,
      intervalCap: config.apollo.intervalCap || 60,
      interval: config.apollo.interval || 60000, // 1 minute
    });

    this.logger = createContextLogger({ service: 'apollo-api-service' });

    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      enrichedContacts: 0,
      foundCompanies: 0,
      rateLimitHits: 0,
      averageResponseTime: 0,
      errorsByType: {},
    };

    // Setup interceptors
    this.setupInterceptors();

    this.logger.info('Apollo API service initialized', {
      baseURL: this.baseURL,
      maxConcurrent: config.apollo.maxConcurrent || 2,
      intervalCap: config.apollo.intervalCap || 60,
    });
  }

  /**
   * Setup request and response interceptors
   * @private
   */
  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        config.headers['X-Api-Key'] = this.apiKey;
        config.metadata = {
          startTime: Date.now(),
          requestId: uuidv4(),
        };
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        this._updateMetrics(true, duration);
        return response;
      },
      (error) => {
        const duration = error.config?.metadata?.startTime 
          ? Date.now() - error.config.metadata.startTime 
          : 0;
        this._updateMetrics(false, duration);
        
        // Handle rate limiting
        if (error.response?.status === 429) {
          this.metrics.rateLimitHits++;
        }
        
        return Promise.reject(this._enhanceError(error));
      }
    );
  }

  /**
   * Enrich person data using email
   * @param {string} email - Email address to enrich
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Enriched person data
   */
  async enrichPersonByEmail(email, options = {}) {
    const requestId = uuidv4();
    const logger = createContextLogger({
      service: 'apollo-api-service',
      requestId,
      method: 'enrichPersonByEmail',
    });

    logger.info('Enriching person by email', { email: this._maskEmail(email) });

    try {
      const result = await this.queue.add(() => 
        this._makeRequest('POST', '/people/match', {
          email,
          reveal_personal_emails: options.revealPersonalEmails || false,
          reveal_phone_number: options.revealPhoneNumber || false,
        }, logger)
      );

      if (result.person) {
        this.metrics.enrichedContacts++;
        
        const enrichedData = this._transformPersonData(result.person);
        
        logger.info('Person enrichment successful', {
          personId: result.person.id,
          hasCompany: !!result.person.organization,
          dataPoints: Object.keys(enrichedData).length,
        });

        return {
          success: true,
          data: enrichedData,
          source: 'apollo',
          requestId,
          creditsUsed: result.credits_consumed || 1,
        };
      } else {
        logger.warn('No person data found', { email: this._maskEmail(email) });
        
        return {
          success: false,
          error: 'No person data found for email',
          source: 'apollo',
          requestId,
        };
      }

    } catch (error) {
      logger.error('Person enrichment failed', {
        error: error.message,
        email: this._maskEmail(email),
      });

      return {
        success: false,
        error: error.message,
        errorType: this._classifyError(error),
        source: 'apollo',
        requestId,
      };
    }
  }

  /**
   * Search for people based on criteria
   * @param {Object} searchCriteria - Search parameters
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Search results
   */
  async searchPeople(searchCriteria, options = {}) {
    const requestId = uuidv4();
    const logger = createContextLogger({
      service: 'apollo-api-service',
      requestId,
      method: 'searchPeople',
    });

    logger.info('Searching for people', {
      criteria: Object.keys(searchCriteria),
      page: options.page || 1,
      perPage: options.perPage || 25,
    });

    try {
      const searchParams = {
        ...searchCriteria,
        page: options.page || 1,
        per_page: Math.min(options.perPage || 25, 100), // Apollo max is 100
      };

      const result = await this.queue.add(() => 
        this._makeRequest('POST', '/mixed_people/search', searchParams, logger)
      );

      const transformedPeople = result.people?.map(person => 
        this._transformPersonData(person)
      ) || [];

      logger.info('People search completed', {
        totalResults: result.total_entries || 0,
        returnedResults: transformedPeople.length,
        page: result.page || 1,
        hasMore: (result.page || 1) * (result.per_page || 25) < (result.total_entries || 0),
      });

      return {
        success: true,
        data: {
          people: transformedPeople,
          totalCount: result.total_entries || 0,
          page: result.page || 1,
          perPage: result.per_page || 25,
          hasMore: (result.page || 1) * (result.per_page || 25) < (result.total_entries || 0),
        },
        source: 'apollo',
        requestId,
        creditsUsed: result.credits_consumed || transformedPeople.length,
      };

    } catch (error) {
      logger.error('People search failed', {
        error: error.message,
        criteria: searchCriteria,
      });

      return {
        success: false,
        error: error.message,
        errorType: this._classifyError(error),
        source: 'apollo',
        requestId,
      };
    }
  }

  /**
   * Enrich company data
   * @param {Object} companyIdentifier - Company domain or name
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Enriched company data
   */
  async enrichCompany(companyIdentifier, options = {}) {
    const requestId = uuidv4();
    const logger = createContextLogger({
      service: 'apollo-api-service',
      requestId,
      method: 'enrichCompany',
    });

    logger.info('Enriching company data', {
      identifier: companyIdentifier.domain || companyIdentifier.name,
    });

    try {
      const searchParams = {
        ...companyIdentifier,
        reveal_phone_number: options.revealPhoneNumber || false,
      };

      const result = await this.queue.add(() => 
        this._makeRequest('GET', '/organizations/enrich', searchParams, logger)
      );

      if (result.organization) {
        this.metrics.foundCompanies++;
        
        const enrichedData = this._transformCompanyData(result.organization);
        
        logger.info('Company enrichment successful', {
          companyId: result.organization.id,
          name: result.organization.name,
          dataPoints: Object.keys(enrichedData).length,
        });

        return {
          success: true,
          data: enrichedData,
          source: 'apollo',
          requestId,
          creditsUsed: result.credits_consumed || 1,
        };
      } else {
        logger.warn('No company data found', {
          identifier: companyIdentifier.domain || companyIdentifier.name,
        });
        
        return {
          success: false,
          error: 'No company data found',
          source: 'apollo',
          requestId,
        };
      }

    } catch (error) {
      logger.error('Company enrichment failed', {
        error: error.message,
        identifier: companyIdentifier.domain || companyIdentifier.name,
      });

      return {
        success: false,
        error: error.message,
        errorType: this._classifyError(error),
        source: 'apollo',
        requestId,
      };
    }
  }

  /**
   * Bulk enrich contacts
   * @param {Array} contacts - Array of contacts to enrich
   * @param {Object} options - Enrichment options
   * @returns {Promise<Object>} Bulk enrichment results
   */
  async bulkEnrichContacts(contacts, options = {}) {
    const requestId = uuidv4();
    const logger = createContextLogger({
      service: 'apollo-api-service',
      requestId,
      method: 'bulkEnrichContacts',
    });

    logger.info('Starting bulk contact enrichment', {
      contactCount: contacts.length,
      batchSize: options.batchSize || 10,
    });

    const results = {
      total: contacts.length,
      enriched: 0,
      failed: 0,
      skipped: 0,
      results: [],
      errors: [],
      creditsUsed: 0,
    };

    const batchSize = options.batchSize || 10;
    const batches = this._createBatches(contacts, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      logger.info('Processing batch', {
        batchNumber: i + 1,
        totalBatches: batches.length,
        batchSize: batch.length,
      });

      const batchPromises = batch.map(contact => 
        this._enrichSingleContact(contact, options, logger)
      );

      const batchResults = await Promise.allSettled(batchPromises);

      // Process batch results
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const contact = batch[j];

        if (result.status === 'fulfilled') {
          const enrichmentResult = result.value;
          
          if (enrichmentResult.success) {
            results.enriched++;
            results.creditsUsed += enrichmentResult.creditsUsed || 1;
          } else {
            results.failed++;
            results.errors.push({
              contact: this._sanitizeContact(contact),
              error: enrichmentResult.error,
            });
          }

          results.results.push({
            originalContact: this._sanitizeContact(contact),
            enrichmentResult,
          });
        } else {
          results.failed++;
          results.errors.push({
            contact: this._sanitizeContact(contact),
            error: result.reason.message,
          });
        }
      }

      // Add delay between batches to respect rate limits
      if (i < batches.length - 1) {
        const delay = options.batchDelay || 2000; // 2 seconds
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    logger.info('Bulk enrichment completed', {
      total: results.total,
      enriched: results.enriched,
      failed: results.failed,
      successRate: Math.round((results.enriched / results.total) * 100),
      creditsUsed: results.creditsUsed,
    });

    return {
      success: true,
      data: results,
      source: 'apollo',
      requestId,
    };
  }

  /**
   * Get account usage and credits
   * @returns {Promise<Object>} Account information
   */
  async getAccountInfo() {
    const logger = createContextLogger({
      service: 'apollo-api-service',
      method: 'getAccountInfo',
    });

    try {
      const result = await this.queue.add(() => 
        this._makeRequest('GET', '/auth/health', {}, logger)
      );

      logger.info('Account info retrieved', {
        creditsRemaining: result.credits_remaining,
        planType: result.plan_type,
      });

      return {
        success: true,
        data: {
          creditsRemaining: result.credits_remaining,
          planType: result.plan_type,
          userId: result.user_id,
          teamId: result.team_id,
        },
        source: 'apollo',
      };

    } catch (error) {
      logger.error('Failed to get account info', { error: error.message });

      return {
        success: false,
        error: error.message,
        source: 'apollo',
      };
    }
  }

  /**
   * Make API request with retries
   * @private
   */
  async _makeRequest(method, endpoint, data, logger) {
    return await pRetry(
      async (attemptNumber) => {
        logger.debug('API request attempt', { 
          attempt: attemptNumber, 
          method, 
          endpoint 
        });

        try {
          let response;
          
          if (method === 'GET') {
            response = await this.client.get(endpoint, { params: data });
          } else {
            response = await this.client[method.toLowerCase()](endpoint, data);
          }

          return response.data;

        } catch (error) {
          if (error.response?.status === 429) {
            // Rate limit - wait longer
            const retryAfter = error.response.headers['retry-after'] 
              ? parseInt(error.response.headers['retry-after']) * 1000 
              : 60000; // 1 minute default
            
            logger.warn('Rate limit hit, retrying', { 
              retryAfter, 
              attempt: attemptNumber 
            });
            
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            throw error; // Retry
          }

          if (error.response?.status >= 500) {
            // Server errors are retryable
            throw error;
          }

          // Client errors are not retryable
          const nonRetryableError = new Error(error.message);
          nonRetryableError.shouldRetry = false;
          nonRetryableError.response = error.response;
          throw nonRetryableError;
        }
      },
      {
        retries: 3,
        factor: 2,
        minTimeout: 2000,
        maxTimeout: 30000,
        shouldRetry: (error) => error.shouldRetry !== false,
      }
    );
  }

  /**
   * Enrich single contact
   * @private
   */
  async _enrichSingleContact(contact, options, logger) {
    try {
      if (!contact.email) {
        return {
          success: false,
          error: 'No email address provided',
          contact,
        };
      }

      const result = await this.enrichPersonByEmail(contact.email, options);
      
      return {
        ...result,
        originalContact: contact,
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        contact,
      };
    }
  }

  /**
   * Transform Apollo person data to standard format
   * @private
   */
  _transformPersonData(person) {
    return {
      // Basic info
      apolloId: person.id,
      firstName: person.first_name,
      lastName: person.last_name,
      fullName: person.name,
      email: person.email,
      personalEmails: person.personal_emails || [],
      
      // Contact info
      phoneNumbers: person.phone_numbers || [],
      linkedinUrl: person.linkedin_url,
      twitterUrl: person.twitter_url,
      facebookUrl: person.facebook_url,
      
      // Professional info
      title: person.title,
      seniority: person.seniority,
      departments: person.departments || [],
      subdepartments: person.subdepartments || [],
      functions: person.functions || [],
      
      // Location
      city: person.city,
      state: person.state,
      country: person.country,
      
      // Company info
      company: person.organization ? this._transformCompanyData(person.organization) : null,
      
      // Additional data
      photoUrl: person.photo_url,
      headline: person.headline,
      personalNote: person.personal_note1,
      workEmails: person.work_emails || [],
      
      // Metadata
      lastActivity: person.last_activity_date,
      emailStatus: person.email_status,
      phoneStatus: person.phone_status,
      dataEnrichedAt: new Date().toISOString(),
    };
  }

  /**
   * Transform Apollo company data to standard format
   * @private
   */
  _transformCompanyData(organization) {
    return {
      // Basic info
      apolloId: organization.id,
      name: organization.name,
      domain: organization.primary_domain,
      websiteUrl: organization.website_url,
      
      // Business info
      industry: organization.industry,
      subIndustries: organization.sub_industries || [],
      keywords: organization.keywords || [],
      estimatedNumEmployees: organization.estimated_num_employees,
      
      // Location
      city: organization.city,
      state: organization.state,
      country: organization.country,
      
      // Contact info
      phoneNumber: organization.phone,
      
      // Financial info
      annualRevenue: organization.annual_revenue,
      totalFunding: organization.total_funding,
      latestFundingRound: organization.latest_funding_round_date,
      
      // Technology
      technologies: organization.technologies || [],
      techStack: organization.current_technologies || [],
      
      // Social media
      linkedinUrl: organization.linkedin_url,
      twitterUrl: organization.twitter_url,
      facebookUrl: organization.facebook_url,
      
      // Additional data
      logoUrl: organization.logo_url,
      shortDescription: organization.short_description,
      longDescription: organization.long_description,
      founded: organization.founded_year,
      
      // Metadata
      dataEnrichedAt: new Date().toISOString(),
    };
  }

  /**
   * Create batches from array
   * @private
   */
  _createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sanitize contact for logging (remove sensitive data)
   * @private
   */
  _sanitizeContact(contact) {
    return {
      email: this._maskEmail(contact.email),
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
    };
  }

  /**
   * Mask email for logging
   * @private
   */
  _maskEmail(email) {
    if (!email) return null;
    const [local, domain] = email.split('@');
    return `${local.charAt(0)}***@${domain}`;
  }

  /**
   * Classify error type
   * @private
   */
  _classifyError(error) {
    if (error.response?.status === 401) return 'authentication';
    if (error.response?.status === 403) return 'authorization';
    if (error.response?.status === 429) return 'rate_limit';
    if (error.response?.status === 422) return 'validation';
    if (error.response?.status >= 500) return 'server_error';
    if (error.code === 'ECONNRESET') return 'network';
    if (error.code === 'ETIMEDOUT') return 'timeout';
    return 'unknown';
  }

  /**
   * Enhance error with additional context
   * @private
   */
  _enhanceError(error) {
    const enhanced = new Error(error.message);
    enhanced.originalError = error;
    enhanced.code = this._classifyError(error);
    enhanced.statusCode = error.response?.status;
    enhanced.responseData = error.response?.data;
    
    // Track error
    this.metrics.errorsByType[enhanced.code] = 
      (this.metrics.errorsByType[enhanced.code] || 0) + 1;
    
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

    // Update rolling average
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + duration;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalRequests;
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      queueStatus: {
        size: this.queue.size,
        pending: this.queue.pending,
        concurrency: this.queue.concurrency,
      },
      apollo: {
        baseURL: this.baseURL,
        hasApiKey: !!this.apiKey,
      },
    };
  }

  /**
   * Shutdown service gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down Apollo API service');

    try {
      await this.queue.onIdle();
      
      this.logger.info('Apollo API service shutdown complete', {
        totalRequests: this.metrics.totalRequests,
        successRate: this.metrics.totalRequests > 0 
          ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
          : 0,
      });
    } catch (error) {
      this.logger.error('Error during Apollo service shutdown', { error: error.message });
    }
  }
}

export default ApolloApiService;