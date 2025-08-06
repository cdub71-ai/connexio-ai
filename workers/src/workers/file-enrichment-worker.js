import { v4 as uuidv4 } from 'uuid';
import { createContextLogger, createTimer } from '../utils/logger.js';
import DataQualityValidator from '../services/data-quality-validator.js';
import FileParsingService from '../services/file-parsing-service.js';
import FileOutputService from '../services/file-output-service.js';

/**
 * File Enrichment Worker - Phase 1
 * Handles file upload, parsing, validation, and formatted output
 * Phase 1: Focus on validation and formatting only (no external enrichment)
 */
class FileEnrichmentWorker {
  constructor() {
    this.logger = createContextLogger({ service: 'file-enrichment-worker' });
    
    // Initialize services
    this.qualityValidator = new DataQualityValidator();
    this.fileParser = new FileParsingService();
    this.fileOutput = new FileOutputService();
    
    // Phase 1 Configuration - Validation only
    this.processingConfig = {
      phase: 1,
      enableEnrichment: false,
      validationOnly: true,
      outputFormat: 'standardized',
      batchSize: 1000,
      maxFileSize: 50 * 1024 * 1024, // 50MB limit
      supportedFormats: ['csv', 'xlsx', 'xls'],
    };
    
    // Standard output columns for Phase 1
    this.standardColumns = [
      'email',
      'email_valid',
      'email_deliverable',
      'email_quality_score',
      'phone',
      'phone_valid',
      'phone_formatted',
      'phone_type',
      'phone_quality_score',
      'first_name',
      'last_name',
      'company',
      'title',
      'city',
      'state',
      'country',
      'validation_status',
      'quality_score',
      'processing_notes'
    ];
    
    // Performance metrics
    this.metrics = {
      totalFilesProcessed: 0,
      totalRecordsProcessed: 0,
      validationErrors: 0,
      processingErrors: 0,
      averageProcessingTime: 0,
      filesBySize: { small: 0, medium: 0, large: 0 },
    };

    this.logger.info('File Enrichment Worker initialized (Phase 1)', {
      phase: this.processingConfig.phase,
      enableEnrichment: this.processingConfig.enableEnrichment,
      supportedFormats: this.processingConfig.supportedFormats,
      standardColumns: this.standardColumns.length,
    });
  }

  /**
   * Process uploaded file through validation and formatting pipeline
   * @param {Object} fileSpec - File processing specification
   * @returns {Promise<Object>} Processing result with download link
   */
  async processFile(fileSpec) {
    const processId = uuidv4();
    const timer = createTimer('file-processing');
    const logger = createContextLogger({
      service: 'file-enrichment-worker',
      processId,
      method: 'processFile',
    });

    logger.info('Starting file processing', {
      fileName: fileSpec.fileName,
      fileSize: fileSpec.fileSize,
      originalFormat: fileSpec.format,
      requestedColumns: fileSpec.columns?.length || 'auto-detect',
    });

    const result = {
      processId,
      success: false,
      originalFile: {
        name: fileSpec.fileName,
        size: fileSpec.fileSize,
        format: fileSpec.format,
      },
      processing: {
        phase: this.processingConfig.phase,
        startTime: new Date().toISOString(),
        steps: [],
      },
      validation: {
        totalRecords: 0,
        validRecords: 0,
        invalidRecords: 0,
        emailValidation: { valid: 0, invalid: 0, questionable: 0 },
        phoneValidation: { valid: 0, invalid: 0, formatted: 0 },
      },
      output: {
        fileName: null,
        downloadUrl: null,
        format: 'csv',
        recordCount: 0,
      },
      errors: [],
      warnings: [],
    };

    try {
      // Step 1: Validate file format and size
      await this.validateFileInput(fileSpec, result, logger);
      
      // Step 2: Parse file and extract data
      const parsedData = await this.parseFileData(fileSpec, result, logger);
      
      // Step 3: Validate and process records
      const processedData = await this.validateAndProcessRecords(parsedData, result, logger);
      
      // Step 4: Generate standardized output file
      const outputFile = await this.generateOutputFile(processedData, fileSpec, result, logger);
      
      // Step 5: Finalize results
      result.output = outputFile;
      result.success = true;
      
      const duration = timer.end();
      result.processing.duration = duration;
      result.processing.endTime = new Date().toISOString();

      this._updateMetrics(result, duration);

      logger.info('File processing completed successfully', {
        processId,
        originalRecords: result.validation.totalRecords,
        validRecords: result.validation.validRecords,
        outputFile: result.output.fileName,
        duration,
      });

      return result;

    } catch (error) {
      const duration = timer.end();
      result.processing.duration = duration;
      result.processing.endTime = new Date().toISOString();
      result.success = false;
      result.error = error.message;

      this.metrics.processingErrors++;

      logger.error('File processing failed', {
        processId,
        error: error.message,
        duration,
      });

      return result;
    }
  }

  /**
   * Validate file input requirements
   * @private
   */
  async validateFileInput(fileSpec, result, logger) {
    logger.info('Validating file input');
    
    const step = {
      name: 'file_validation',
      startTime: new Date().toISOString(),
      success: false,
    };

    try {
      // Check file size
      if (fileSpec.fileSize > this.processingConfig.maxFileSize) {
        throw new Error(`File size ${Math.round(fileSpec.fileSize / 1024 / 1024)}MB exceeds maximum allowed size of ${this.processingConfig.maxFileSize / 1024 / 1024}MB`);
      }

      // Check file format
      const format = fileSpec.format.toLowerCase();
      if (!this.processingConfig.supportedFormats.includes(format)) {
        throw new Error(`Unsupported file format: ${format}. Supported formats: ${this.processingConfig.supportedFormats.join(', ')}`);
      }

      // Check if file exists and is readable
      if (!fileSpec.filePath && !fileSpec.fileBuffer) {
        throw new Error('File path or buffer is required');
      }

      step.success = true;
      step.endTime = new Date().toISOString();
      
      logger.info('File input validation completed', {
        format,
        sizeCategory: this._getFileSizeCategory(fileSpec.fileSize),
      });

    } catch (error) {
      step.error = error.message;
      step.endTime = new Date().toISOString();
      throw error;
    } finally {
      result.processing.steps.push(step);
    }
  }

  /**
   * Parse file data into structured records
   * @private
   */
  async parseFileData(fileSpec, result, logger) {
    logger.info('Parsing file data');
    
    const step = {
      name: 'file_parsing',
      startTime: new Date().toISOString(),
      success: false,
    };

    try {
      const parseOptions = {
        format: fileSpec.format,
        expectedColumns: fileSpec.columns,
        autoDetectColumns: true,
        skipEmptyRows: true,
        maxRows: 100000, // Safety limit
      };

      const parsedData = await this.fileParser.parseFile(fileSpec, parseOptions);

      if (!parsedData.success) {
        throw new Error(`File parsing failed: ${parsedData.error}`);
      }

      step.success = true;
      step.endTime = new Date().toISOString();
      step.metrics = {
        recordsParsed: parsedData.records.length,
        columnsDetected: parsedData.columns.length,
        parsingWarnings: parsedData.warnings?.length || 0,
      };

      result.validation.totalRecords = parsedData.records.length;

      if (parsedData.warnings?.length > 0) {
        result.warnings.push(...parsedData.warnings);
      }

      logger.info('File parsing completed', {
        recordsParsed: parsedData.records.length,
        columnsDetected: parsedData.columns.length,
        warnings: parsedData.warnings?.length || 0,
      });

      return parsedData;

    } catch (error) {
      step.error = error.message;
      step.endTime = new Date().toISOString();
      throw error;
    } finally {
      result.processing.steps.push(step);
    }
  }

  /**
   * Validate and process records
   * @private
   */
  async validateAndProcessRecords(parsedData, result, logger) {
    logger.info('Validating and processing records', { 
      recordCount: parsedData.records.length 
    });
    
    const step = {
      name: 'record_validation',
      startTime: new Date().toISOString(),
      success: false,
    };

    try {
      const processedRecords = [];
      const batchSize = this.processingConfig.batchSize;
      const batches = this._createBatches(parsedData.records, batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        logger.info('Processing validation batch', {
          batchNumber: i + 1,
          totalBatches: batches.length,
          batchSize: batch.length,
        });

        const batchResults = await Promise.all(
          batch.map(record => this.validateSingleRecord(record, parsedData.columnMapping))
        );

        processedRecords.push(...batchResults);

        // Update validation metrics
        batchResults.forEach(record => {
          if (record.validation_status === 'valid') {
            result.validation.validRecords++;
          } else {
            result.validation.invalidRecords++;
          }

          // Email validation metrics
          if (record.email_valid === true) {
            result.validation.emailValidation.valid++;
          } else if (record.email_valid === false) {
            result.validation.emailValidation.invalid++;
          } else {
            result.validation.emailValidation.questionable++;
          }

          // Phone validation metrics
          if (record.phone_valid === true) {
            result.validation.phoneValidation.valid++;
          } else if (record.phone_valid === false) {
            result.validation.phoneValidation.invalid++;
          }

          if (record.phone_formatted && record.phone_formatted !== record.phone) {
            result.validation.phoneValidation.formatted++;
          }
        });
      }

      step.success = true;
      step.endTime = new Date().toISOString();
      step.metrics = {
        recordsProcessed: processedRecords.length,
        validRecords: result.validation.validRecords,
        invalidRecords: result.validation.invalidRecords,
        emailValidationRate: Math.round((result.validation.emailValidation.valid / processedRecords.length) * 100),
        phoneValidationRate: Math.round((result.validation.phoneValidation.valid / processedRecords.length) * 100),
      };

      logger.info('Record validation completed', step.metrics);

      return processedRecords;

    } catch (error) {
      step.error = error.message;
      step.endTime = new Date().toISOString();
      throw error;
    } finally {
      result.processing.steps.push(step);
    }
  }

  /**
   * Validate a single record
   * @private
   */
  async validateSingleRecord(record, columnMapping) {
    const processedRecord = {};
    const processingNotes = [];

    // Map and normalize all standard columns
    this.standardColumns.forEach(column => {
      processedRecord[column] = null;
    });

    // Copy mapped data from original record
    Object.entries(columnMapping).forEach(([originalColumn, standardColumn]) => {
      if (record[originalColumn] !== undefined && record[originalColumn] !== '') {
        processedRecord[standardColumn] = record[originalColumn];
      }
    });

    // Email validation
    if (processedRecord.email) {
      const emailValidation = await this.validateEmail(processedRecord.email);
      processedRecord.email_valid = emailValidation.isValid;
      processedRecord.email_deliverable = emailValidation.deliverable;
      processedRecord.email_quality_score = emailValidation.qualityScore;
      
      if (emailValidation.notes) {
        processingNotes.push(`Email: ${emailValidation.notes}`);
      }
    } else {
      processedRecord.email_valid = null;
      processedRecord.email_deliverable = null;
      processedRecord.email_quality_score = 0;
    }

    // Phone validation
    if (processedRecord.phone) {
      const phoneValidation = await this.validatePhone(processedRecord.phone);
      processedRecord.phone_valid = phoneValidation.isValid;
      processedRecord.phone_formatted = phoneValidation.formatted;
      processedRecord.phone_type = phoneValidation.type;
      processedRecord.phone_quality_score = phoneValidation.qualityScore;
      
      if (phoneValidation.notes) {
        processingNotes.push(`Phone: ${phoneValidation.notes}`);
      }
    } else {
      processedRecord.phone_valid = null;
      processedRecord.phone_formatted = null;
      processedRecord.phone_type = null;
      processedRecord.phone_quality_score = 0;
    }

    // Calculate overall quality score and validation status
    const qualityScore = this._calculateRecordQualityScore(processedRecord);
    processedRecord.quality_score = qualityScore;
    processedRecord.validation_status = this._determineValidationStatus(processedRecord, qualityScore);
    processedRecord.processing_notes = processingNotes.join('; ') || null;

    return processedRecord;
  }

  /**
   * Validate email address
   * @private
   */
  async validateEmail(email) {
    if (!email || typeof email !== 'string') {
      return {
        isValid: false,
        deliverable: false,
        qualityScore: 0,
        notes: 'Missing or invalid email format'
      };
    }

    const trimmedEmail = email.trim().toLowerCase();
    
    // Basic format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return {
        isValid: false,
        deliverable: false,
        qualityScore: 0,
        notes: 'Invalid email format'
      };
    }

    // Check for disposable domains (using existing validator)
    const isDisposable = this._isDisposableEmailDomain(trimmedEmail);
    
    // Domain validation
    const domain = trimmedEmail.split('@')[1];
    const hasValidDomain = domain && domain.includes('.') && domain.length > 3;
    
    let qualityScore = 100;
    const notes = [];
    
    if (isDisposable) {
      qualityScore -= 30;
      notes.push('disposable domain');
    }
    
    if (!hasValidDomain) {
      qualityScore -= 50;
      notes.push('questionable domain');
    }

    // Check for common typos in domains
    if (this._hasCommonDomainTypos(domain)) {
      qualityScore -= 20;
      notes.push('possible domain typo');
    }

    return {
      isValid: qualityScore >= 50,
      deliverable: qualityScore >= 70,
      qualityScore: Math.max(0, qualityScore),
      notes: notes.join(', ') || null
    };
  }

  /**
   * Validate phone number
   * @private
   */
  async validatePhone(phone) {
    if (!phone || typeof phone !== 'string') {
      return {
        isValid: false,
        formatted: null,
        type: null,
        qualityScore: 0,
        notes: 'Missing or invalid phone number'
      };
    }

    // Clean phone number - remove all non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    if (cleaned.length < 10) {
      return {
        isValid: false,
        formatted: phone,
        type: null,
        qualityScore: 0,
        notes: 'Phone number too short'
      };
    }

    // Format phone number
    let formatted = cleaned;
    let type = 'unknown';
    let qualityScore = 100;
    const notes = [];

    // US phone number formatting
    if (cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'))) {
      const digits = cleaned.length === 11 ? cleaned.substring(1) : cleaned;
      formatted = `+1-${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`;
      type = 'US';
      
      // Check for invalid US area codes
      const areaCode = digits.substring(0, 3);
      if (areaCode.startsWith('0') || areaCode.startsWith('1')) {
        qualityScore -= 30;
        notes.push('invalid area code');
      }
    } else if (cleaned.startsWith('+')) {
      // International number
      formatted = cleaned;
      type = 'international';
      
      if (cleaned.length > 15) {
        qualityScore -= 20;
        notes.push('unusually long for international');
      }
    } else if (cleaned.length > 11) {
      // Likely international without + prefix
      formatted = `+${cleaned}`;
      type = 'international';
      qualityScore -= 10;
      notes.push('missing country code prefix');
    }

    // Detect mobile vs landline patterns (basic US detection)
    if (type === 'US') {
      const areaCode = cleaned.length === 11 ? cleaned.substring(1, 4) : cleaned.substring(0, 3);
      // Common mobile area codes (simplified)
      const mobileAreaCodes = ['310', '323', '424', '818']; // LA area example
      if (mobileAreaCodes.includes(areaCode)) {
        type = 'US-mobile';
      } else {
        type = 'US-landline';
      }
    }

    return {
      isValid: qualityScore >= 50,
      formatted: formatted,
      type: type,
      qualityScore: Math.max(0, qualityScore),
      notes: notes.join(', ') || null
    };
  }

  /**
   * Generate standardized output file
   * @private
   */
  async generateOutputFile(processedData, fileSpec, result, logger) {
    logger.info('Generating output file', { recordCount: processedData.length });
    
    const step = {
      name: 'file_output',
      startTime: new Date().toISOString(),
      success: false,
    };

    try {
      const outputSpec = {
        records: processedData,
        columns: this.standardColumns,
        format: 'csv', // Phase 1 focuses on CSV output
        fileName: this._generateOutputFileName(fileSpec.fileName),
        includeHeaders: true,
        includeMetadata: true,
      };

      const outputResult = await this.fileOutput.generateFile(outputSpec);

      if (!outputResult.success) {
        throw new Error(`File output generation failed: ${outputResult.error}`);
      }

      step.success = true;
      step.endTime = new Date().toISOString();
      step.metrics = {
        outputRecords: processedData.length,
        outputFormat: outputResult.format,
        fileSize: outputResult.fileSize,
      };

      logger.info('Output file generated successfully', {
        fileName: outputResult.fileName,
        recordCount: processedData.length,
        fileSize: Math.round(outputResult.fileSize / 1024) + 'KB',
      });

      return {
        fileName: outputResult.fileName,
        downloadUrl: outputResult.downloadUrl,
        format: outputResult.format,
        recordCount: processedData.length,
        fileSize: outputResult.fileSize,
        columns: this.standardColumns,
      };

    } catch (error) {
      step.error = error.message;
      step.endTime = new Date().toISOString();
      throw error;
    } finally {
      result.processing.steps.push(step);
    }
  }

  /**
   * Helper methods
   * @private
   */
  _getFileSizeCategory(size) {
    if (size < 1024 * 1024) return 'small'; // < 1MB
    if (size < 10 * 1024 * 1024) return 'medium'; // < 10MB
    return 'large'; // >= 10MB
  }

  _createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  _calculateRecordQualityScore(record) {
    let score = 0;
    let maxScore = 0;

    // Email quality (40% weight)
    if (record.email) {
      maxScore += 40;
      score += (record.email_quality_score || 0) * 0.4;
    }

    // Phone quality (30% weight)
    if (record.phone) {
      maxScore += 30;
      score += (record.phone_quality_score || 0) * 0.3;
    }

    // Name completeness (20% weight)
    maxScore += 20;
    if (record.first_name) score += 10;
    if (record.last_name) score += 10;

    // Additional data (10% weight)
    maxScore += 10;
    if (record.company) score += 5;
    if (record.title) score += 3;
    if (record.city || record.state) score += 2;

    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  }

  _determineValidationStatus(record, qualityScore) {
    const hasEmail = record.email && record.email_valid;
    const hasPhone = record.phone && record.phone_valid;
    const hasName = record.first_name || record.last_name;

    if ((hasEmail || hasPhone) && hasName && qualityScore >= 70) {
      return 'valid';
    } else if ((hasEmail || hasPhone) && qualityScore >= 50) {
      return 'questionable';
    } else {
      return 'invalid';
    }
  }

  _isDisposableEmailDomain(email) {
    const disposableDomains = [
      '10minutemail.com', 'tempmail.org', 'guerrillamail.com', 
      'mailinator.com', 'yopmail.com', 'temp-mail.org',
      '33mail.com', 'throwaway.email', 'getnada.com'
    ];
    const domain = email.split('@')[1]?.toLowerCase();
    return disposableDomains.includes(domain);
  }

  _hasCommonDomainTypos(domain) {
    const typoPatterns = [
      { correct: 'gmail.com', typos: ['gmai.com', 'gmial.com', 'gmal.com'] },
      { correct: 'yahoo.com', typos: ['yaho.com', 'yahooo.com', 'yahoo.co'] },
      { correct: 'hotmail.com', typos: ['hotmial.com', 'hotmai.com', 'hotmal.com'] },
    ];

    return typoPatterns.some(pattern => 
      pattern.typos.includes(domain.toLowerCase())
    );
  }

  _generateOutputFileName(originalFileName) {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const baseName = originalFileName.replace(/\.[^/.]+$/, "");
    return `${baseName}_validated_${timestamp}.csv`;
  }

  _updateMetrics(result, duration) {
    this.metrics.totalFilesProcessed++;
    this.metrics.totalRecordsProcessed += result.validation.totalRecords;
    
    if (!result.success) {
      this.metrics.processingErrors++;
    }

    // Update file size metrics
    const sizeCategory = this._getFileSizeCategory(result.originalFile.size);
    this.metrics.filesBySize[sizeCategory]++;

    // Update average processing time
    const totalTime = this.metrics.averageProcessingTime * (this.metrics.totalFilesProcessed - 1) + duration;
    this.metrics.averageProcessingTime = Math.round(totalTime / this.metrics.totalFilesProcessed);
  }

  /**
   * Get worker health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      phase: this.processingConfig.phase,
      metrics: this.metrics,
      configuration: this.processingConfig,
      standardColumns: this.standardColumns,
    };
  }

  /**
   * Shutdown worker gracefully
   */
  async shutdown() {
    this.logger.info('Shutting down file enrichment worker');

    try {
      await Promise.all([
        this.fileParser.shutdown(),
        this.fileOutput.shutdown(),
      ]);

      this.logger.info('File enrichment worker shutdown complete', {
        totalFilesProcessed: this.metrics.totalFilesProcessed,
        totalRecordsProcessed: this.metrics.totalRecordsProcessed,
        successRate: this.metrics.totalFilesProcessed > 0 
          ? Math.round(((this.metrics.totalFilesProcessed - this.metrics.processingErrors) / this.metrics.totalFilesProcessed) * 100)
          : 0,
      });

    } catch (error) {
      this.logger.error('Error during file enrichment worker shutdown', { error: error.message });
    }
  }
}

export default FileEnrichmentWorker;