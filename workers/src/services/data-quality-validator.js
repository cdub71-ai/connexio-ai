import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import { createContextLogger } from '../utils/logger.js';
import config from '../config/index.js';

/**
 * Data Quality Validation Engine
 * Validates data quality, completeness, and consistency for enriched data
 */
class DataQualityValidator {
  constructor() {
    this.logger = createContextLogger({ service: 'data-quality-validator' });
    
    // Quality scoring weights
    this.qualityWeights = {
      completeness: 0.4,      // How complete the data is
      accuracy: 0.3,          // How accurate/valid the data appears
      consistency: 0.2,       // How consistent across sources
      freshness: 0.1,         // How recent the data is
    };

    // Validation rules
    this.validationRules = this.initializeValidationRules();
    
    // Quality metrics
    this.metrics = {
      totalValidations: 0,
      passedValidations: 0,
      failedValidations: 0,
      averageQualityScore: 0,
      validationsByType: {},
      errorsByField: {},
    };

    this.logger.info('Data Quality Validator initialized', {
      qualityWeights: this.qualityWeights,
      totalRules: Object.keys(this.validationRules).length,
    });
  }

  /**
   * Initialize validation rules for different data types
   * @private
   */
  initializeValidationRules() {
    return {
      // Person data validation
      person: Joi.object({
        // Required fields
        email: Joi.string().email().required(),
        
        // Name validation
        firstName: Joi.string().min(1).max(50).optional(),
        lastName: Joi.string().min(1).max(50).optional(),
        fullName: Joi.string().min(2).max(100).optional(),
        
        // Contact validation
        phoneNumbers: Joi.array().items(
          Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(20)
        ).optional(),
        personalEmails: Joi.array().items(Joi.string().email()).optional(),
        workEmails: Joi.array().items(Joi.string().email()).optional(),
        
        // Professional validation
        title: Joi.string().min(2).max(100).optional(),
        company: Joi.object().optional(),
        seniority: Joi.string().valid(
          'entry', 'junior', 'mid', 'senior', 'director', 'vp', 'c-level', 'founder'
        ).optional(),
        
        // Location validation
        city: Joi.string().min(2).max(50).optional(),
        state: Joi.string().min(2).max(50).optional(),
        country: Joi.string().length(2).optional(), // ISO country code
        
        // Social profiles
        linkedinUrl: Joi.string().uri().pattern(/linkedin\.com/).optional(),
        twitterUrl: Joi.string().uri().pattern(/twitter\.com|x\.com/).optional(),
        
        // Metadata
        dataEnrichedAt: Joi.date().iso().optional(),
        matchConfidence: Joi.number().min(0).max(100).optional(),
      }),

      // Company data validation
      company: Joi.object({
        // Required fields
        name: Joi.string().min(2).max(200).required(),
        
        // Business identifiers
        domain: Joi.string().domain().optional(),
        website: Joi.string().uri().optional(),
        
        // Business info
        industry: Joi.string().min(3).max(100).optional(),
        employeeCount: Joi.number().integer().min(1).max(10000000).optional(),
        employeeRange: Joi.string().optional(),
        annualRevenue: Joi.number().min(0).optional(),
        
        // Location
        city: Joi.string().min(2).max(50).optional(),
        state: Joi.string().min(2).max(50).optional(),
        country: Joi.string().length(2).optional(),
        
        // Contact info
        phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional(),
        
        // Financial
        founded: Joi.number().integer().min(1800).max(new Date().getFullYear()).optional(),
        totalFunding: Joi.number().min(0).optional(),
        
        // Technology
        technologies: Joi.array().items(Joi.string()).optional(),
        
        // Social
        linkedinUrl: Joi.string().uri().pattern(/linkedin\.com/).optional(),
        
        // Metadata
        dataEnrichedAt: Joi.date().iso().optional(),
        matchConfidence: Joi.number().min(0).max(100).optional(),
      }),

      // Email validation rules
      email: Joi.object({
        email: Joi.string().email().required(),
        isValid: Joi.boolean().required(),
        confidence: Joi.number().min(0).max(100).optional(),
        deliverability: Joi.number().min(0).max(100).optional(),
        isDisposable: Joi.boolean().optional(),
        isCatchAll: Joi.boolean().optional(),
        domainStatus: Joi.string().valid('valid', 'invalid', 'unknown').optional(),
      }),
    };
  }

  /**
   * Validate enriched person data
   * @param {Object} personData - Enriched person data to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation results with quality score
   */
  async validatePersonData(personData, options = {}) {
    const validationId = uuidv4();
    const logger = createContextLogger({
      service: 'data-quality-validator',
      validationId,
      method: 'validatePersonData',
    });

    logger.info('Starting person data validation', {
      hasEmail: !!personData.email,
      hasName: !!(personData.firstName || personData.lastName || personData.fullName),
      hasCompany: !!personData.company,
      sources: this._extractSources(personData),
    });

    try {
      const validation = await this._performValidation(
        personData, 
        'person', 
        options, 
        logger
      );

      // Calculate quality scores
      const qualityScores = this._calculateQualityScores(personData, 'person', validation);
      
      // Overall quality score
      const overallScore = this._calculateOverallScore(qualityScores);

      const result = {
        validationId,
        isValid: validation.isValid,
        qualityScore: overallScore,
        qualityScores,
        validation,
        recommendations: this._generateRecommendations(personData, validation, 'person'),
        timestamp: new Date().toISOString(),
      };

      this._updateMetrics('person', validation.isValid, overallScore);

      logger.info('Person data validation completed', {
        isValid: validation.isValid,
        qualityScore: overallScore,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
      });

      return result;

    } catch (error) {
      logger.error('Person data validation failed', { error: error.message });
      
      return {
        validationId,
        isValid: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Validate enriched company data
   * @param {Object} companyData - Enriched company data to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation results with quality score
   */
  async validateCompanyData(companyData, options = {}) {
    const validationId = uuidv4();
    const logger = createContextLogger({
      service: 'data-quality-validator',
      validationId,
      method: 'validateCompanyData',
    });

    logger.info('Starting company data validation', {
      hasName: !!companyData.name,
      hasDomain: !!companyData.domain,
      hasIndustry: !!companyData.industry,
      sources: this._extractSources(companyData),
    });

    try {
      const validation = await this._performValidation(
        companyData, 
        'company', 
        options, 
        logger
      );

      // Calculate quality scores
      const qualityScores = this._calculateQualityScores(companyData, 'company', validation);
      
      // Overall quality score
      const overallScore = this._calculateOverallScore(qualityScores);

      const result = {
        validationId,
        isValid: validation.isValid,
        qualityScore: overallScore,
        qualityScores,
        validation,
        recommendations: this._generateRecommendations(companyData, validation, 'company'),
        timestamp: new Date().toISOString(),
      };

      this._updateMetrics('company', validation.isValid, overallScore);

      logger.info('Company data validation completed', {
        isValid: validation.isValid,
        qualityScore: overallScore,
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length,
      });

      return result;

    } catch (error) {
      logger.error('Company data validation failed', { error: error.message });
      
      return {
        validationId,
        isValid: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Validate email verification results
   * @param {Object} emailData - Email verification data
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation results
   */
  async validateEmailData(emailData, options = {}) {
    const validationId = uuidv4();
    const logger = createContextLogger({
      service: 'data-quality-validator',
      validationId,
      method: 'validateEmailData',
    });

    logger.info('Starting email data validation', {
      email: this._maskEmail(emailData.email),
      isValid: emailData.isValid,
      confidence: emailData.confidence,
    });

    try {
      const validation = await this._performValidation(
        emailData, 
        'email', 
        options, 
        logger
      );

      // Calculate quality scores for email
      const qualityScores = this._calculateEmailQualityScores(emailData, validation);
      
      // Overall quality score
      const overallScore = this._calculateOverallScore(qualityScores);

      const result = {
        validationId,
        isValid: validation.isValid,
        qualityScore: overallScore,
        qualityScores,
        validation,
        recommendations: this._generateEmailRecommendations(emailData, validation),
        timestamp: new Date().toISOString(),
      };

      this._updateMetrics('email', validation.isValid, overallScore);

      logger.info('Email data validation completed', {
        isValid: validation.isValid,
        qualityScore: overallScore,
        deliverable: emailData.isValid && !emailData.isDisposable,
      });

      return result;

    } catch (error) {
      logger.error('Email data validation failed', { error: error.message });
      
      return {
        validationId,
        isValid: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Perform batch validation on multiple records
   * @param {Array} records - Array of records to validate
   * @param {string} dataType - Type of data (person, company, email)
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Batch validation results
   */
  async validateBatch(records, dataType, options = {}) {
    const batchId = uuidv4();
    const logger = createContextLogger({
      service: 'data-quality-validator',
      batchId,
      method: 'validateBatch',
    });

    logger.info('Starting batch validation', {
      recordCount: records.length,
      dataType,
      batchSize: options.batchSize || 50,
    });

    const results = {
      batchId,
      total: records.length,
      validated: 0,
      failed: 0,
      results: [],
      summary: {
        averageQualityScore: 0,
        validRecords: 0,
        invalidRecords: 0,
        highQualityRecords: 0, // Score >= 80
        mediumQualityRecords: 0, // Score 60-79
        lowQualityRecords: 0, // Score < 60
      },
      timestamp: new Date().toISOString(),
    };

    const batchSize = options.batchSize || 50;
    const batches = this._createBatches(records, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      logger.info('Processing validation batch', {
        batchNumber: i + 1,
        totalBatches: batches.length,
        batchSize: batch.length,
      });

      const batchPromises = batch.map(record => 
        this._validateSingleRecord(record, dataType, options, logger)
      );

      const batchResults = await Promise.allSettled(batchPromises);

      // Process batch results
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        
        if (result.status === 'fulfilled') {
          const validationResult = result.value;
          results.validated++;
          
          if (validationResult.isValid) {
            results.summary.validRecords++;
          } else {
            results.summary.invalidRecords++;
          }

          // Categorize by quality score
          if (validationResult.qualityScore >= 80) {
            results.summary.highQualityRecords++;
          } else if (validationResult.qualityScore >= 60) {
            results.summary.mediumQualityRecords++;
          } else {
            results.summary.lowQualityRecords++;
          }

          results.results.push(validationResult);
        } else {
          results.failed++;
          results.results.push({
            isValid: false,
            error: result.reason.message,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Add delay between batches
      if (i < batches.length - 1) {
        const delay = options.batchDelay || 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Calculate average quality score
    const validResults = results.results.filter(r => r.qualityScore !== undefined);
    if (validResults.length > 0) {
      results.summary.averageQualityScore = Math.round(
        validResults.reduce((sum, r) => sum + r.qualityScore, 0) / validResults.length
      );
    }

    logger.info('Batch validation completed', {
      total: results.total,
      validated: results.validated,
      failed: results.failed,
      averageQualityScore: results.summary.averageQualityScore,
      validRecords: results.summary.validRecords,
    });

    return results;
  }

  /**
   * Perform schema validation using Joi
   * @private
   */
  async _performValidation(data, dataType, options, logger) {
    const schema = this.validationRules[dataType];
    
    if (!schema) {
      throw new Error(`No validation schema found for data type: ${dataType}`);
    }

    // Perform Joi validation
    const { error, value, warning } = schema.validate(data, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: false,
    });

    const validation = {
      isValid: !error,
      errors: [],
      warnings: [],
      validatedData: value,
    };

    // Process validation errors
    if (error) {
      validation.errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
        type: detail.type,
      }));
    }

    // Add custom validation warnings
    const customWarnings = this._performCustomValidation(data, dataType);
    validation.warnings = [...(warning ? [warning] : []), ...customWarnings];

    return validation;
  }

  /**
   * Perform custom validation checks beyond schema validation
   * @private
   */
  _performCustomValidation(data, dataType) {
    const warnings = [];

    if (dataType === 'person') {
      // Check for missing critical fields
      if (!data.firstName && !data.lastName && !data.fullName) {
        warnings.push({
          field: 'name',
          message: 'No name information available',
          severity: 'medium',
        });
      }

      // Check for suspicious email patterns
      if (data.email && this._isDisposableEmailDomain(data.email)) {
        warnings.push({
          field: 'email',
          message: 'Email uses disposable domain',
          severity: 'high',
        });
      }

      // Check for data consistency
      if (data.personalEmails && data.email && !data.personalEmails.includes(data.email)) {
        warnings.push({
          field: 'email',
          message: 'Primary email not found in personal emails list',
          severity: 'low',
        });
      }
    }

    if (dataType === 'company') {
      // Check domain consistency
      if (data.domain && data.website) {
        const domainFromWebsite = this._extractDomainFromUrl(data.website);
        if (domainFromWebsite && domainFromWebsite !== data.domain) {
          warnings.push({
            field: 'domain',
            message: 'Domain does not match website URL',
            severity: 'medium',
          });
        }
      }

      // Check for unrealistic employee counts
      if (data.employeeCount && data.employeeCount > 1000000) {
        warnings.push({
          field: 'employeeCount',
          message: 'Employee count seems unrealistic',
          severity: 'medium',
        });
      }
    }

    return warnings;
  }

  /**
   * Calculate quality scores for different aspects
   * @private
   */
  _calculateQualityScores(data, dataType, validation) {
    const scores = {
      completeness: this._calculateCompletenessScore(data, dataType),
      accuracy: this._calculateAccuracyScore(data, validation),
      consistency: this._calculateConsistencyScore(data, dataType),
      freshness: this._calculateFreshnessScore(data),
    };

    return scores;
  }

  /**
   * Calculate completeness score based on available fields
   * @private
   */
  _calculateCompletenessScore(data, dataType) {
    const requiredFields = this._getRequiredFields(dataType);
    const optionalFields = this._getOptionalFields(dataType);
    
    let score = 0;
    let maxScore = requiredFields.length * 10 + optionalFields.length;

    // Required fields (10 points each)
    requiredFields.forEach(field => {
      if (this._hasValidValue(data, field)) {
        score += 10;
      }
    });

    // Optional fields (1 point each)
    optionalFields.forEach(field => {
      if (this._hasValidValue(data, field)) {
        score += 1;
      }
    });

    return Math.min(Math.round((score / maxScore) * 100), 100);
  }

  /**
   * Calculate accuracy score based on validation results
   * @private
   */
  _calculateAccuracyScore(data, validation) {
    if (!validation.isValid) {
      return Math.max(50 - (validation.errors.length * 10), 0);
    }

    let score = 100;
    
    // Reduce score for warnings
    validation.warnings.forEach(warning => {
      if (warning.severity === 'high') score -= 15;
      else if (warning.severity === 'medium') score -= 10;
      else score -= 5;
    });

    return Math.max(score, 0);
  }

  /**
   * Calculate consistency score across data sources
   * @private
   */
  _calculateConsistencyScore(data, dataType) {
    // Check for data source consistency
    const sources = this._extractSources(data);
    
    if (sources.length <= 1) {
      return 70; // Neutral score for single source
    }

    let score = 100;
    
    // Check for conflicting information (simplified)
    if (dataType === 'person' && data.company) {
      // Check if company data is consistent
      if (data.company.name && data.companyName && 
          data.company.name !== data.companyName) {
        score -= 20;
      }
    }

    return Math.max(score, 0);
  }

  /**
   * Calculate freshness score based on data age
   * @private
   */
  _calculateFreshnessScore(data) {
    const enrichedAt = data.dataEnrichedAt || data.lastUpdated;
    
    if (!enrichedAt) {
      return 50; // Neutral score if no timestamp
    }

    const ageInDays = (Date.now() - new Date(enrichedAt)) / (1000 * 60 * 60 * 24);
    
    if (ageInDays <= 7) return 100;      // Fresh (within a week)
    if (ageInDays <= 30) return 80;      // Recent (within a month)
    if (ageInDays <= 90) return 60;      // Acceptable (within 3 months)
    if (ageInDays <= 365) return 40;     // Old (within a year)
    return 20;                           // Very old (over a year)
  }

  /**
   * Calculate email-specific quality scores
   * @private
   */
  _calculateEmailQualityScores(emailData, validation) {
    return {
      validity: this._calculateEmailValidityScore(emailData),
      deliverability: emailData.deliverability || 50,
      reputation: this._calculateEmailReputationScore(emailData),
      accuracy: this._calculateAccuracyScore(emailData, validation),
    };
  }

  /**
   * Calculate email validity score
   * @private
   */
  _calculateEmailValidityScore(emailData) {
    let score = emailData.isValid ? 100 : 0;
    
    if (emailData.isDisposable) score -= 30;
    if (emailData.isCatchAll) score -= 20;
    if (emailData.domainStatus === 'invalid') score -= 50;
    
    return Math.max(score, 0);
  }

  /**
   * Calculate email reputation score
   * @private
   */
  _calculateEmailReputationScore(emailData) {
    let score = 100;
    
    if (emailData.risk === 'high') score -= 50;
    else if (emailData.risk === 'medium') score -= 25;
    
    if (emailData.isDisposable) score -= 30;
    
    return Math.max(score, 0);
  }

  /**
   * Calculate overall quality score from component scores
   * @private
   */
  _calculateOverallScore(qualityScores) {
    let totalScore = 0;
    
    Object.entries(qualityScores).forEach(([component, score]) => {
      const weight = this.qualityWeights[component] || 0.25;
      totalScore += score * weight;
    });

    return Math.round(totalScore);
  }

  /**
   * Generate recommendations for improving data quality
   * @private
   */
  _generateRecommendations(data, validation, dataType) {
    const recommendations = [];

    // Recommendations based on validation errors
    validation.errors.forEach(error => {
      recommendations.push({
        type: 'error',
        field: error.field,
        message: `Fix ${error.field}: ${error.message}`,
        priority: 'high',
      });
    });

    // Recommendations based on warnings
    validation.warnings.forEach(warning => {
      recommendations.push({
        type: 'warning',
        field: warning.field,
        message: warning.message,
        priority: warning.severity || 'medium',
      });
    });

    // Data type specific recommendations
    if (dataType === 'person') {
      if (!data.company) {
        recommendations.push({
          type: 'enhancement',
          field: 'company',
          message: 'Add company information to improve data richness',
          priority: 'medium',
        });
      }

      if (!data.phoneNumbers || data.phoneNumbers.length === 0) {
        recommendations.push({
          type: 'enhancement',
          field: 'phoneNumbers',
          message: 'Add phone number for better contact completeness',
          priority: 'low',
        });
      }
    }

    if (dataType === 'company') {
      if (!data.industry) {
        recommendations.push({
          type: 'enhancement',
          field: 'industry',
          message: 'Add industry classification for better targeting',
          priority: 'medium',
        });
      }

      if (!data.employeeCount && !data.employeeRange) {
        recommendations.push({
          type: 'enhancement',
          field: 'employeeCount',
          message: 'Add employee count information for sizing',
          priority: 'medium',
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate email-specific recommendations
   * @private
   */
  _generateEmailRecommendations(emailData, validation) {
    const recommendations = [];

    if (!emailData.isValid) {
      recommendations.push({
        type: 'error',
        field: 'email',
        message: 'Email address is invalid and should be removed',
        priority: 'high',
      });
    }

    if (emailData.isDisposable) {
      recommendations.push({
        type: 'warning',
        field: 'email',
        message: 'Email uses disposable domain - consider additional verification',
        priority: 'medium',
      });
    }

    if (emailData.deliverability && emailData.deliverability < 70) {
      recommendations.push({
        type: 'warning',
        field: 'deliverability',
        message: 'Low deliverability score - may have delivery issues',
        priority: 'medium',
      });
    }

    return recommendations;
  }

  /**
   * Validate single record for batch processing
   * @private
   */
  async _validateSingleRecord(record, dataType, options, logger) {
    try {
      switch (dataType) {
        case 'person':
          return await this.validatePersonData(record, options);
        case 'company':
          return await this.validateCompanyData(record, options);
        case 'email':
          return await this.validateEmailData(record, options);
        default:
          throw new Error(`Unsupported data type: ${dataType}`);
      }
    } catch (error) {
      return {
        isValid: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Helper methods
   * @private
   */
  _extractSources(data) {
    const sources = [];
    if (data.apolloId) sources.push('apollo');
    if (data.leadspaceId) sources.push('leadspace');
    if (data.source) sources.push(data.source);
    return [...new Set(sources)];
  }

  _hasValidValue(data, field) {
    const value = this._getNestedValue(data, field);
    return value !== null && value !== undefined && value !== '';
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  _getRequiredFields(dataType) {
    const fields = {
      person: ['email'],
      company: ['name'],
      email: ['email', 'isValid'],
    };
    return fields[dataType] || [];
  }

  _getOptionalFields(dataType) {
    const fields = {
      person: ['firstName', 'lastName', 'title', 'company', 'phoneNumbers', 'city', 'linkedinUrl'],
      company: ['domain', 'industry', 'employeeCount', 'city', 'phone', 'linkedinUrl'],
      email: ['confidence', 'deliverability', 'domainStatus'],
    };
    return fields[dataType] || [];
  }

  _isDisposableEmailDomain(email) {
    const disposableDomains = [
      '10minutemail.com', 'tempmail.org', 'guerrillamail.com', 
      'mailinator.com', 'yopmail.com', 'temp-mail.org'
    ];
    const domain = email.split('@')[1]?.toLowerCase();
    return disposableDomains.includes(domain);
  }

  _extractDomainFromUrl(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return null;
    }
  }

  _maskEmail(email) {
    if (!email) return null;
    const [local, domain] = email.split('@');
    return `${local.charAt(0)}***@${domain}`;
  }

  _createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Update validation metrics
   * @private
   */
  _updateMetrics(dataType, isValid, qualityScore) {
    this.metrics.totalValidations++;
    
    if (isValid) {
      this.metrics.passedValidations++;
    } else {
      this.metrics.failedValidations++;
    }

    // Update data type metrics
    if (!this.metrics.validationsByType[dataType]) {
      this.metrics.validationsByType[dataType] = { total: 0, passed: 0, failed: 0 };
    }
    
    this.metrics.validationsByType[dataType].total++;
    if (isValid) {
      this.metrics.validationsByType[dataType].passed++;
    } else {
      this.metrics.validationsByType[dataType].failed++;
    }

    // Update rolling average quality score
    const totalScore = this.metrics.averageQualityScore * (this.metrics.totalValidations - 1) + qualityScore;
    this.metrics.averageQualityScore = Math.round(totalScore / this.metrics.totalValidations);
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      validationRules: Object.keys(this.validationRules),
      qualityWeights: this.qualityWeights,
    };
  }

  /**
   * Get validation statistics
   */
  getValidationStats() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalValidations > 0 
        ? Math.round((this.metrics.passedValidations / this.metrics.totalValidations) * 100)
        : 0,
      timestamp: new Date().toISOString(),
    };
  }
}

export default DataQualityValidator;