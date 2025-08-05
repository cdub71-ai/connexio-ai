import PQueue from 'p-queue';
import { v4 as uuidv4 } from 'uuid';
import { createContextLogger, createTimer } from '../utils/logger.js';
import ApolloApiService from './apollo-api-service.js';
import LeadspaceApiService from './leadspace-api-service.js';
import DataQualityValidator from './data-quality-validator.js';
import config from '../config/index.js';

/**
 * Comprehensive Data Enrichment Pipeline
 * Orchestrates data enrichment from multiple sources with validation and transformation
 */
class DataEnrichmentService {
  constructor() {
    this.logger = createContextLogger({ service: 'data-enrichment' });
    
    // Initialize data source services
    this.apolloService = new ApolloApiService();
    this.leadspaceService = new LeadspaceApiService();
    this.qualityValidator = new DataQualityValidator();
    
    // Processing queue for controlled throughput
    this.enrichmentQueue = new PQueue({
      concurrency: config.dataEnrichment?.maxConcurrent || 5,
      intervalCap: config.dataEnrichment?.intervalCap || 200,
      interval: config.dataEnrichment?.interval || 60000, // 1 minute
    });

    // Enrichment strategies
    this.enrichmentStrategies = {
      comprehensive: this.comprehensiveEnrichment.bind(this),
      fast: this.fastEnrichment.bind(this),
      costEffective: this.costEffectiveEnrichment.bind(this),
      validation: this.validationOnlyEnrichment.bind(this),
    };

    // Data transformation mappings
    this.fieldMappings = this.initializeFieldMappings();
    
    // Performance metrics
    this.metrics = {
      totalEnrichments: 0,
      successfulEnrichments: 0,
      failedEnrichments: 0,
      sourceUsage: {
        apollo: { requests: 0, success: 0, credits: 0 },
        leadspace: { requests: 0, success: 0, credits: 0 },
      },
      enrichmentsByType: {},
      averageEnrichmentTime: 0,
      qualityScores: {
        average: 0,
        distribution: { high: 0, medium: 0, low: 0 },
      },
      errorsBySource: {},
    };

    this.logger.info('Comprehensive data enrichment service initialized', {
      strategies: Object.keys(this.enrichmentStrategies),
      maxConcurrent: config.dataEnrichment?.maxConcurrent || 5,
      sources: ['apollo', 'leadspace'],
    });
  }

  /**
   * Initialize field mapping configurations for data transformation
   * @private
   */
  initializeFieldMappings() {
    return {
      person: {
        // Standard field mappings
        standard: {
          'firstName': ['first_name', 'fname', 'given_name'],
          'lastName': ['last_name', 'lname', 'family_name', 'surname'],
          'email': ['email_address', 'primary_email', 'work_email'],
          'phone': ['phone_number', 'mobile', 'cell', 'telephone'],
          'company': ['company_name', 'organization', 'employer'],
          'title': ['job_title', 'position', 'role'],
          'city': ['location', 'city_name'],
          'state': ['state_name', 'province', 'region'],
          'country': ['country_name', 'nation'],
        },
        
        // Source-specific mappings
        apollo: {
          'apolloId': 'id',
          'firstName': 'first_name',
          'lastName': 'last_name',
          'email': 'email',
          'title': 'title',
          'linkedinUrl': 'linkedin_url',
          'phoneNumbers': 'phone_numbers',
          'personalEmails': 'personal_emails',
          'workEmails': 'work_emails',
        },
        
        leadspace: {
          'leadspaceId': 'id',
          'firstName': 'first_name',
          'lastName': 'last_name',
          'fullName': 'full_name',
          'email': 'email',
          'title': 'job_title',
          'department': 'department',
          'seniority': 'seniority_level',
        },
      },
      
      company: {
        standard: {
          'name': ['company_name', 'organization_name', 'business_name'],
          'domain': ['website_domain', 'primary_domain'],
          'website': ['website_url', 'homepage', 'url'],
          'industry': ['business_industry', 'sector'],
          'employeeCount': ['employee_count', 'staff_size', 'company_size'],
          'revenue': ['annual_revenue', 'yearly_revenue'],
          'phone': ['phone_number', 'main_phone', 'contact_number'],
        },
        
        apollo: {
          'apolloId': 'id',
          'name': 'name',
          'domain': 'primary_domain',
          'website': 'website_url',
          'industry': 'industry',
          'employeeCount': 'estimated_num_employees',
          'city': 'city',
          'state': 'state',
          'country': 'country',
        },
        
        leadspace: {
          'leadspaceId': 'id',
          'name': 'name',
          'legalName': 'legal_name',
          'domain': 'domain',
          'website': 'website',
          'industry': 'industry',
          'employeeCount': 'employee_count',
          'annualRevenue': 'annual_revenue',
        },
      },
    };
  }

  /**
   * Enrich a single contact record using specified strategy
   * @param {Object} contact - Contact data to enrich
   * @param {Object} options - Enrichment options
   * @returns {Promise<Object>} Enrichment result
   */
  async enrichContact(contact, options = {}) {
    const enrichmentId = uuidv4();
    const timer = createTimer('contact-enrichment');
    const logger = createContextLogger({
      service: 'data-enrichment',
      enrichmentId,
      method: 'enrichContact',
    });

    logger.info('Starting contact enrichment', {
      hasEmail: !!contact.email,
      hasName: !!(contact.firstName || contact.lastName),
      strategy: options.strategy || 'comprehensive',
    });

    try {
      const strategy = options.strategy || 'comprehensive';
      const strategyFunction = this.enrichmentStrategies[strategy];
      
      if (!strategyFunction) {
        throw new Error(`Unknown enrichment strategy: ${strategy}`);
      }

      const result = await this.enrichmentQueue.add(() => 
        strategyFunction(contact, options, logger)
      );

      const duration = timer.end();
      this._updateMetrics('contact', true, duration, result);

      logger.info('Contact enrichment completed', {
        enrichmentId,
        strategy,
        sourcesUsed: result.sourcesUsed?.length || 0,
        qualityScore: result.qualityScore,
        duration,
      });

      return {
        ...result,
        enrichmentId,
        processingTimeMs: duration,
      };

    } catch (error) {
      const duration = timer.end();
      this._updateMetrics('contact', false, duration);
      
      logger.error('Contact enrichment failed', {
        enrichmentId,
        error: error.message,
        duration,
      });

      return {
        success: false,
        enrichmentId,
        error: error.message,
        processingTimeMs: duration,
      };
    }
  }

  /**
   * Enrich company data using specified strategy
   * @param {Object} company - Company data to enrich
   * @param {Object} options - Enrichment options
   * @returns {Promise<Object>} Enrichment result
   */
  async enrichCompany(company, options = {}) {
    const enrichmentId = uuidv4();
    const timer = createTimer('company-enrichment');
    const logger = createContextLogger({
      service: 'data-enrichment',
      enrichmentId,
      method: 'enrichCompany',
    });

    logger.info('Starting company enrichment', {
      hasName: !!company.name,
      hasDomain: !!company.domain,
      strategy: options.strategy || 'comprehensive',
    });

    try {
      const strategy = options.strategy || 'comprehensive';
      const strategyFunction = this.enrichmentStrategies[strategy];
      
      if (!strategyFunction) {
        throw new Error(`Unknown enrichment strategy: ${strategy}`);
      }

      const result = await this.enrichmentQueue.add(() => 
        strategyFunction(company, { ...options, dataType: 'company' }, logger)
      );

      const duration = timer.end();
      this._updateMetrics('company', true, duration, result);

      logger.info('Company enrichment completed', {
        enrichmentId,
        strategy,
        sourcesUsed: result.sourcesUsed?.length || 0,
        qualityScore: result.qualityScore,
        duration,
      });

      return {
        ...result,
        enrichmentId,
        processingTimeMs: duration,
      };

    } catch (error) {
      const duration = timer.end();
      this._updateMetrics('company', false, duration);
      
      logger.error('Company enrichment failed', {
        enrichmentId,
        error: error.message,
        duration,
      });

      return {
        success: false,
        enrichmentId,
        error: error.message,
        processingTimeMs: duration,
      };
    }
  }

  /**
   * Comprehensive enrichment strategy - uses all available sources
   * @private
   */
  async comprehensiveEnrichment(data, options, logger) {
    const dataType = options.dataType || 'person';
    const enrichedData = { ...data };
    const sourcesUsed = [];
    const errors = [];
    let totalCreditsUsed = 0;

    logger.info('Starting comprehensive enrichment', { dataType });

    // Step 1: Apollo enrichment
    try {
      let apolloResult;
      if (dataType === 'person' && data.email) {
        apolloResult = await this.apolloService.enrichPersonByEmail(data.email, {
          revealPersonalEmails: options.includePersonalEmails,
          revealPhoneNumber: options.includePhoneNumbers,
        });
      } else if (dataType === 'company' && (data.domain || data.name)) {
        apolloResult = await this.apolloService.enrichCompany(
          data.domain ? { domain: data.domain } : { name: data.name },
          options
        );
      }

      if (apolloResult?.success) {
        sourcesUsed.push('apollo');
        totalCreditsUsed += apolloResult.creditsUsed || 1;
        
        // Transform and merge Apollo data
        const transformedData = this.transformSourceData(apolloResult.data, 'apollo', dataType);
        enrichedData = this.mergeEnrichedData(enrichedData, transformedData, 'apollo');
        
        this.metrics.sourceUsage.apollo.success++;
        this.metrics.sourceUsage.apollo.credits += apolloResult.creditsUsed || 1;
      } else if (apolloResult?.error) {
        errors.push({ source: 'apollo', error: apolloResult.error });
        this._trackSourceError('apollo', apolloResult.error);
      }
      
      this.metrics.sourceUsage.apollo.requests++;
    } catch (error) {
      errors.push({ source: 'apollo', error: error.message });
      this._trackSourceError('apollo', error.message);
    }

    // Step 2: Leadspace enrichment
    try {
      let leadspaceResult;
      if (dataType === 'person') {
        leadspaceResult = await this.leadspaceService.enrichPerson({
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          company: data.company || data.companyName,
        }, options);
      } else if (dataType === 'company') {
        leadspaceResult = await this.leadspaceService.enrichCompany({
          domain: data.domain,
          name: data.name,
        }, options);
      }

      if (leadspaceResult?.success) {
        sourcesUsed.push('leadspace');
        totalCreditsUsed += leadspaceResult.creditsUsed || 1;
        
        // Transform and merge Leadspace data
        const transformedData = this.transformSourceData(leadspaceResult.data, 'leadspace', dataType);
        enrichedData = this.mergeEnrichedData(enrichedData, transformedData, 'leadspace');
        
        this.metrics.sourceUsage.leadspace.success++;
        this.metrics.sourceUsage.leadspace.credits += leadspaceResult.creditsUsed || 1;
      } else if (leadspaceResult?.error) {
        errors.push({ source: 'leadspace', error: leadspaceResult.error });
        this._trackSourceError('leadspace', leadspaceResult.error);
      }
      
      this.metrics.sourceUsage.leadspace.requests++;
    } catch (error) {
      errors.push({ source: 'leadspace', error: error.message });
      this._trackSourceError('leadspace', error.message);
    }

    // Step 3: Data quality validation
    let validationResult;
    try {
      if (dataType === 'person') {
        validationResult = await this.qualityValidator.validatePersonData(enrichedData, options);
      } else {
        validationResult = await this.qualityValidator.validateCompanyData(enrichedData, options);
      }
    } catch (error) {
      logger.warn('Data validation failed', { error: error.message });
      validationResult = { qualityScore: 0, isValid: false };
    }

    // Step 4: Apply data cleanup and normalization
    const normalizedData = this.normalizeData(enrichedData, dataType);

    logger.info('Comprehensive enrichment completed', {
      sourcesUsed,
      totalCreditsUsed,
      qualityScore: validationResult.qualityScore,
      errorCount: errors.length,
    });

    return {
      success: sourcesUsed.length > 0,
      data: normalizedData,
      originalData: data,
      sourcesUsed,
      creditsUsed: totalCreditsUsed,
      qualityScore: validationResult.qualityScore || 0,
      validation: validationResult,
      errors: errors.length > 0 ? errors : undefined,
      enrichmentSummary: {
        fieldsEnriched: this._countEnrichedFields(data, normalizedData),
        sourcesUsed: sourcesUsed.length,
        qualityImprovement: this._calculateQualityImprovement(data, normalizedData),
        enrichmentDate: new Date().toISOString(),
      },
    };
  }

  /**
   * Fast enrichment strategy - uses most reliable/fastest source first
   * @private
   */
  async fastEnrichment(data, options, logger) {
    const dataType = options.dataType || 'person';
    logger.info('Starting fast enrichment', { dataType });

    // Use Apollo first (typically faster)
    try {
      let result;
      if (dataType === 'person' && data.email) {
        result = await this.apolloService.enrichPersonByEmail(data.email, {
          revealPersonalEmails: false, // Skip to save time
          revealPhoneNumber: false,
        });
      } else if (dataType === 'company' && (data.domain || data.name)) {
        result = await this.apolloService.enrichCompany(
          data.domain ? { domain: data.domain } : { name: data.name }
        );
      }

      if (result?.success) {
        const transformedData = this.transformSourceData(result.data, 'apollo', dataType);
        const enrichedData = this.mergeEnrichedData(data, transformedData, 'apollo');
        const normalizedData = this.normalizeData(enrichedData, dataType);

        return {
          success: true,
          data: normalizedData,
          originalData: data,
          sourcesUsed: ['apollo'],
          creditsUsed: result.creditsUsed || 1,
          qualityScore: 75, // Estimated for fast mode
          enrichmentSummary: {
            fieldsEnriched: this._countEnrichedFields(data, normalizedData),
            sourcesUsed: 1,
            enrichmentDate: new Date().toISOString(),
          },
        };
      }
    } catch (error) {
      logger.warn('Fast enrichment with Apollo failed', { error: error.message });
    }

    // Fallback to original data
    return {
      success: false,
      data: data,
      originalData: data,
      sourcesUsed: [],
      creditsUsed: 0,
      error: 'No enrichment sources available',
    };
  }

  /**
   * Cost-effective enrichment strategy - minimizes API costs
   * @private
   */
  async costEffectiveEnrichment(data, options, logger) {
    const dataType = options.dataType || 'person';
    logger.info('Starting cost-effective enrichment', { dataType });

    // Only enrich if we have minimal required data
    if (dataType === 'person' && !data.email) {
      return {
        success: false,
        data: data,
        originalData: data,
        sourcesUsed: [],
        creditsUsed: 0,
        error: 'Insufficient data for cost-effective enrichment',
      };
    }

    if (dataType === 'company' && !data.domain && !data.name) {
      return {
        success: false,
        data: data,
        originalData: data,
        sourcesUsed: [],
        creditsUsed: 0,
        error: 'Insufficient data for cost-effective enrichment',
      };
    }

    // Use Leadspace (typically more cost-effective)
    try {
      let result;
      if (dataType === 'person') {
        result = await this.leadspaceService.enrichPerson(data, {
          fields: ['basic_info', 'job_details'], // Minimal fields
          includeCompanyData: false,
        });
      } else {
        result = await this.leadspaceService.enrichCompany(data, {
          fields: ['basic_info', 'contact_info'], // Minimal fields
        });
      }

      if (result?.success) {
        const transformedData = this.transformSourceData(result.data, 'leadspace', dataType);
        const enrichedData = this.mergeEnrichedData(data, transformedData, 'leadspace');
        const normalizedData = this.normalizeData(enrichedData, dataType);

        return {
          success: true,
          data: normalizedData,
          originalData: data,
          sourcesUsed: ['leadspace'],
          creditsUsed: result.creditsUsed || 1,
          qualityScore: result.confidence || 65,
          enrichmentSummary: {
            fieldsEnriched: this._countEnrichedFields(data, normalizedData),
            sourcesUsed: 1,
            enrichmentDate: new Date().toISOString(),
          },
        };
      }
    } catch (error) {
      logger.warn('Cost-effective enrichment failed', { error: error.message });
    }

    return {
      success: false,
      data: data,
      originalData: data,
      sourcesUsed: [],
      creditsUsed: 0,
      error: 'Cost-effective enrichment failed',
    };
  }

  /**
   * Validation-only enrichment - focuses on data quality without new data
   * @private
   */
  async validationOnlyEnrichment(data, options, logger) {
    const dataType = options.dataType || 'person';
    logger.info('Starting validation-only enrichment', { dataType });

    try {
      // Perform data quality validation
      let validationResult;
      if (dataType === 'person') {
        validationResult = await this.qualityValidator.validatePersonData(data, options);
      } else {
        validationResult = await this.qualityValidator.validateCompanyData(data, options);
      }

      // Apply data cleanup and normalization
      const normalizedData = this.normalizeData(data, dataType);

      return {
        success: true,
        data: normalizedData,
        originalData: data,
        sourcesUsed: [],
        creditsUsed: 0,
        qualityScore: validationResult.qualityScore || 0,
        validation: validationResult,
        enrichmentSummary: {
          fieldsEnriched: 0,
          sourcesUsed: 0,
          qualityImprovement: validationResult.qualityScore || 0,
          enrichmentDate: new Date().toISOString(),
        },
      };

    } catch (error) {
      logger.error('Validation-only enrichment failed', { error: error.message });
      
      return {
        success: false,
        data: data,
        originalData: data,
        sourcesUsed: [],
        creditsUsed: 0,
        error: error.message,
      };
    }
  }

  /**
   * Transform source-specific data to standardized format
   * @private
   */
  transformSourceData(sourceData, sourceName, dataType) {
    const mappings = this.fieldMappings[dataType]?.[sourceName];
    if (!mappings) return sourceData;

    const transformedData = {};
    
    // Apply field mappings
    Object.entries(mappings).forEach(([targetField, sourceField]) => {
      if (sourceData[sourceField] !== undefined) {
        transformedData[targetField] = sourceData[sourceField];
      }
    });

    // Add source metadata
    transformedData._enrichmentSource = sourceName;
    transformedData._enrichmentTimestamp = new Date().toISOString();

    return { ...sourceData, ...transformedData };
  }

  /**
   * Merge enriched data from multiple sources intelligently
   * @private
   */
  mergeEnrichedData(baseData, enrichedData, source) {
    const merged = { ...baseData };

    // Source priority for conflict resolution
    const sourcePriority = {
      leadspace: 3,
      apollo: 2,
      manual: 1,
    };

    Object.entries(enrichedData).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        return; // Skip empty values
      }

      // If field doesn't exist, add it
      if (!merged[key]) {
        merged[key] = value;
        return;
      }

      // If field exists, check source priority for resolution
      const existingSource = merged._enrichmentMetadata?.[key]?.source || 'manual';
      const currentPriority = sourcePriority[source] || 0;
      const existingPriority = sourcePriority[existingSource] || 0;

      if (currentPriority > existingPriority) {
        merged[key] = value;
      }
    });

    // Track enrichment metadata
    if (!merged._enrichmentMetadata) {
      merged._enrichmentMetadata = {};
    }

    Object.keys(enrichedData).forEach(key => {
      if (enrichedData[key] !== null && enrichedData[key] !== undefined && enrichedData[key] !== '') {
        merged._enrichmentMetadata[key] = {
          source,
          timestamp: new Date().toISOString(),
        };
      }
    });

    return merged;
  }

  /**
   * Normalize and clean data
   * @private
   */
  normalizeData(data, dataType) {
    const normalized = { ...data };

    if (dataType === 'person') {
      // Normalize name fields
      if (normalized.firstName) {
        normalized.firstName = this._capitalizeFirstLetter(normalized.firstName.trim());
      }
      if (normalized.lastName) {
        normalized.lastName = this._capitalizeFirstLetter(normalized.lastName.trim());
      }
      
      // Normalize email
      if (normalized.email) {
        normalized.email = normalized.email.toLowerCase().trim();
      }
      
      // Normalize phone numbers
      if (normalized.phoneNumbers && Array.isArray(normalized.phoneNumbers)) {
        normalized.phoneNumbers = normalized.phoneNumbers.map(phone => 
          this._normalizePhoneNumber(phone)
        ).filter(Boolean);
      }
    }

    if (dataType === 'company') {
      // Normalize company name
      if (normalized.name) {
        normalized.name = normalized.name.trim();
      }
      
      // Normalize domain
      if (normalized.domain) {
        normalized.domain = normalized.domain.toLowerCase().replace(/^www\./, '');
      }
    }

    // Remove enrichment metadata from final output
    delete normalized._enrichmentSource;
    delete normalized._enrichmentTimestamp;
    delete normalized._enrichmentMetadata;

    return normalized;
  }

  /**
   * Enrich campaign data with contact enrichment
   */
  async enrichCampaignData(campaignSpec, options = {}) {
    const enrichmentId = uuidv4();
    const logger = createContextLogger({
      service: 'data-enrichment',
      enrichmentId,
      method: 'enrichCampaignData',
    });

    logger.info('Starting campaign data enrichment', { 
      campaignName: campaignSpec.name,
      audienceSize: campaignSpec.audience?.contacts?.length || 0,
    });

    const results = {
      campaignId: campaignSpec.id || enrichmentId,
      enrichedContacts: 0,
      failedEnrichments: 0,
      totalCreditsUsed: 0,
      qualityScores: [],
      errors: [],
    };

    if (campaignSpec.audience?.contacts) {
      const enrichmentPromises = campaignSpec.audience.contacts.map(contact => 
        this.enrichContact(contact, options)
      );

      const enrichmentResults = await Promise.allSettled(enrichmentPromises);

      for (let i = 0; i < enrichmentResults.length; i++) {
        const result = enrichmentResults[i];
        
        if (result.status === 'fulfilled' && result.value.success) {
          campaignSpec.audience.contacts[i] = result.value.data;
          results.enrichedContacts++;
          results.totalCreditsUsed += result.value.creditsUsed || 0;
          if (result.value.qualityScore) {
            results.qualityScores.push(result.value.qualityScore);
          }
        } else {
          results.failedEnrichments++;
          if (result.reason) {
            results.errors.push(result.reason.message);
          }
        }
      }
    }

    // Add enrichment summary
    campaignSpec.enrichmentSummary = {
      enrichmentId,
      recordsEnriched: results.enrichedContacts,
      recordsFailed: results.failedEnrichments,
      creditsUsed: results.totalCreditsUsed,
      averageQualityScore: results.qualityScores.length > 0 
        ? Math.round(results.qualityScores.reduce((a, b) => a + b, 0) / results.qualityScores.length)
        : 0,
      enrichmentDate: new Date().toISOString(),
    };

    logger.info('Campaign data enrichment completed', results);

    return {
      success: true,
      campaignSpec,
      enrichmentSummary: results,
    };
  }

  /**
   * Enrich contact list
   */
  async enrichContactList(listId, options = {}) {
    this.logger.info('Enriching contact list', { listId, strategy: options.strategy });
    
    // This would typically fetch the list from a database
    // For now, return a placeholder
    return { 
      success: true, 
      listId,
      recordsEnriched: 0,
      strategy: options.strategy || 'comprehensive',
    };
  }

  /**
   * Helper methods
   * @private
   */
  _capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
  }

  _normalizePhoneNumber(phone) {
    // Basic phone number normalization
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.length >= 10) {
      return cleaned;
    }
    return null;
  }

  _countEnrichedFields(original, enriched) {
    let count = 0;
    Object.keys(enriched).forEach(key => {
      if (!original[key] && enriched[key]) {
        count++;
      }
    });
    return count;
  }

  _calculateQualityImprovement(original, enriched) {
    // Simplified quality improvement calculation
    const originalFields = Object.keys(original).filter(k => original[k]).length;
    const enrichedFields = Object.keys(enriched).filter(k => enriched[k]).length;
    
    if (originalFields === 0) return 100;
    return Math.round(((enrichedFields - originalFields) / originalFields) * 100);
  }

  _updateMetrics(type, success, duration, result = {}) {
    this.metrics.totalEnrichments++;
    
    if (success) {
      this.metrics.successfulEnrichments++;
    } else {
      this.metrics.failedEnrichments++;
    }

    // Update type-specific metrics
    if (!this.metrics.enrichmentsByType[type]) {
      this.metrics.enrichmentsByType[type] = { total: 0, success: 0, failed: 0 };
    }
    
    this.metrics.enrichmentsByType[type].total++;
    if (success) {
      this.metrics.enrichmentsByType[type].success++;
    } else {
      this.metrics.enrichmentsByType[type].failed++;
    }

    // Update rolling average enrichment time
    const totalTime = this.metrics.averageEnrichmentTime * (this.metrics.totalEnrichments - 1) + duration;
    this.metrics.averageEnrichmentTime = Math.round(totalTime / this.metrics.totalEnrichments);

    // Update quality scores
    if (result.qualityScore !== undefined) {
      const totalScores = this.metrics.qualityScores.average * (this.metrics.successfulEnrichments - 1) + result.qualityScore;
      this.metrics.qualityScores.average = Math.round(totalScores / this.metrics.successfulEnrichments);
      
      // Update quality distribution
      if (result.qualityScore >= 80) {
        this.metrics.qualityScores.distribution.high++;
      } else if (result.qualityScore >= 60) {
        this.metrics.qualityScores.distribution.medium++;
      } else {
        this.metrics.qualityScores.distribution.low++;
      }
    }
  }

  _trackSourceError(source, error) {
    if (!this.metrics.errorsBySource[source]) {
      this.metrics.errorsBySource[source] = {};
    }
    
    const errorKey = error.substring(0, 50); // Truncate long errors
    this.metrics.errorsBySource[source][errorKey] = 
      (this.metrics.errorsBySource[source][errorKey] || 0) + 1;
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
        size: this.enrichmentQueue.size,
        pending: this.enrichmentQueue.pending,
        concurrency: this.enrichmentQueue.concurrency,
      },
      services: {
        apollo: this.apolloService.getHealthStatus(),
        leadspace: this.leadspaceService.getHealthStatus(),
        qualityValidator: this.qualityValidator.getHealthStatus(),
      },
    };
  }

  /**
   * Shutdown service gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down data enrichment service');

    try {
      await this.enrichmentQueue.onIdle();
      
      await Promise.all([
        this.apolloService.shutdown(),
        this.leadspaceService.shutdown(),
      ]);

      this.logger.info('Data enrichment service shutdown complete', {
        totalEnrichments: this.metrics.totalEnrichments,
        successRate: this.metrics.totalEnrichments > 0 
          ? Math.round((this.metrics.successfulEnrichments / this.metrics.totalEnrichments) * 100)
          : 0,
      });
    } catch (error) {
      this.logger.error('Error during data enrichment service shutdown', { error: error.message });
    }
  }
}

export default DataEnrichmentService;