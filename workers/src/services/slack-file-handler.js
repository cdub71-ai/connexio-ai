/**
 * Slack File Handler - Production Implementation
 * Handles secure file uploads from Slack with validation and processing
 */

const fetch = require('node-fetch');
const { createContextLogger } = require('../utils/logger.js');
const FileStorageService = require('./file-storage-service.js');

class SlackFileHandler {
  constructor(slackClient, options = {}) {
    this.slack = slackClient;
    this.logger = createContextLogger({ service: 'slack-file-handler' });
    this.fileStorage = new FileStorageService(options.storage || {});
    
    this.config = {
      maxDownloadSize: options.maxDownloadSize || 50 * 1024 * 1024, // 50MB
      downloadTimeout: options.downloadTimeout || 30000, // 30 seconds
      supportedTypes: options.supportedTypes || ['text/csv', 'application/vnd.ms-excel'],
      ...options
    };

    this.logger.info('Slack file handler initialized', {
      maxDownloadSize: this.config.maxDownloadSize,
      supportedTypes: this.config.supportedTypes
    });
  }

  /**
   * Download and process file from Slack
   * @param {Object} fileInfo - Slack file information
   * @param {Object} context - Request context (userId, channelId, etc.)
   * @returns {Promise<Object>} File processing result
   */
  async downloadAndStoreFile(fileInfo, context = {}) {
    const fileId = fileInfo.id;
    const logger = createContextLogger({ 
      service: 'slack-file-handler', 
      fileId,
      userId: context.userId 
    });

    try {
      logger.info('Starting file download from Slack', {
        fileName: fileInfo.name,
        fileSize: fileInfo.size,
        mimeType: fileInfo.mimetype
      });

      // Validate file before downloading
      await this.validateSlackFile(fileInfo);

      // Download file from Slack
      const fileBuffer = await this.downloadFileFromSlack(fileInfo, context);

      // Store file securely
      const storageResult = await this.fileStorage.storeUploadedFile(
        fileBuffer,
        {
          id: fileInfo.id,
          name: fileInfo.name,
          mimetype: fileInfo.mimetype,
          size: fileInfo.size,
          created: fileInfo.created,
          slackUrl: fileInfo.url_private
        },
        {
          userId: context.userId,
          channelId: context.channelId,
          messageTs: context.messageTs,
          source: 'slack-upload'
        }
      );

      logger.info('File downloaded and stored successfully', {
        fileId: storageResult.fileId,
        originalName: fileInfo.name,
        storedSize: storageResult.size
      });

      return {
        success: true,
        fileId: storageResult.fileId,
        originalName: fileInfo.name,
        size: storageResult.size,
        metadata: storageResult.metadata,
        message: `File "${fileInfo.name}" uploaded successfully and ready for processing`
      };

    } catch (error) {
      logger.error('File download and storage failed', { 
        error: error.message,
        fileName: fileInfo.name 
      });

      return {
        success: false,
        error: error.message,
        fileId: null
      };
    }
  }

  /**
   * Download file content from Slack
   * @private
   */
  async downloadFileFromSlack(fileInfo, context) {
    const logger = createContextLogger({ 
      service: 'slack-file-download',
      fileId: fileInfo.id 
    });

    try {
      // Get the bot token for authentication
      const token = this.slack.token;
      
      const response = await fetch(fileInfo.url_private, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Connexio-AI-Bot/1.0'
        },
        timeout: this.config.downloadTimeout
      });

      if (!response.ok) {
        throw new Error(`Slack file download failed: ${response.status} ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.config.maxDownloadSize) {
        throw new Error(`File too large: ${contentLength} bytes (max: ${this.config.maxDownloadSize})`);
      }

      const fileBuffer = await response.buffer();

      // Verify the downloaded size matches expected
      if (fileInfo.size && fileBuffer.length !== fileInfo.size) {
        logger.warn('Downloaded file size mismatch', {
          expected: fileInfo.size,
          actual: fileBuffer.length
        });
      }

      logger.info('File downloaded from Slack successfully', {
        size: fileBuffer.length,
        contentType: response.headers.get('content-type')
      });

      return fileBuffer;

    } catch (error) {
      logger.error('Slack file download failed', { error: error.message });
      throw new Error(`Failed to download file from Slack: ${error.message}`);
    }
  }

  /**
   * Validate Slack file before processing
   * @private
   */
  async validateSlackFile(fileInfo) {
    // Check file size
    if (fileInfo.size > this.config.maxDownloadSize) {
      throw new Error(`File too large: ${fileInfo.size} bytes (max: ${this.config.maxDownloadSize})`);
    }

    // Check MIME type
    if (!this.config.supportedTypes.includes(fileInfo.mimetype)) {
      throw new Error(`Unsupported file type: ${fileInfo.mimetype}. Supported: ${this.config.supportedTypes.join(', ')}`);
    }

    // Check file extension
    const allowedExtensions = ['.csv', '.xls', '.xlsx'];
    const fileExtension = fileInfo.name.toLowerCase().split('.').pop();
    if (!allowedExtensions.includes(`.${fileExtension}`)) {
      throw new Error(`Unsupported file extension: .${fileExtension}. Supported: ${allowedExtensions.join(', ')}`);
    }

    // Additional security checks
    if (fileInfo.name.includes('..') || fileInfo.name.includes('/') || fileInfo.name.includes('\\')) {
      throw new Error('Invalid file name: contains illegal characters');
    }

    return true;
  }

  /**
   * Find recent CSV files in channel
   * @param {string} channelId - Slack channel ID
   * @param {number} limit - Number of recent messages to check
   * @returns {Promise<Array>} Array of file information
   */
  async findRecentCSVFiles(channelId, limit = 10) {
    const logger = createContextLogger({ 
      service: 'slack-file-handler',
      channelId 
    });

    try {
      const result = await this.slack.conversations.history({
        channel: channelId,
        limit: limit,
        inclusive: true
      });

      const csvFiles = [];
      
      for (const message of result.messages) {
        if (message.files && message.files.length > 0) {
          for (const file of message.files) {
            // Check if it's a CSV file
            if (this.isCSVFile(file)) {
              csvFiles.push({
                id: file.id,
                name: file.name,
                size: file.size,
                mimetype: file.mimetype,
                created: file.created,
                url_private: file.url_private,
                messageTs: message.ts,
                userId: message.user
              });
            }
          }
        }
      }

      logger.info('CSV file search completed', {
        messagesChecked: result.messages.length,
        csvFilesFound: csvFiles.length
      });

      return csvFiles.sort((a, b) => b.created - a.created); // Most recent first

    } catch (error) {
      logger.error('Failed to find recent CSV files', { error: error.message });
      throw new Error(`Failed to search for CSV files: ${error.message}`);
    }
  }

  /**
   * Check if file is a CSV file
   * @private
   */
  isCSVFile(file) {
    const csvMimeTypes = ['text/csv', 'application/csv', 'text/comma-separated-values'];
    const csvExtensions = ['csv'];
    
    const hasCSVMimeType = csvMimeTypes.includes(file.mimetype);
    const hasCSVExtension = csvExtensions.includes(file.name.toLowerCase().split('.').pop());
    
    return hasCSVMimeType || hasCSVExtension;
  }

  /**
   * Generate Slack file upload response message
   * @param {Object} uploadResult - File upload result
   * @param {Object} context - Context information
   * @returns {Object} Slack message object
   */
  generateUploadConfirmation(uploadResult, context = {}) {
    if (uploadResult.success) {
      return {
        text: `✅ **File Upload Successful**\n\n📄 **File:** ${uploadResult.originalName}\n📊 **Size:** ${this.formatFileSize(uploadResult.size)}\n🆔 **File ID:** ${uploadResult.fileId}\n\n🚀 **Ready for processing!** Use \`/validate-file start\` to begin validation.\n\n_File is securely stored and encrypted._`,
        response_type: 'ephemeral'
      };
    } else {
      return {
        text: `❌ **File Upload Failed**\n\n**Error:** ${uploadResult.error}\n\n**Supported formats:**\n• CSV files (.csv)\n• Excel files (.xls, .xlsx)\n• Maximum size: ${this.formatFileSize(this.config.maxDownloadSize)}\n\nPlease check your file and try again.`,
        response_type: 'ephemeral'
      };
    }
  }

  /**
   * Generate processing start confirmation
   * @param {Object} fileInfo - File information
   * @param {string} processId - Processing ID
   * @returns {Object} Slack message object
   */
  generateProcessingConfirmation(fileInfo, processId) {
    return {
      text: `🚀 **Processing Started**\n\n📄 **File:** ${fileInfo.originalName}\n📊 **Size:** ${this.formatFileSize(fileInfo.size)}\n🆔 **Process ID:** ${processId}\n\n⏳ **I'm processing your file with:**\n• AI-powered deduplication\n• Enterprise email validation\n• Quality scoring and analysis\n• Campaign optimization recommendations\n\n_Processing time: 2-5 minutes for most files_\n_I'll notify you when complete with download link!_`,
      response_type: 'ephemeral'
    };
  }

  /**
   * Generate processing completion message with download
   * @param {Object} results - Processing results
   * @param {Object} downloadInfo - Download link information
   * @returns {Object} Slack message object
   */
  generateCompletionMessage(results, downloadInfo) {
    const qualityEmoji = results.dataQualityScore >= 80 ? '🟢' : results.dataQualityScore >= 60 ? '🟡' : '🔴';
    
    return {
      text: `✅ **File Processing Complete!**\n\n📄 **Original:** ${results.originalName}\n📊 **Results Summary:**\n• Total records: ${results.totalRecords.toLocaleString()}\n• Processed: ${results.processedRecords.toLocaleString()}\n• Valid emails: ${results.summary.valid.toLocaleString()} (${((results.summary.valid/results.processedRecords)*100).toFixed(1)}%)\n• Invalid emails: ${results.summary.invalid.toLocaleString()}\n• Risky emails: ${results.summary.risky.toLocaleString()}\n• Duplicates removed: ${results.summary.duplicatesRemoved.toLocaleString()}\n\n${qualityEmoji} **Data Quality Score: ${results.dataQualityScore}/100**\n\n💰 **Cost Analysis:**\n• Validation cost: $${results.costAnalysis.estimatedCost.toFixed(3)}\n• Savings from deduplication: $${results.costAnalysis.costSavings.toFixed(3)}\n• Net cost: $${(results.costAnalysis.estimatedCost - results.costAnalysis.costSavings).toFixed(3)}\n\n📥 **Download Results:**\n• **File:** ${downloadInfo.filename}\n• **Link:** ${downloadInfo.downloadUrl}\n• **Valid for:** ${downloadInfo.validFor}\n• **Downloads allowed:** ${downloadInfo.maxDownloads}\n\n🤖 **AI Recommendations:**\n${results.recommendations.slice(0, 3).map(r => `• ${r.title}: ${r.description}`).join('\n')}\n\n⏱️ **Processing time:** ${(results.processingTime / 1000).toFixed(1)} seconds\n\n_Results are ready for immediate campaign use!_`
    };
  }

  /**
   * Format file size for display
   * @private
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Get handler statistics
   * @returns {Promise<Object>} Handler statistics
   */
  async getHandlerStats() {
    const storageStats = await this.fileStorage.getStorageStats();
    
    return {
      config: {
        maxDownloadSize: this.config.maxDownloadSize,
        supportedTypes: this.config.supportedTypes,
        downloadTimeout: this.config.downloadTimeout
      },
      storage: storageStats
    };
  }
}

module.exports = SlackFileHandler;