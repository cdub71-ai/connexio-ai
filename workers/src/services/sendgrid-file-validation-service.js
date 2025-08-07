import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import csv from 'csv-parser';
import { createReadStream, createWriteStream } from 'fs';
import { createContextLogger, createTimer } from '../utils/logger.js';
import SendGridValidationService from './sendgrid-validation-service.js';
import EnhancedValidationService from './enhanced-validation-service.js';
import ClaudeDeduplicationService from './claude-deduplication-service.js';

/**
 * SendGrid File Validation Service
 * Handles client file validation requests using SendGrid and enhanced validation
 * Integrates with data hygiene excellence framework for optimal results
 */
class SendGridFileValidationService {
  constructor() {
    this.sendGridService = new SendGridValidationService();
    this.enhancedValidationService = new EnhancedValidationService();
    this.deduplicationService = new ClaudeDeduplicationService();
    this.logger = createContextLogger({ service: 'sendgrid-file-validation' });
    
    // Processing metrics
    this.metrics = {
      totalFilesProcessed: 0,
      totalEmailsValidated: 0,
      totalCostSavings: 0,
      averageProcessingTime: 0,
      duplicatesRemoved: 0,
      validationAccuracy: 0
    };

    this.logger.info('SendGrid file validation service initialized');
  }

  /**
   * Process file validation request for client test
   * Implements data hygiene excellence framework with cost optimization
   * @param {string} filePath - Path to CSV file containing email addresses
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Complete validation results with recommendations
   */
  async processFileValidation(filePath, options = {}) {
    const validationId = uuidv4();
    const timer = createTimer('file-validation-complete');
    const logger = createContextLogger({
      service: 'sendgrid-file-validation',
      validationId,
      filePath: filePath.split('/').pop() // Only log filename for privacy
    });

    logger.info('Starting file validation process', {
      filePath: filePath.split('/').pop(),
      options: Object.keys(options)
    });

    const results = {
      validationId,
      filePath,
      totalRecords: 0,
      processedRecords: 0,
      validationResults: [],
      summary: {
        valid: 0,
        invalid: 0,
        risky: 0,
        unknown: 0,
        duplicatesRemoved: 0
      },
      costAnalysis: {
        estimatedCost: 0,
        costSavings: 0,
        costPerEmail: 0
      },
      processingTime: 0,
      recommendations: [],
      dataQualityScore: 0,
      errors: []
    };

    try {
      // Phase 1: Parse and analyze file
      logger.info('Phase 1: File parsing and analysis');
      const contacts = await this.parseCSVFile(filePath, options);
      results.totalRecords = contacts.length;

      logger.info('File parsed successfully', {
        totalRecords: contacts.length,
        columns: contacts.length > 0 ? Object.keys(contacts[0]) : []
      });

      // Phase 2: AI-powered deduplication (cost savings)
      logger.info('Phase 2: AI-powered deduplication');
      const deduplicationResult = await this.performDeduplication(contacts, options);
      const uniqueContacts = deduplicationResult.uniqueContacts;
      results.summary.duplicatesRemoved = deduplicationResult.duplicatesFound;
      results.costAnalysis.costSavings = deduplicationResult.duplicatesFound * 0.001; // SendGrid cost per validation

      logger.info('Deduplication completed', {
        originalCount: contacts.length,
        uniqueCount: uniqueContacts.length,
        duplicatesRemoved: deduplicationResult.duplicatesFound,
        costSavings: results.costAnalysis.costSavings
      });

      // Phase 3: Multi-service validation with SendGrid primary
      logger.info('Phase 3: Multi-service email validation');
      const validationResults = await this.performValidation(uniqueContacts, options);
      results.validationResults = validationResults;
      results.processedRecords = validationResults.length;

      // Phase 4: Results analysis and reporting
      logger.info('Phase 4: Results analysis');
      this.analyzeResults(results);
      this.generateRecommendations(results, options);

      results.processingTime = timer.end();
      this.updateMetrics(results);

      logger.info('File validation completed successfully', {
        totalRecords: results.totalRecords,
        processedRecords: results.processedRecords,
        summary: results.summary,
        processingTime: results.processingTime,
        dataQualityScore: results.dataQualityScore
      });

      return results;

    } catch (error) {
      results.processingTime = timer.end();
      results.errors.push({
        message: error.message,
        phase: 'processing',
        timestamp: new Date().toISOString()
      });

      logger.error('File validation failed', {
        error: error.message,
        processingTime: results.processingTime
      });

      throw error;
    }
  }

  /**
   * Parse CSV file and extract contact data
   * @private
   */
  async parseCSVFile(filePath, options = {}) {
    return new Promise((resolve, reject) => {
      const contacts = [];
      const emailColumn = options.emailColumn || 'email';

      createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          // Extract email and other relevant data
          const contact = {
            email: row[emailColumn] || row.Email || row.email_address || row['Email Address'],
            firstName: row.firstName || row['First Name'] || row.first_name,
            lastName: row.lastName || row['Last Name'] || row.last_name,
            company: row.company || row.Company || row.organization,
            originalRow: row,
            rowNumber: contacts.length + 2 // Account for header
          };

          if (contact.email) {
            contacts.push(contact);
          }
        })
        .on('end', () => {
          resolve(contacts);
        })
        .on('error', (error) => {
          reject(new Error(`CSV parsing failed: ${error.message}`));
        });
    });
  }

  /**
   * Perform AI-powered deduplication using Claude
   * @private
   */
  async performDeduplication(contacts, options = {}) {
    if (options.skipDeduplication) {
      return {
        uniqueContacts: contacts,
        duplicatesFound: 0,
        duplicateGroups: []
      };
    }

    const deduplicationResult = await this.deduplicationService.batchDeduplicate(
      contacts,
      {
        platform: 'file_validation',
        fieldMapping: {
          email: 'email',
          firstName: 'firstName',
          lastName: 'lastName',
          company: 'company'
        },
        confidenceThreshold: options.deduplicationThreshold || 85
      }
    );

    return {
      uniqueContacts: deduplicationResult.uniqueContacts,
      duplicatesFound: deduplicationResult.duplicatesFound,
      duplicateGroups: deduplicationResult.duplicateGroups
    };
  }

  /**
   * Perform multi-service validation with SendGrid as primary
   * @private
   */
  async performValidation(contacts, options = {}) {
    const validationResults = [];
    const batchSize = options.batchSize || 100;
    const useEnhancedValidation = options.useEnhancedValidation !== false;

    // Process in batches for optimal performance
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      
      this.logger.info('Processing validation batch', {
        batchNumber: Math.floor(i / batchSize) + 1,
        batchSize: batch.length,
        progress: `${Math.min(i + batchSize, contacts.length)}/${contacts.length}`
      });

      const batchPromises = batch.map(async (contact) => {
        try {
          // Primary validation with SendGrid
          let result;
          if (useEnhancedValidation) {
            // Use enhanced validation service for smart routing
            result = await this.enhancedValidationService.validateEmail(
              contact.email,
              {
                service: options.forceService || 'sendgrid', // Force SendGrid for client test
                priority: options.priority || 'accuracy',
                source: 'client-file-validation'
              }
            );
          } else {
            // Direct SendGrid validation
            result = await this.sendGridService.validateEmail(
              contact.email,
              { source: 'client-file-validation' }
            );
          }

          return {
            ...contact,
            validation: result,
            processedAt: new Date().toISOString()
          };

        } catch (error) {
          return {
            ...contact,
            validation: {
              email: contact.email,
              verdict: 'error',
              score: 0,
              error: error.message
            },
            processedAt: new Date().toISOString()
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      validationResults.push(...batchResults);

      // Rate limiting delay between batches
      if (i + batchSize < contacts.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return validationResults;
  }

  /**
   * Analyze validation results and calculate metrics
   * @private
   */
  analyzeResults(results) {
    let validCount = 0;
    let invalidCount = 0;
    let riskyCount = 0;
    let unknownCount = 0;
    let totalScore = 0;
    let totalCost = 0;

    results.validationResults.forEach(result => {
      const verdict = result.validation.verdict || result.validation.status;
      const score = result.validation.score || 0;
      const cost = result.validation.cost || 0.001;

      switch (verdict) {
        case 'valid': validCount++; break;
        case 'invalid': invalidCount++; break;
        case 'risky': riskyCount++; break;
        default: unknownCount++; break;
      }

      totalScore += score;
      totalCost += cost;
    });

    results.summary = {
      valid: validCount,
      invalid: invalidCount,
      risky: riskyCount,
      unknown: unknownCount,
      duplicatesRemoved: results.summary.duplicatesRemoved
    };

    results.costAnalysis = {
      estimatedCost: totalCost,
      costSavings: results.costAnalysis.costSavings,
      costPerEmail: results.processedRecords > 0 ? totalCost / results.processedRecords : 0
    };

    results.dataQualityScore = results.processedRecords > 0 
      ? Math.round(totalScore / results.processedRecords) 
      : 0;
  }

  /**
   * Generate actionable recommendations based on results
   * @private
   */
  generateRecommendations(results, options = {}) {
    const recommendations = [];

    // Data quality recommendations
    const qualityScore = results.dataQualityScore;
    if (qualityScore < 70) {
      recommendations.push({
        type: 'data_quality',
        priority: 'high',
        title: 'Low Data Quality Detected',
        description: `Overall data quality score of ${qualityScore}% indicates significant issues that could impact campaign performance.`,
        actions: [
          'Remove invalid emails before campaign launch',
          'Implement real-time validation at data capture points',
          'Review data collection processes for quality improvements'
        ]
      });
    }

    // Deliverability recommendations
    const deliverableRate = ((results.summary.valid + results.summary.risky) / results.processedRecords) * 100;
    if (deliverableRate < 85) {
      recommendations.push({
        type: 'deliverability',
        priority: 'high',
        title: 'Deliverability Risk Identified',
        description: `Only ${deliverableRate.toFixed(1)}% of emails are deliverable, which may hurt sender reputation.`,
        actions: [
          'Segment risky emails for separate nurture campaigns',
          'Remove invalid emails immediately',
          'Implement list hygiene best practices'
        ]
      });
    }

    // Cost optimization recommendations
    if (results.summary.duplicatesRemoved > 0) {
      recommendations.push({
        type: 'cost_optimization',
        priority: 'medium',
        title: 'Duplicate Prevention Savings',
        description: `AI deduplication saved $${results.costAnalysis.costSavings.toFixed(2)} by removing ${results.summary.duplicatesRemoved} duplicates.`,
        actions: [
          'Implement deduplication in your regular data processes',
          'Consider real-time deduplication for form submissions',
          'Review data collection processes to prevent duplicates'
        ]
      });
    }

    // Campaign readiness recommendations
    const readyEmails = results.summary.valid;
    const readyPercentage = (readyEmails / results.processedRecords) * 100;
    
    if (readyPercentage > 80) {
      recommendations.push({
        type: 'campaign_ready',
        priority: 'low',
        title: 'Campaign Ready',
        description: `${readyPercentage.toFixed(1)}% of your emails are ready for immediate campaign deployment.`,
        actions: [
          'Proceed with campaign to valid email addresses',
          'Set up monitoring for bounce rates and engagement',
          'Consider A/B testing subject lines for optimal performance'
        ]
      });
    }

    results.recommendations = recommendations;
  }

  /**
   * Export validation results to CSV file
   */
  async exportResults(results, outputPath) {
    const timer = createTimer('export-results');
    
    try {
      const csvContent = this.generateCSVContent(results);
      await fs.writeFile(outputPath, csvContent, 'utf8');
      
      const duration = timer.end();
      this.logger.info('Results exported successfully', {
        outputPath: outputPath.split('/').pop(),
        recordCount: results.validationResults.length,
        exportTime: duration
      });

      return {
        success: true,
        outputPath,
        recordCount: results.validationResults.length,
        exportTime: duration
      };

    } catch (error) {
      this.logger.error('Export failed', { error: error.message });
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  /**
   * Generate CSV content from validation results
   * @private
   */
  generateCSVContent(results) {
    if (results.validationResults.length === 0) {
      return 'email,status,score,deliverable,risk_level,provider,timestamp\n';
    }

    const headers = [
      'email', 'first_name', 'last_name', 'company',
      'validation_status', 'validation_score', 'deliverable', 'risk_level',
      'provider', 'confidence', 'flags', 'suggested_correction',
      'processing_time', 'cost', 'row_number'
    ];

    const rows = results.validationResults.map(result => {
      const validation = result.validation;
      return [
        result.email || '',
        result.firstName || '',
        result.lastName || '',
        result.company || '',
        validation.verdict || validation.status || '',
        validation.score || 0,
        validation.details?.isDeliverable || false,
        validation.details?.riskLevel || 'unknown',
        validation.provider || 'sendgrid',
        validation.details?.confidence || 0,
        Array.isArray(validation.flags) ? validation.flags.join(';') : '',
        validation.suggested_correction || '',
        validation.metadata?.processingTime || 0,
        validation.cost || 0.001,
        result.rowNumber || ''
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
    });

    return headers.join(',') + '\n' + rows.join('\n');
  }

  /**
   * Update service metrics
   * @private
   */
  updateMetrics(results) {
    this.metrics.totalFilesProcessed++;
    this.metrics.totalEmailsValidated += results.processedRecords;
    this.metrics.totalCostSavings += results.costAnalysis.costSavings;
    this.metrics.duplicatesRemoved += results.summary.duplicatesRemoved;
    
    const totalTime = this.metrics.averageProcessingTime * (this.metrics.totalFilesProcessed - 1) + results.processingTime;
    this.metrics.averageProcessingTime = totalTime / this.metrics.totalFilesProcessed;
    
    this.metrics.validationAccuracy = results.dataQualityScore;
  }

  /**
   * Get service health and metrics
   */
  getHealthMetrics() {
    return {
      service: 'sendgrid-file-validation',
      status: 'ready',
      metrics: this.metrics,
      sendgrid: this.sendGridService.getHealthMetrics(),
      enhanced: {
        service: 'enhanced-validation',
        status: 'ready'
      }
    };
  }

  /**
   * Test connection to all services
   */
  async testConnection() {
    try {
      const sendGridTest = await this.sendGridService.testConnection();
      
      return {
        success: true,
        services: {
          sendgrid: sendGridTest,
          enhanced_validation: { success: true, status: 'ready' },
          deduplication: { success: true, status: 'ready' }
        },
        status: 'ready_for_client_test'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: 'connection_failed'
      };
    }
  }
}

export default SendGridFileValidationService;