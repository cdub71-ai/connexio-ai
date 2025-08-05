import { v4 as uuidv4 } from 'uuid';
import { createContextLogger, createTimer } from '../utils/logger.js';
import DataEnrichmentService from '../services/data-enrichment.js';
import ListHygieneService from '../services/list-hygiene-service.js';
import RealtimeDataSynchronizer from '../services/realtime-data-sync.js';
import ErrorRecoveryService from '../services/error-recovery-service.js';

/**
 * Comprehensive Data Enrichment Pipeline Worker
 * Orchestrates the complete data enrichment workflow with error handling and real-time sync
 */
class DataEnrichmentPipelineWorker {
  constructor() {
    this.logger = createContextLogger({ service: 'data-enrichment-pipeline' });
    
    // Initialize all services
    this.enrichmentService = new DataEnrichmentService();
    this.hygieneService = new ListHygieneService();
    this.syncService = new RealtimeDataSynchronizer();
    this.errorRecoveryService = new ErrorRecoveryService();
    
    // Pipeline configuration
    this.pipelineConfig = {
      stages: [
        'validation',
        'enrichment', 
        'hygiene',
        'quality_scoring',
        'synchronization',
      ],
      errorHandling: {
        retryStrategies: ['retry', 'fallback', 'gracefulDegradation'],
        circuitBreakerEnabled: true,
        fallbackData: true,
      },
    };
    
    // Performance metrics
    this.metrics = {
      totalPipelines: 0,
      successfulPipelines: 0,
      failedPipelines: 0,
      averageProcessingTime: 0,
      stageMetrics: {},
      dataQualityImprovements: [],
    };

    this.logger.info('Data enrichment pipeline worker initialized', {
      stages: this.pipelineConfig.stages,
      services: ['enrichment', 'hygiene', 'sync', 'errorRecovery'],
    });
  }

  /**
   * Process data enrichment request
   * @param {Object} enrichmentSpec - Enrichment specification
   * @returns {Promise<Object>} Processing result
   */
  async processEnrichmentRequest(enrichmentSpec) {
    const pipelineId = uuidv4();
    const timer = createTimer('enrichment-pipeline');
    const logger = createContextLogger({
      service: 'data-enrichment-pipeline',
      pipelineId,
      method: 'processEnrichmentRequest',
    });

    logger.info('Starting data enrichment pipeline', {
      dataType: enrichmentSpec.dataType || 'person',
      recordCount: enrichmentSpec.data?.length || 0,
      strategy: enrichmentSpec.strategy || 'comprehensive',
      enableSync: enrichmentSpec.enableSync || false,
    });

    const pipelineResult = {
      pipelineId,
      success: false,
      stages: {},
      originalData: enrichmentSpec.data,
      processedData: [],
      qualityImprovement: {},
      errors: [],
      warnings: [],
      metrics: {
        totalRecords: enrichmentSpec.data?.length || 0,
        processedRecords: 0,
        errorRecords: 0,
        processingTime: 0,
      },
    };

    try {
      // Execute pipeline stages with error handling
      await this.executePipelineWithErrorHandling(enrichmentSpec, pipelineResult, logger);
      
      const duration = timer.end();
      pipelineResult.metrics.processingTime = duration;
      pipelineResult.success = true;

      this._updateMetrics(pipelineResult, duration);

      logger.info('Data enrichment pipeline completed successfully', {
        pipelineId,
        originalCount: pipelineResult.metrics.totalRecords,
        processedCount: pipelineResult.metrics.processedRecords,
        errorCount: pipelineResult.metrics.errorRecords,
        duration,
      });

      return pipelineResult;

    } catch (error) {
      const duration = timer.end();
      pipelineResult.metrics.processingTime = duration;
      pipelineResult.success = false;
      pipelineResult.error = error.message;

      this.metrics.failedPipelines++;

      logger.error('Data enrichment pipeline failed', {
        pipelineId,
        error: error.message,
        duration,
      });

      return pipelineResult;
    }
  }

  /**
   * Execute pipeline stages with comprehensive error handling
   * @private
   */
  async executePipelineWithErrorHandling(enrichmentSpec, pipelineResult, logger) {
    let currentData = [...(enrichmentSpec.data || [])];
    
    for (const stage of this.pipelineConfig.stages) {
      const stageTimer = createTimer(`stage-${stage}`);
      
      logger.info('Executing pipeline stage', { 
        stage, 
        recordCount: currentData.length 
      });

      try {
        // Execute stage with error recovery
        const stageResult = await this.errorRecoveryService.executeWithErrorHandling(
          () => this.executeStage(stage, currentData, enrichmentSpec, logger),
          {
            serviceName: `pipeline-${stage}`,
            strategies: this.pipelineConfig.errorHandling.retryStrategies,
            fallbackOperation: () => this.getStagefallback(stage, currentData, enrichmentSpec),
            minimalResponse: this.getStageMinimalResponse(stage, currentData),
          }
        );

        const stageDuration = stageTimer.end();

        if (stageResult.success) {
          // Update current data with stage result
          if (stageResult.result && stageResult.result.processedData) {
            currentData = stageResult.result.processedData;
          }

          // Record stage metrics
          pipelineResult.stages[stage] = {
            success: true,
            duration: stageDuration,
            inputRecords: stageResult.result?.inputRecords || currentData.length,
            outputRecords: stageResult.result?.outputRecords || currentData.length,
            metrics: stageResult.result?.stageMetrics || {},
            recoveryUsed: stageResult.recoveryUsed || false,
          };

          if (stageResult.result?.warnings) {
            pipelineResult.warnings.push(...stageResult.result.warnings);
          }

        } else {
          // Stage failed, record error but continue if possible
          pipelineResult.stages[stage] = {
            success: false,
            duration: stageDuration,
            error: stageResult.error,
            recoveryAttempted: stageResult.recoveryAttempted || false,
          };

          pipelineResult.errors.push({
            stage,
            error: stageResult.error,
            recoveryAttempted: stageResult.recoveryAttempted,
          });

          // Decide whether to continue or abort
          if (this.isCriticalStage(stage)) {
            throw new Error(`Critical stage '${stage}' failed: ${stageResult.error}`);
          }

          logger.warn('Non-critical stage failed, continuing pipeline', {
            stage,
            error: stageResult.error,
          });
        }

        // Update stage-specific metrics
        this._updateStageMetrics(stage, stageResult.success, stageDuration);

      } catch (stageError) {
        const stageDuration = stageTimer.end();
        
        pipelineResult.stages[stage] = {
          success: false,
          duration: stageDuration,
          error: stageError.message,
        };

        if (this.isCriticalStage(stage)) {
          throw stageError;
        }

        logger.warn('Stage execution failed', {
          stage,
          error: stageError.message,
        });
      }
    }

    // Set final processed data
    pipelineResult.processedData = currentData;
    pipelineResult.metrics.processedRecords = currentData.length;
    pipelineResult.metrics.errorRecords = 
      pipelineResult.metrics.totalRecords - pipelineResult.metrics.processedRecords;
    
    // Calculate quality improvement
    pipelineResult.qualityImprovement = this._calculatePipelineQualityImprovement(
      pipelineResult.originalData,
      pipelineResult.processedData,
      pipelineResult.stages
    );
  }

  /**
   * Execute individual pipeline stage
   * @private
   */
  async executeStage(stage, data, enrichmentSpec, logger) {
    const stageLogger = createContextLogger({
      service: 'data-enrichment-pipeline',
      stage,
      method: 'executeStage',
    });

    switch (stage) {
      case 'validation':
        return await this.executeValidationStage(data, enrichmentSpec, stageLogger);
        
      case 'enrichment':
        return await this.executeEnrichmentStage(data, enrichmentSpec, stageLogger);
        
      case 'hygiene':
        return await this.executeHygieneStage(data, enrichmentSpec, stageLogger);
        
      case 'quality_scoring':
        return await this.executeQualityScoringStage(data, enrichmentSpec, stageLogger);
        
      case 'synchronization':
        return await this.executeSynchronizationStage(data, enrichmentSpec, stageLogger);
        
      default:
        throw new Error(`Unknown pipeline stage: ${stage}`);
    }
  }

  /**
   * Execute validation stage
   * @private
   */
  async executeValidationStage(data, enrichmentSpec, logger) {
    logger.info('Executing validation stage', { recordCount: data.length });

    const validatedData = [];
    const invalidData = [];
    const warnings = [];

    // Basic data validation
    for (const record of data) {
      try {
        // Validate required fields based on data type
        const dataType = enrichmentSpec.dataType || 'person';
        const validationResult = await this.validateRecord(record, dataType);

        if (validationResult.isValid) {
          validatedData.push({
            ...record,
            _validationScore: validationResult.score,
          });
        } else {
          invalidData.push({
            ...record,
            _validationErrors: validationResult.errors,
          });
        }

        if (validationResult.warnings) {
          warnings.push(...validationResult.warnings);
        }

      } catch (error) {
        logger.warn('Record validation failed', { 
          record: this._sanitizeRecordForLogging(record),
          error: error.message,
        });
        
        invalidData.push({
          ...record,
          _validationError: error.message,
        });
      }
    }

    logger.info('Validation stage completed', {
      validRecords: validatedData.length,
      invalidRecords: invalidData.length,
      warningCount: warnings.length,
    });

    return {
      success: true,
      processedData: validatedData,
      inputRecords: data.length,
      outputRecords: validatedData.length,
      stageMetrics: {
        validRecords: validatedData.length,
        invalidRecords: invalidData.length,
        validationRate: Math.round((validatedData.length / data.length) * 100),
      },
      invalidData,
      warnings,
    };
  }

  /**
   * Execute enrichment stage
   * @private
   */
  async executeEnrichmentStage(data, enrichmentSpec, logger) {
    logger.info('Executing enrichment stage', { recordCount: data.length });

    const enrichmentOptions = {
      strategy: enrichmentSpec.enrichmentStrategy || 'comprehensive',
      batchSize: enrichmentSpec.batchSize || 50,
      includePersonalEmails: enrichmentSpec.includePersonalEmails || false,
      includePhoneNumbers: enrichmentSpec.includePhoneNumbers || false,
    };

    const enrichedData = [];
    const failedEnrichments = [];
    let totalCreditsUsed = 0;

    // Process records in batches
    const batchSize = enrichmentOptions.batchSize;
    const batches = this._createBatches(data, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      logger.info('Processing enrichment batch', {
        batchNumber: i + 1,
        totalBatches: batches.length,
        batchSize: batch.length,
      });

      const batchPromises = batch.map(record => 
        this.enrichSingleRecord(record, enrichmentSpec, enrichmentOptions, logger)
      );

      const batchResults = await Promise.allSettled(batchPromises);

      // Process batch results
      batchResults.forEach((result, index) => {
        const originalRecord = batch[index];
        
        if (result.status === 'fulfilled' && result.value.success) {
          enrichedData.push(result.value.data);
          totalCreditsUsed += result.value.creditsUsed || 0;
        } else {
          failedEnrichments.push({
            ...originalRecord,
            _enrichmentError: result.reason?.message || result.value?.error || 'Unknown error',
          });
        }
      });

      // Add delay between batches to respect rate limits
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info('Enrichment stage completed', {
      enrichedRecords: enrichedData.length,
      failedRecords: failedEnrichments.length,
      creditsUsed: totalCreditsUsed,
    });

    return {
      success: true,
      processedData: enrichedData,
      inputRecords: data.length,
      outputRecords: enrichedData.length,
      stageMetrics: {
        enrichedRecords: enrichedData.length,
        failedEnrichments: failedEnrichments.length,
        enrichmentRate: Math.round((enrichedData.length / data.length) * 100),
        creditsUsed: totalCreditsUsed,
      },
      failedEnrichments,
    };
  }

  /**
   * Execute hygiene stage
   * @private
   */
  async executeHygieneStage(data, enrichmentSpec, logger) {
    logger.info('Executing hygiene stage', { recordCount: data.length });

    const hygieneOptions = {
      checks: enrichmentSpec.hygieneChecks || ['duplicates', 'validation', 'compliance', 'suppression'],
      qualityThreshold: enrichmentSpec.qualityThreshold || 60,
      strictValidation: enrichmentSpec.strictHygiene || false,
      regulations: enrichmentSpec.regulations || ['gdpr', 'canSpam', 'casl'],
    };

    const hygieneResult = await this.hygieneService.performListHygiene(data, hygieneOptions);

    if (!hygieneResult.success) {
      throw new Error(`Hygiene stage failed: ${hygieneResult.error}`);
    }

    logger.info('Hygiene stage completed', {
      originalCount: hygieneResult.original.count,
      cleanCount: hygieneResult.processed.count,
      removedCount: hygieneResult.removed.count,
      qualityImprovement: hygieneResult.qualityImprovement,
    });

    return {
      success: true,
      processedData: hygieneResult.processed.contacts,
      inputRecords: data.length,
      outputRecords: hygieneResult.processed.count,
      stageMetrics: {
        originalCount: hygieneResult.original.count,
        cleanCount: hygieneResult.processed.count,
        removedCount: hygieneResult.removed.count,
        duplicatesRemoved: hygieneResult.summary.duplicatesRemoved,
        invalidRecords: hygieneResult.summary.invalidRecords,
        suppressedRecords: hygieneResult.summary.suppressedRecords,
        complianceViolations: hygieneResult.summary.complianceViolations,
        qualityImprovement: hygieneResult.qualityImprovement,
      },
      removedData: hygieneResult.removed.contacts,
      compliance: hygieneResult.compliance,
    };
  }

  /**
   * Execute quality scoring stage
   * @private
   */
  async executeQualityScoringStage(data, enrichmentSpec, logger) {
    logger.info('Executing quality scoring stage', { recordCount: data.length });

    const scoredData = [];
    const qualityDistribution = { high: 0, medium: 0, low: 0 };
    let totalQualityScore = 0;

    for (const record of data) {
      try {
        // Calculate comprehensive quality score
        const qualityScore = this._calculateRecordQualityScore(record, enrichmentSpec.dataType);
        
        const scoredRecord = {
          ...record,
          _qualityScore: qualityScore,
          _qualityTier: this._getQualityTier(qualityScore),
        };

        scoredData.push(scoredRecord);
        totalQualityScore += qualityScore;

        // Update distribution
        if (qualityScore >= 80) qualityDistribution.high++;
        else if (qualityScore >= 60) qualityDistribution.medium++;
        else qualityDistribution.low++;

      } catch (error) {
        logger.warn('Quality scoring failed for record', {
          record: this._sanitizeRecordForLogging(record),
          error: error.message,
        });

        // Assign default score
        scoredData.push({
          ...record,
          _qualityScore: 50,
          _qualityTier: 'medium',
          _scoringError: error.message,
        });
      }
    }

    const averageQualityScore = data.length > 0 ? Math.round(totalQualityScore / data.length) : 0;

    logger.info('Quality scoring stage completed', {
      recordCount: scoredData.length,
      averageQualityScore,
      qualityDistribution,
    });

    return {
      success: true,
      processedData: scoredData,
      inputRecords: data.length,
      outputRecords: scoredData.length,
      stageMetrics: {
        averageQualityScore,
        qualityDistribution,
        highQualityRecords: qualityDistribution.high,
        mediumQualityRecords: qualityDistribution.medium,
        lowQualityRecords: qualityDistribution.low,
      },
    };
  }

  /**
   * Execute synchronization stage
   * @private
   */
  async executeSynchronizationStage(data, enrichmentSpec, logger) {
    logger.info('Executing synchronization stage', { recordCount: data.length });

    if (!enrichmentSpec.enableSync || !enrichmentSpec.syncConfig) {
      logger.info('Synchronization disabled, skipping stage');
      return {
        success: true,
        processedData: data,
        inputRecords: data.length,
        outputRecords: data.length,
        stageMetrics: {
          syncEnabled: false,
        },
      };
    }

    // Create sync session
    const syncSpec = {
      sources: [{ type: 'enrichment_pipeline', data }],
      target: enrichmentSpec.syncConfig.target,
      strategy: enrichmentSpec.syncConfig.strategy || 'incremental',
      enableEnrichment: false, // Already enriched
      enableHygiene: false, // Already cleaned
    };

    const sessionResult = await this.syncService.createSyncSession(syncSpec);
    
    if (!sessionResult.success) {
      throw new Error(`Failed to create sync session: ${sessionResult.error}`);
    }

    // Start synchronization
    const syncResult = await this.syncService.startSync(sessionResult.sessionId);

    if (!syncResult.success) {
      throw new Error(`Synchronization failed: ${syncResult.error}`);
    }

    logger.info('Synchronization stage completed', {
      sessionId: sessionResult.sessionId,
      recordsSynced: syncResult.result?.recordsSynced || 0,
      syncStrategy: syncSpec.strategy,
    });

    return {
      success: true,
      processedData: data,
      inputRecords: data.length,
      outputRecords: data.length,
      stageMetrics: {
        syncEnabled: true,
        sessionId: sessionResult.sessionId,
        recordsSynced: syncResult.result?.recordsSynced || 0,
        syncStrategy: syncSpec.strategy,
        syncDuration: syncResult.duration,
      },
      syncResult,
    };
  }

  /**
   * Helper methods
   * @private
   */
  async validateRecord(record, dataType) {
    // Basic validation logic
    const errors = [];
    let score = 100;

    if (dataType === 'person') {
      if (!record.email) {
        errors.push('Email is required');
        score -= 30;
      } else if (!this._isValidEmail(record.email)) {
        errors.push('Invalid email format');
        score -= 20;
      }

      if (!record.firstName && !record.lastName) {
        errors.push('At least first name or last name is required');
        score -= 15;
      }
    }

    if (dataType === 'company') {
      if (!record.name) {
        errors.push('Company name is required');
        score -= 40;
      }

      if (!record.domain && !record.website) {
        errors.push('Domain or website is required');
        score -= 20;
      }
    }

    return {
      isValid: errors.length === 0,
      score: Math.max(0, score),
      errors,
    };
  }

  async enrichSingleRecord(record, enrichmentSpec, options, logger) {
    try {
      const dataType = enrichmentSpec.dataType || 'person';
      
      if (dataType === 'person') {
        return await this.enrichmentService.enrichContact(record, options);
      } else if (dataType === 'company') {
        return await this.enrichmentService.enrichCompany(record, options);
      } else {
        throw new Error(`Unsupported data type: ${dataType}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: record,
      };
    }
  }

  _calculateRecordQualityScore(record, dataType = 'person') {
    let score = 0;
    const maxScore = 100;

    if (dataType === 'person') {
      // Email (30 points)
      if (record.email) {
        score += 25;
        if (this._isValidEmail(record.email)) score += 5;
      }

      // Name (20 points)
      if (record.firstName) score += 10;
      if (record.lastName) score += 10;

      // Contact info (20 points)
      if (record.phone || record.phoneNumbers) score += 10;
      if (record.linkedinUrl) score += 10;

      // Professional info (20 points)
      if (record.company || record.companyName) score += 10;
      if (record.title) score += 10;

      // Location (10 points)
      if (record.city) score += 5;
      if (record.country) score += 5;
    }

    // Apply enrichment bonus if available
    if (record._enrichmentSource) score += 5;
    if (record._validationScore) score = Math.max(score, record._validationScore);

    return Math.min(maxScore, Math.max(0, score));
  }

  _getQualityTier(score) {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  _isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  _sanitizeRecordForLogging(record) {
    return {
      email: record.email ? this._maskEmail(record.email) : null,
      firstName: record.firstName,
      lastName: record.lastName,
      company: record.company || record.companyName,
    };
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

  isCriticalStage(stage) {
    const criticalStages = ['validation'];
    return criticalStages.includes(stage);
  }

  getStageFailback(stage, data, enrichmentSpec) {
    // Return fallback operation for each stage
    switch (stage) {
      case 'enrichment':
        return async () => ({
          processedData: data, // Return original data
          stageMetrics: { fallbackUsed: true },
        });
        
      case 'hygiene':
        return async () => ({
          processedData: data.slice(0, Math.min(data.length, 1000)), // Limit data size
          stageMetrics: { fallbackUsed: true, limitedData: true },
        });
        
      default:
        return async () => ({
          processedData: data,
          stageMetrics: { fallbackUsed: true },
        });
    }
  }

  getStageMinimalResponse(stage, data) {
    return {
      processedData: data,
      stageMetrics: { minimalResponse: true },
    };
  }

  _calculatePipelineQualityImprovement(originalData, processedData, stages) {
    const originalCount = originalData?.length || 0;
    const processedCount = processedData?.length || 0;
    
    if (originalCount === 0) {
      return { improvement: 0, reason: 'No original data' };
    }

    const dataRetentionRate = Math.round((processedCount / originalCount) * 100);
    
    // Calculate quality improvements from stages
    const improvements = {};
    
    if (stages.enrichment?.stageMetrics?.enrichmentRate) {
      improvements.enrichment = stages.enrichment.stageMetrics.enrichmentRate;
    }
    
    if (stages.hygiene?.stageMetrics?.qualityImprovement) {
      improvements.hygiene = stages.hygiene.stageMetrics.qualityImprovement;
    }
    
    if (stages.quality_scoring?.stageMetrics?.averageQualityScore) {
      improvements.qualityScoring = stages.quality_scoring.stageMetrics.averageQualityScore;
    }

    return {
      dataRetentionRate,
      improvements,
      overallImprovement: Math.round(
        Object.values(improvements).reduce((sum, val) => sum + (val || 0), 0) / 
        Math.max(1, Object.keys(improvements).length)
      ),
    };
  }

  _updateMetrics(pipelineResult, duration) {
    this.metrics.totalPipelines++;
    
    if (pipelineResult.success) {
      this.metrics.successfulPipelines++;
    } else {
      this.metrics.failedPipelines++;
    }

    // Update average processing time
    const totalTime = this.metrics.averageProcessingTime * (this.metrics.totalPipelines - 1) + duration;
    this.metrics.averageProcessingTime = Math.round(totalTime / this.metrics.totalPipelines);

    // Track quality improvements
    if (pipelineResult.qualityImprovement) {
      this.metrics.dataQualityImprovements.push({
        pipelineId: pipelineResult.pipelineId,
        improvement: pipelineResult.qualityImprovement,
        timestamp: new Date().toISOString(),
      });

      // Keep only recent improvements
      if (this.metrics.dataQualityImprovements.length > 100) {
        this.metrics.dataQualityImprovements.shift();
      }
    }
  }

  _updateStageMetrics(stage, success, duration) {
    if (!this.metrics.stageMetrics[stage]) {
      this.metrics.stageMetrics[stage] = {
        total: 0,
        success: 0,
        failed: 0,
        averageDuration: 0,
      };
    }

    const stageMetrics = this.metrics.stageMetrics[stage];
    stageMetrics.total++;
    
    if (success) {
      stageMetrics.success++;
    } else {
      stageMetrics.failed++;
    }

    // Update average duration
    const totalTime = stageMetrics.averageDuration * (stageMetrics.total - 1) + duration;
    stageMetrics.averageDuration = Math.round(totalTime / stageMetrics.total);
  }

  /**
   * Get pipeline health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      pipelineConfig: this.pipelineConfig,
      services: {
        enrichment: this.enrichmentService.getHealthStatus(),
        hygiene: this.hygieneService.getHealthStatus(),
        sync: this.syncService.getHealthStatus(),
        errorRecovery: this.errorRecoveryService.getHealthStatus(),
      },
    };
  }

  /**
   * Shutdown pipeline worker gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down data enrichment pipeline worker');

    try {
      await Promise.all([
        this.enrichmentService.shutdown(),
        this.hygieneService.shutdown(),
        this.syncService.shutdown(),
        this.errorRecoveryService.shutdown(),
      ]);

      this.logger.info('Data enrichment pipeline worker shutdown complete', {
        totalPipelines: this.metrics.totalPipelines,
        successRate: this.metrics.totalPipelines > 0 
          ? Math.round((this.metrics.successfulPipelines / this.metrics.totalPipelines) * 100)
          : 0,
        averageProcessingTime: this.metrics.averageProcessingTime,
      });

    } catch (error) {
      this.logger.error('Error during pipeline worker shutdown', { error: error.message });
    }
  }
}

export default DataEnrichmentPipelineWorker;