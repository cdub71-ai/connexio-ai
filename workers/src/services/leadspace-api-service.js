import axios from 'axios';
import pRetry from 'p-retry';
import PQueue from 'p-queue';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';
import { createContextLogger, createTimer } from '../utils/logger.js';

/**
 * Leadspace API Integration Service
 * Handles B2B data enrichment, company intelligence, and contact verification
 */
class LeadspaceApiService {
  constructor() {
    this.baseURL = config.leadspace.baseUrl || 'https://api.leadspace.com/v2';
    this.apiKey = config.leadspace.apiKey;
    this.customerId = config.leadspace.customerId;

    // Initialize HTTP client
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.leadspace.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Rate limiting queue
    this.queue = new PQueue({
      concurrency: config.leadspace.maxConcurrent || 3,
      intervalCap: config.leadspace.intervalCap || 100,
      interval: config.leadspace.interval || 60000, // 1 minute
    });

    this.logger = createContextLogger({ service: 'leadspace-api-service' });

    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      enrichedContacts: 0,
      enrichedCompanies: 0,
      verifiedEmails: 0,
      rateLimitHits: 0,
      averageResponseTime: 0,
      errorsByType: {},
    };

    // Setup interceptors
    this.setupInterceptors();

    this.logger.info('Leadspace API service initialized', {
      baseURL: this.baseURL,
      customerId: this.customerId,
      maxConcurrent: config.leadspace.maxConcurrent || 3,
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
        config.headers['Authorization'] = `Bearer ${this.apiKey}`;
        config.headers['X-Customer-ID'] = this.customerId;
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
        
        if (error.response?.status === 429) {
          this.metrics.rateLimitHits++;
        }
        
        return Promise.reject(this._enhanceError(error));
      }
    );
  }

  /**
   * Enrich person data using multiple identifiers
   * @param {Object} personData - Person identifiers (email, name, company, etc.)
   * @param {Object} options - Enrichment options
   * @returns {Promise<Object>} Enriched person data
   */
  async enrichPerson(personData, options = {}) {
    const requestId = uuidv4();
    const logger = createContextLogger({
      service: 'leadspace-api-service',
      requestId,
      method: 'enrichPerson',
    });

    logger.info('Enriching person data', {
      hasEmail: !!personData.email,
      hasName: !!(personData.firstName || personData.lastName),
      hasCompany: !!personData.company,
    });

    try {
      const enrichmentPayload = {
        person: {
          email: personData.email,
          first_name: personData.firstName,
          last_name: personData.lastName,
          full_name: personData.fullName,
          company_name: personData.company || personData.companyName,
          company_domain: personData.companyDomain,
          job_title: personData.title || personData.jobTitle,
          phone: personData.phone,
          linkedin_url: personData.linkedinUrl,
        },
        enrichment_fields: options.fields || [
          'personal_email',
          'work_email', 
          'phone_numbers',
          'social_profiles',
          'job_details',
          'company_info',
          'demographics',
          'education',
          'skills',
        ],
        include_company_data: options.includeCompanyData !== false,
      };

      const result = await this.queue.add(() => 
        this._makeRequest('POST', '/people/enrich', enrichmentPayload, logger)
      );

      if (result.person) {
        this.metrics.enrichedContacts++;
        
        const enrichedData = this._transformPersonData(result.person);
        
        logger.info('Person enrichment successful', {
          leadspaceId: result.person.id,
          matchConfidence: result.person.match_confidence,
          dataPoints: Object.keys(enrichedData).length,
        });

        return {
          success: true,
          data: enrichedData,
          confidence: result.person.match_confidence,
          source: 'leadspace',
          requestId,
          creditsUsed: result.credits_consumed || 1,
        };
      } else {
        logger.warn('No person data found', {
          email: personData.email ? this._maskEmail(personData.email) : null,
        });
        
        return {
          success: false,
          error: 'No person data found',
          source: 'leadspace',
          requestId,
        };
      }

    } catch (error) {
      logger.error('Person enrichment failed', {
        error: error.message,
        email: personData.email ? this._maskEmail(personData.email) : null,
      });

      return {
        success: false,
        error: error.message,
        errorType: this._classifyError(error),
        source: 'leadspace',
        requestId,
      };
    }
  }

  /**
   * Enrich company data
   * @param {Object} companyData - Company identifiers (domain, name, etc.)
   * @param {Object} options - Enrichment options
   * @returns {Promise<Object>} Enriched company data
   */
  async enrichCompany(companyData, options = {}) {
    const requestId = uuidv4();
    const logger = createContextLogger({
      service: 'leadspace-api-service',
      requestId,
      method: 'enrichCompany',
    });

    logger.info('Enriching company data', {
      hasDomain: !!companyData.domain,
      hasName: !!companyData.name,
    });

    try {
      const enrichmentPayload = {
        company: {
          domain: companyData.domain,
          name: companyData.name,
          website: companyData.website,
          linkedin_url: companyData.linkedinUrl,
        },
        enrichment_fields: options.fields || [
          'basic_info',
          'contact_info',
          'financial_data',
          'technology_stack',
          'social_media',
          'employee_data',
          'funding_info',
          'news_mentions',
        ],
        include_employee_count: options.includeEmployeeCount !== false,
        include_technology_data: options.includeTechnologyData !== false,
      };

      const result = await this.queue.add(() => 
        this._makeRequest('POST', '/companies/enrich', enrichmentPayload, logger)
      );

      if (result.company) {
        this.metrics.enrichedCompanies++;
        
        const enrichedData = this._transformCompanyData(result.company);
        
        logger.info('Company enrichment successful', {
          leadspaceId: result.company.id,
          name: result.company.name,
          confidence: result.company.match_confidence,
          dataPoints: Object.keys(enrichedData).length,
        });

        return {
          success: true,
          data: enrichedData,
          confidence: result.company.match_confidence,
          source: 'leadspace',
          requestId,
          creditsUsed: result.credits_consumed || 1,
        };
      } else {
        logger.warn('No company data found', {
          domain: companyData.domain,
          name: companyData.name,
        });
        
        return {
          success: false,
          error: 'No company data found',
          source: 'leadspace',
          requestId,
        };
      }

    } catch (error) {
      logger.error('Company enrichment failed', {
        error: error.message,
        domain: companyData.domain,
        name: companyData.name,
      });

      return {
        success: false,
        error: error.message,
        errorType: this._classifyError(error),
        source: 'leadspace',
        requestId,
      };
    }
  }

  /**
   * Verify email addresses
   * @param {Array} emails - Array of email addresses to verify
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Email verification results
   */
  async verifyEmails(emails, options = {}) {
    const requestId = uuidv4();
    const logger = createContextLogger({
      service: 'leadspace-api-service',
      requestId,
      method: 'verifyEmails',
    });

    logger.info('Verifying email addresses', {
      emailCount: emails.length,
      checkCatchAll: options.checkCatchAll !== false,
    });

    try {
      const verificationPayload = {
        emails: emails.map(email => ({ email })),
        verification_options: {
          check_syntax: options.checkSyntax !== false,
          check_domain: options.checkDomain !== false,
          check_mailbox: options.checkMailbox !== false,
          check_catch_all: options.checkCatchAll !== false,
          check_disposable: options.checkDisposable !== false,
        },
      };

      const result = await this.queue.add(() => 
        this._makeRequest('POST', '/emails/verify', verificationPayload, logger)
      );

      const verificationResults = result.results?.map(emailResult => ({
        email: emailResult.email,
        isValid: emailResult.is_valid,
        confidence: emailResult.confidence,
        status: emailResult.status,
        risk: emailResult.risk_level,
        reasons: emailResult.validation_reasons || [],
        deliverability: emailResult.deliverability_score,
        isDisposable: emailResult.is_disposable,
        isCatchAll: emailResult.is_catch_all,
        domainStatus: emailResult.domain_status,
        mxRecords: emailResult.mx_records || [],
      })) || [];

      const validEmails = verificationResults.filter(r => r.isValid).length;
      this.metrics.verifiedEmails += verificationResults.length;

      logger.info('Email verification completed', {
        totalEmails: emails.length,
        validEmails,
        validationRate: Math.round((validEmails / emails.length) * 100),
      });

      return {
        success: true,
        data: {
          results: verificationResults,
          summary: {
            total: emails.length,
            valid: validEmails,
            invalid: emails.length - validEmails,
            validationRate: Math.round((validEmails / emails.length) * 100),
          },
        },
        source: 'leadspace',
        requestId,
        creditsUsed: result.credits_consumed || emails.length,
      };

    } catch (error) {
      logger.error('Email verification failed', {
        error: error.message,
        emailCount: emails.length,
      });

      return {
        success: false,
        error: error.message,
        errorType: this._classifyError(error),
        source: 'leadspace',
        requestId,
      };
    }
  }

  /**
   * Search for companies based on criteria
   * @param {Object} searchCriteria - Search parameters
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Company search results
   */
  async searchCompanies(searchCriteria, options = {}) {
    const requestId = uuidv4();
    const logger = createContextLogger({
      service: 'leadspace-api-service',
      requestId,
      method: 'searchCompanies',
    });

    logger.info('Searching companies', {
      criteria: Object.keys(searchCriteria),
      limit: options.limit || 25,
    });

    try {
      const searchPayload = {
        filters: {
          ...searchCriteria,
          employee_count_min: searchCriteria.employeeCountMin,
          employee_count_max: searchCriteria.employeeCountMax,
          revenue_min: searchCriteria.revenueMin,
          revenue_max: searchCriteria.revenueMax,
          industries: searchCriteria.industries,
          technologies: searchCriteria.technologies,
          locations: searchCriteria.locations,
          founded_year_min: searchCriteria.foundedYearMin,
          founded_year_max: searchCriteria.foundedYearMax,
        },
        limit: Math.min(options.limit || 25, 100),
        offset: options.offset || 0,
        sort_by: options.sortBy || 'relevance',
        sort_order: options.sortOrder || 'desc',
      };

      const result = await this.queue.add(() => 
        this._makeRequest('POST', '/companies/search', searchPayload, logger)
      );

      const companies = result.companies?.map(company => 
        this._transformCompanyData(company)
      ) || [];

      logger.info('Company search completed', {
        totalResults: result.total_count || 0,
        returnedResults: companies.length,
        hasMore: (result.offset || 0) + companies.length < (result.total_count || 0),
      });

      return {
        success: true,
        data: {
          companies,
          totalCount: result.total_count || 0,
          offset: result.offset || 0,
          limit: result.limit,
          hasMore: (result.offset || 0) + companies.length < (result.total_count || 0),
        },
        source: 'leadspace',
        requestId,
        creditsUsed: result.credits_consumed || companies.length,
      };

    } catch (error) {
      logger.error('Company search failed', {
        error: error.message,
        criteria: searchCriteria,
      });

      return {
        success: false,
        error: error.message,
        errorType: this._classifyError(error),
        source: 'leadspace',
        requestId,
      };
    }
  }

  /**
   * Get account usage and limits
   * @returns {Promise<Object>} Account information
   */
  async getAccountUsage() {
    const logger = createContextLogger({
      service: 'leadspace-api-service',
      method: 'getAccountUsage',
    });

    try {
      const result = await this.queue.add(() => 
        this._makeRequest('GET', '/account/usage', {}, logger)
      );

      logger.info('Account usage retrieved', {
        creditsUsed: result.credits_used,
        creditsRemaining: result.credits_remaining,
        resetDate: result.reset_date,
      });

      return {
        success: true,
        data: {
          customerId: result.customer_id,
          planType: result.plan_type,
          creditsUsed: result.credits_used,
          creditsRemaining: result.credits_remaining,
          creditsTotal: result.credits_total,
          resetDate: result.reset_date,
          billingPeriod: result.billing_period,
        },
        source: 'leadspace',
      };

    } catch (error) {
      logger.error('Failed to get account usage', { error: error.message });

      return {
        success: false,
        error: error.message,
        source: 'leadspace',
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
            const retryAfter = error.response.headers['retry-after'] 
              ? parseInt(error.response.headers['retry-after']) * 1000 
              : 30000; // 30 seconds default
            
            logger.warn('Rate limit hit, retrying', { 
              retryAfter, 
              attempt: attemptNumber 
            });
            
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            throw error; // Retry
          }

          if (error.response?.status >= 500) {
            throw error; // Retry server errors
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
   * Transform Leadspace person data to standard format
   * @private
   */
  _transformPersonData(person) {
    return {
      // Basic info
      leadspaceId: person.id,
      firstName: person.first_name,
      lastName: person.last_name,
      fullName: person.full_name,
      email: person.email,
      personalEmails: person.personal_emails || [],
      workEmails: person.work_emails || [],
      
      // Contact info
      phoneNumbers: person.phone_numbers || [],
      personalPhone: person.personal_phone,
      workPhone: person.work_phone,
      
      // Social profiles
      linkedinUrl: person.linkedin_url,
      twitterUrl: person.twitter_url,
      facebookUrl: person.facebook_url,
      githubUrl: person.github_url,
      
      // Professional info
      title: person.job_title,
      department: person.department,
      seniority: person.seniority_level,
      jobFunction: person.job_function,
      managementLevel: person.management_level,
      yearsOfExperience: person.years_of_experience,
      
      // Location
      city: person.city,
      state: person.state,
      country: person.country,
      timeZone: person.time_zone,
      
      // Demographics
      gender: person.gender,
      ageRange: person.age_range,
      
      // Education
      education: person.education || [],
      skills: person.skills || [],
      certifications: person.certifications || [],
      
      // Company info
      company: person.company ? this._transformCompanyData(person.company) : null,
      
      // Additional data
      photoUrl: person.photo_url,
      bio: person.bio,
      interests: person.interests || [],
      
      // Metadata
      matchConfidence: person.match_confidence,
      lastVerified: person.last_verified,
      dataSource: person.data_source,
      dataEnrichedAt: new Date().toISOString(),
    };
  }

  /**
   * Transform Leadspace company data to standard format
   * @private
   */
  _transformCompanyData(company) {
    return {
      // Basic info
      leadspaceId: company.id,
      name: company.name,
      legalName: company.legal_name,
      domain: company.domain,
      website: company.website,
      
      // Business info
      industry: company.industry,
      subIndustry: company.sub_industry,
      sicCodes: company.sic_codes || [],
      naicsCodes: company.naics_codes || [],
      businessModel: company.business_model,
      
      // Size and financials
      employeeCount: company.employee_count,
      employeeRange: company.employee_range,
      annualRevenue: company.annual_revenue,
      revenueRange: company.revenue_range,
      
      // Location
      headquarters: company.headquarters,
      city: company.city,
      state: company.state,
      country: company.country,
      locations: company.locations || [],
      
      // Contact info
      phone: company.phone,
      fax: company.fax,
      
      // Financial data
      totalFunding: company.total_funding,
      lastFundingRound: company.last_funding_round,
      fundingStage: company.funding_stage,
      investors: company.investors || [],
      
      // Technology
      technologies: company.technologies || [],
      techCategories: company.tech_categories || [],
      
      // Social media
      linkedinUrl: company.linkedin_url,
      twitterUrl: company.twitter_url,
      facebookUrl: company.facebook_url,
      
      // Additional data
      logoUrl: company.logo_url,
      description: company.description,
      founded: company.founded_year,
      publiclyTraded: company.publicly_traded,
      stockSymbol: company.stock_symbol,
      
      // News and mentions
      recentNews: company.recent_news || [],
      socialMediaMentions: company.social_mentions || [],
      
      // Metadata
      matchConfidence: company.match_confidence,
      lastUpdated: company.last_updated,
      dataSource: company.data_source,
      dataEnrichedAt: new Date().toISOString(),
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
      leadspace: {
        baseURL: this.baseURL,
        hasApiKey: !!this.apiKey,
        customerId: this.customerId,
      },
    };
  }

  /**
   * Shutdown service gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down Leadspace API service');

    try {
      await this.queue.onIdle();
      
      this.logger.info('Leadspace API service shutdown complete', {
        totalRequests: this.metrics.totalRequests,
        successRate: this.metrics.totalRequests > 0 
          ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
          : 0,
      });
    } catch (error) {
      this.logger.error('Error during Leadspace service shutdown', { error: error.message });
    }
  }
}

export default LeadspaceApiService;