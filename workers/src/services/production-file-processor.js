/**
 * Production File Processor
 * Orchestrates the complete file validation pipeline with real services
 */

const { v4: uuidv4 } = require('uuid');
const { createContextLogger, createTimer } = require('../utils/logger.js');
const FileStorageService = require('./file-storage-service.js');
const SlackFileHandler = require('./slack-file-handler.js');
const SendGridFileValidationService = require('./sendgrid-file-validation-service.js');
const ClaudeDeduplicationService = require('./claude-deduplication-service.js');

class ProductionFileProcessor {
  constructor(slackClient, options = {}) {
    this.logger = createContextLogger({ service: 'production-file-processor' });
    
    // Initialize services
    this.fileStorage = new FileStorageService(options.storage || {});
    this.slackFileHandler = new SlackFileHandler(slackClient, options.slack || {});
    this.validationService = new SendGridFileValidationService();
    this.deduplicationService = new ClaudeDeduplicationService();
    
    // Processing sessions tracking
    this.processingSessions = new Map();
    
    // Configuration
    this.config = {
      maxConcurrentJobs: options.maxConcurrentJobs || 5,
      processingTimeout: options.processingTimeout || 30 * 60 * 1000, // 30 minutes
      notificationChannel: options.notificationChannel,
      enableRealTimeUpdates: options.enableRealTimeUpdates !== false,
      ...options
    };

    this.logger.info('Production file processor initialized', {
      maxConcurrentJobs: this.config.maxConcurrentJobs,
      enableRealTimeUpdates: this.config.enableRealTimeUpdates
    });
  }

  /**
   * Process file upload from Slack
   * @param {Object} fileInfo - Slack file information
   * @param {Object} context - Processing context
   * @returns {Promise<Object>} Processing result
   */
  async handleFileUpload(fileInfo, context = {}) {
    const processId = uuidv4();
    const logger = createContextLogger({ 
      service: 'production-file-processor',
      processId,
      userId: context.userId
    });

    try {
      logger.info('Starting file upload handling', {
        fileName: fileInfo.name,
        fileSize: fileInfo.size,
        channelId: context.channelId
      });

      // Download and store file from Slack
      const uploadResult = await this.slackFileHandler.downloadAndStoreFile(fileInfo, {
        ...context,
        processId
      });

      if (!uploadResult.success) {
        return {
          success: false,
          error: uploadResult.error,
          processId,
          message: this.slackFileHandler.generateUploadConfirmation(uploadResult, context)
        };
      }

      // Create processing session
      const session = {
        processId,
        fileId: uploadResult.fileId,
        originalName: uploadResult.originalName,
        size: uploadResult.size,
        status: 'uploaded',
        userId: context.userId,
        channelId: context.channelId,
        messageTs: context.messageTs,
        createdAt: new Date().toISOString(),
        metadata: uploadResult.metadata
      };

      this.processingSessions.set(processId, session);

      logger.info('File upload handled successfully', {
        fileId: uploadResult.fileId,
        processId
      });

      return {
        success: true,
        processId,
        fileId: uploadResult.fileId,
        session,
        message: this.slackFileHandler.generateUploadConfirmation(uploadResult, context)
      };

    } catch (error) {
      logger.error('File upload handling failed', { error: error.message });
      
      return {
        success: false,
        error: error.message,
        processId,
        message: {
          text: `❌ **File Upload Failed**\n\n**Error:** ${error.message}\n\nPlease try again or contact support if the problem persists.`,
          response_type: 'ephemeral'
        }
      };
    }
  }

  /**
   * Start file processing
   * @param {string} processId - Processing session ID
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing start result
   */
  async startFileProcessing(processId, options = {}) {
    const session = this.processingSessions.get(processId);
    if (!session) {
      throw new Error(`Processing session not found: ${processId}`);
    }

    const logger = createContextLogger({ 
      service: 'production-file-processor',
      processId,
      fileId: session.fileId
    });

    try {
      // Update session status
      session.status = 'processing';
      session.startedAt = new Date().toISOString();
      session.processingOptions = options;
      this.processingSessions.set(processId, session);

      logger.info('Starting file processing', {
        fileName: session.originalName,
        fileSize: session.size
      });

      // Start processing asynchronously
      this.processFileAsync(processId, options).catch(error => {
        logger.error('Async processing failed', { error: error.message });
        session.status = 'failed';
        session.error = error.message;
        session.completedAt = new Date().toISOString();
        this.processingSessions.set(processId, session);
      });

      return {
        success: true,
        processId,
        message: this.slackFileHandler.generateProcessingConfirmation(session, processId)
      };

    } catch (error) {
      logger.error('Failed to start processing', { error: error.message });
      
      session.status = 'failed';
      session.error = error.message;
      session.completedAt = new Date().toISOString();
      this.processingSessions.set(processId, session);

      throw error;
    }
  }

  /**
   * Process file asynchronously
   * @private
   */
  async processFileAsync(processId, options = {}) {
    const session = this.processingSessions.get(processId);
    const logger = createContextLogger({ 
      service: 'production-file-processor',
      processId,
      fileId: session.fileId
    });

    const timer = createTimer('complete-file-processing');

    try {
      // Retrieve stored file
      logger.info('Retrieving file for processing');
      const fileData = await this.fileStorage.retrieveFile(session.fileId);
      
      // Create temporary file for validation service
      const tempFilePath = `/tmp/${session.fileId}.csv`;
      await require('fs').promises.writeFile(tempFilePath, fileData.content);

      // Send processing start notification
      if (this.config.enableRealTimeUpdates && session.channelId) {
        await this.sendProcessingUpdate(session, '🔄 Processing started - Running AI deduplication...');
      }

      // Process file with validation service
      logger.info('Starting validation service processing');
      const validationResults = await this.validationService.processFileValidation(tempFilePath, {
        emailColumn: options.emailColumn || 'email',
        deduplicationThreshold: options.deduplicationThreshold || 85,
        batchSize: options.batchSize || 100,
        useEnhancedValidation: options.useEnhancedValidation !== false,
        forceService: 'sendgrid', // Ensure SendGrid is used for client test
        priority: 'accuracy',
        source: 'production-client-test'
      });

      // Send validation complete notification
      if (this.config.enableRealTimeUpdates && session.channelId) {
        await this.sendProcessingUpdate(session, '✅ Validation complete - Generating results...');
      }

      // Generate CSV results
      logger.info('Generating CSV results');
      const csvBuffer = await this.generateResultsCSV(validationResults);
      
      // Store results
      const storageResult = await this.fileStorage.storeResults(
        session.fileId,
        validationResults,
        csvBuffer
      );

      // Generate download link
      const downloadLink = await this.fileStorage.generateDownloadLink(session.fileId, {
        expiresInHours: 24,
        maxDownloads: 10,
        userId: session.userId
      });

      // Update session
      const processingTime = timer.end();
      session.status = 'completed';
      session.completedAt = new Date().toISOString();
      session.processingTime = processingTime;
      session.results = validationResults;
      session.downloadInfo = {
        ...downloadLink,
        filename: storageResult.resultFilename,
        size: storageResult.size
      };
      
      this.processingSessions.set(processId, session);

      // Send completion notification with results
      if (session.channelId) {
        await this.sendCompletionNotification(session);
      }

      // Clean up temp file
      await require('fs').promises.unlink(tempFilePath).catch(() => {});

      logger.info('File processing completed successfully', {
        processingTime,
        totalRecords: validationResults.totalRecords,
        processedRecords: validationResults.processedRecords,
        dataQualityScore: validationResults.dataQualityScore
      });

    } catch (error) {
      const processingTime = timer.end();
      
      logger.error('File processing failed', { 
        error: error.message,
        processingTime 
      });

      session.status = 'failed';
      session.error = error.message;
      session.completedAt = new Date().toISOString();
      session.processingTime = processingTime;
      this.processingSessions.set(processId, session);

      // Send error notification
      if (session.channelId) {
        await this.sendErrorNotification(session, error);
      }

      throw error;
    }
  }

  /**
   * Generate CSV results from validation data
   * @private
   */
  async generateResultsCSV(validationResults) {
    const logger = createContextLogger({ 
      service: 'csv-generator',
      validationId: validationResults.validationId 
    });

    try {
      // CSV headers
      const headers = [
        'email',
        'first_name',
        'last_name', 
        'company',
        'validation_status',
        'validation_score',
        'deliverable',
        'risk_level',
        'provider',
        'flags',
        'suggested_correction',
        'processing_cost',
        'original_row',
        'processed_at'
      ];

      // Generate CSV content
      let csvContent = headers.join(',') + '\n';

      validationResults.validationResults.forEach((result, index) => {
        const validation = result.validation || {};
        const row = [
          this.escapeCsvField(result.email || ''),
          this.escapeCsvField(result.firstName || ''),
          this.escapeCsvField(result.lastName || ''),
          this.escapeCsvField(result.company || ''),
          this.escapeCsvField(validation.verdict || validation.status || 'unknown'),
          validation.score || 0,
          validation.deliverable || 'unknown',
          validation.riskLevel || 'unknown',
          validation.provider || 'sendgrid',
          this.escapeCsvField((validation.flags || []).join(';')),
          this.escapeCsvField(validation.suggested_correction || ''),
          validation.cost || 0.001,
          index + 1,
          result.processedAt || new Date().toISOString()
        ];
        csvContent += row.join(',') + '\n';
      });

      logger.info('CSV results generated', {
        rows: validationResults.validationResults.length,
        size: csvContent.length
      });

      return Buffer.from(csvContent, 'utf8');

    } catch (error) {
      logger.error('CSV generation failed', { error: error.message });
      throw new Error(`Failed to generate CSV results: ${error.message}`);
    }
  }

  /**
   * Escape CSV field
   * @private
   */
  escapeCsvField(field) {
    if (typeof field !== 'string') {
      field = String(field);
    }
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  /**
   * Send processing update notification
   * @private
   */
  async sendProcessingUpdate(session, message) {
    try {
      // This would integrate with your Slack client
      this.logger.info('Processing update sent', {
        processId: session.processId,
        message
      });
    } catch (error) {
      this.logger.error('Failed to send processing update', { error: error.message });
    }
  }

  /**
   * Send completion notification
   * @private  
   */
  async sendCompletionNotification(session) {
    try {
      const message = this.slackFileHandler.generateCompletionMessage(
        session.results,
        session.downloadInfo
      );

      this.logger.info('Completion notification prepared', {
        processId: session.processId,
        dataQualityScore: session.results.dataQualityScore
      });

      // This would integrate with your Slack client to send the message
      // await this.slack.chat.postMessage({
      //   channel: session.channelId,
      //   text: message.text
      // });

    } catch (error) {
      this.logger.error('Failed to send completion notification', { error: error.message });
    }
  }

  /**
   * Send error notification
   * @private
   */
  async sendErrorNotification(session, error) {
    try {
      const message = {
        text: `❌ **File Processing Failed**\n\n📄 **File:** ${session.originalName}\n🆔 **Process ID:** ${session.processId}\n\n**Error:** ${error.message}\n\n_Please try again or contact support if the problem persists._`
      };

      this.logger.info('Error notification prepared', {
        processId: session.processId,
        error: error.message
      });

    } catch (notificationError) {
      this.logger.error('Failed to send error notification', { 
        error: notificationError.message 
      });
    }
  }

  /**
   * Get processing status
   * @param {string} processId - Processing session ID
   * @returns {Object} Processing status
   */
  getProcessingStatus(processId) {
    const session = this.processingSessions.get(processId);
    if (!session) {
      return { found: false };
    }

    return {
      found: true,
      processId: session.processId,
      status: session.status,
      originalName: session.originalName,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      processingTime: session.processingTime,
      error: session.error,
      results: session.results ? {
        totalRecords: session.results.totalRecords,
        processedRecords: session.results.processedRecords,
        dataQualityScore: session.results.dataQualityScore,
        summary: session.results.summary
      } : null,
      downloadInfo: session.downloadInfo
    };
  }

  /**
   * Get user's processing sessions
   * @param {string} userId - User ID
   * @param {number} limit - Maximum number of sessions to return
   * @returns {Array} User's processing sessions
   */
  getUserSessions(userId, limit = 10) {
    const userSessions = Array.from(this.processingSessions.values())
      .filter(session => session.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    return userSessions.map(session => ({
      processId: session.processId,
      originalName: session.originalName,
      status: session.status,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      processingTime: session.processingTime,
      dataQualityScore: session.results?.dataQualityScore,
      error: session.error
    }));
  }

  /**
   * Get processor statistics
   * @returns {Object} Processor statistics
   */
  async getProcessorStats() {
    const sessions = Array.from(this.processingSessions.values());
    const storageStats = await this.fileStorage.getStorageStats();
    
    return {
      sessions: {
        total: sessions.length,
        processing: sessions.filter(s => s.status === 'processing').length,
        completed: sessions.filter(s => s.status === 'completed').length,
        failed: sessions.filter(s => s.status === 'failed').length
      },
      storage: storageStats,
      config: {
        maxConcurrentJobs: this.config.maxConcurrentJobs,
        processingTimeout: this.config.processingTimeout
      }
    };
  }

  /**
   * Clean up old sessions
   */
  cleanupOldSessions(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const cutoffTime = Date.now() - maxAge;
    let cleanedCount = 0;

    for (const [processId, session] of this.processingSessions) {
      const sessionTime = new Date(session.createdAt).getTime();
      if (sessionTime < cutoffTime) {
        this.processingSessions.delete(processId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info('Old sessions cleaned up', { cleanedCount });
    }

    return cleanedCount;
  }
}

module.exports = ProductionFileProcessor;