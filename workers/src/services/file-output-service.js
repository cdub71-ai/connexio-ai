import fs from 'fs/promises';
import path from 'path';
import { createContextLogger } from '../utils/logger.js';

/**
 * File Output Service
 * Generates standardized output files with validation results
 */
class FileOutputService {
  constructor() {
    this.logger = createContextLogger({ service: 'file-output-service' });
    
    // Output configuration
    this.outputConfig = {
      baseOutputDir: process.env.OUTPUT_DIR || '/tmp/connexio-outputs',
      supportedFormats: ['csv', 'json'],
      defaultFormat: 'csv',
      includeMetadata: true,
      includeTimestamp: true,
    };

    // Ensure output directory exists
    this.initializeOutputDirectory();

    this.logger.info('File Output Service initialized', {
      outputDir: this.outputConfig.baseOutputDir,
      supportedFormats: this.outputConfig.supportedFormats,
    });
  }

  /**
   * Generate output file with processed data
   * @param {Object} outputSpec - Output specification
   * @returns {Promise<Object>} Generated file information
   */
  async generateFile(outputSpec) {
    const logger = this.logger.child({ 
      method: 'generateFile',
      fileName: outputSpec.fileName,
      format: outputSpec.format || this.outputConfig.defaultFormat,
    });

    logger.info('Starting file generation', {
      recordCount: outputSpec.records.length,
      columnCount: outputSpec.columns.length,
      includeHeaders: outputSpec.includeHeaders,
      includeMetadata: outputSpec.includeMetadata,
    });

    try {
      const format = outputSpec.format || this.outputConfig.defaultFormat;
      const outputPath = await this.getOutputPath(outputSpec.fileName);

      let result;
      switch (format.toLowerCase()) {
        case 'csv':
          result = await this.generateCSV(outputSpec, outputPath);
          break;
        case 'json':
          result = await this.generateJSON(outputSpec, outputPath);
          break;
        default:
          throw new Error(`Unsupported output format: ${format}`);
      }

      logger.info('File generation completed', {
        fileName: result.fileName,
        fileSize: result.fileSize,
        recordsWritten: outputSpec.records.length,
      });

      return {
        success: true,
        ...result,
      };

    } catch (error) {
      logger.error('File generation failed', { error: error.message });
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate CSV output file
   * @private
   */
  async generateCSV(outputSpec, outputPath) {
    const lines = [];
    
    // Add metadata header if requested
    if (outputSpec.includeMetadata && this.outputConfig.includeMetadata) {
      lines.push('# Connexio AI - File Validation Results');
      lines.push(`# Generated: ${new Date().toISOString()}`);
      lines.push(`# Total Records: ${outputSpec.records.length}`);
      lines.push(`# Standard Columns: ${outputSpec.columns.length}`);
      lines.push('#');
    }

    // Add column headers
    if (outputSpec.includeHeaders !== false) {
      const headerLine = outputSpec.columns
        .map(col => this.escapeCSVValue(col))
        .join(',');
      lines.push(headerLine);
    }

    // Add data rows
    for (const record of outputSpec.records) {
      const values = outputSpec.columns.map(column => {
        const value = record[column];
        return this.escapeCSVValue(this.formatOutputValue(value));
      });
      lines.push(values.join(','));
    }

    // Write file
    const content = lines.join('\n');
    await fs.writeFile(outputPath, content, 'utf8');

    // Get file stats
    const stats = await fs.stat(outputPath);
    
    return {
      fileName: path.basename(outputPath),
      filePath: outputPath,
      downloadUrl: await this.generateDownloadUrl(outputPath),
      format: 'csv',
      fileSize: stats.size,
      recordCount: outputSpec.records.length,
      columnCount: outputSpec.columns.length,
    };
  }

  /**
   * Generate JSON output file
   * @private
   */
  async generateJSON(outputSpec, outputPath) {
    const output = {
      metadata: {
        generated: new Date().toISOString(),
        totalRecords: outputSpec.records.length,
        columns: outputSpec.columns,
        phase: 1,
        validationOnly: true,
      },
      data: outputSpec.records.map(record => {
        const cleanRecord = {};
        outputSpec.columns.forEach(column => {
          cleanRecord[column] = this.formatOutputValue(record[column]);
        });
        return cleanRecord;
      }),
    };

    // Write file
    const content = JSON.stringify(output, null, 2);
    await fs.writeFile(outputPath, content, 'utf8');

    // Get file stats
    const stats = await fs.stat(outputPath);
    
    return {
      fileName: path.basename(outputPath),
      filePath: outputPath,
      downloadUrl: await this.generateDownloadUrl(outputPath),
      format: 'json',
      fileSize: stats.size,
      recordCount: outputSpec.records.length,
      columnCount: outputSpec.columns.length,
    };
  }

  /**
   * Generate validation summary report
   * @param {Object} validationResults - Validation results from processing
   * @returns {Promise<Object>} Generated report information
   */
  async generateValidationReport(validationResults) {
    const logger = this.logger.child({ 
      method: 'generateValidationReport',
      processId: validationResults.processId,
    });

    logger.info('Generating validation report');

    try {
      const reportData = {
        processId: validationResults.processId,
        generated: new Date().toISOString(),
        originalFile: validationResults.originalFile,
        processing: validationResults.processing,
        validation: validationResults.validation,
        summary: {
          totalRecords: validationResults.validation.totalRecords,
          validRecords: validationResults.validation.validRecords,
          invalidRecords: validationResults.validation.invalidRecords,
          validationRate: Math.round((validationResults.validation.validRecords / validationResults.validation.totalRecords) * 100),
          emailValidation: {
            total: validationResults.validation.totalRecords,
            valid: validationResults.validation.emailValidation.valid,
            invalid: validationResults.validation.emailValidation.invalid,
            questionable: validationResults.validation.emailValidation.questionable,
            validationRate: Math.round((validationResults.validation.emailValidation.valid / validationResults.validation.totalRecords) * 100),
          },
          phoneValidation: {
            total: validationResults.validation.totalRecords,
            valid: validationResults.validation.phoneValidation.valid,
            invalid: validationResults.validation.phoneValidation.invalid,
            formatted: validationResults.validation.phoneValidation.formatted,
            validationRate: Math.round((validationResults.validation.phoneValidation.valid / validationResults.validation.totalRecords) * 100),
          },
          qualityDistribution: this.calculateQualityDistribution(validationResults),
        },
        errors: validationResults.errors,
        warnings: validationResults.warnings,
      };

      const fileName = `validation_report_${validationResults.processId}.json`;
      const outputPath = await this.getOutputPath(fileName);
      
      await fs.writeFile(outputPath, JSON.stringify(reportData, null, 2), 'utf8');
      
      const stats = await fs.stat(outputPath);

      logger.info('Validation report generated', {
        fileName,
        fileSize: stats.size,
      });

      return {
        success: true,
        fileName,
        filePath: outputPath,
        downloadUrl: await this.generateDownloadUrl(outputPath),
        fileSize: stats.size,
        reportData,
      };

    } catch (error) {
      logger.error('Validation report generation failed', { error: error.message });
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate preview of output data (first N records)
   * @param {Array} records - Processed records
   * @param {Array} columns - Column names
   * @param {number} previewSize - Number of records to preview
   * @returns {Object} Preview data
   */
  generatePreview(records, columns, previewSize = 10) {
    const previewRecords = records.slice(0, previewSize);
    
    return {
      preview: true,
      totalRecords: records.length,
      previewSize: previewRecords.length,
      columns,
      records: previewRecords,
      hasMore: records.length > previewSize,
    };
  }

  /**
   * Helper methods
   * @private
   */
  async initializeOutputDirectory() {
    try {
      await fs.mkdir(this.outputConfig.baseOutputDir, { recursive: true });
    } catch (error) {
      this.logger.warn('Could not create output directory', { 
        dir: this.outputConfig.baseOutputDir,
        error: error.message 
      });
    }
  }

  async getOutputPath(fileName) {
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dailyDir = path.join(this.outputConfig.baseOutputDir, timestamp);
    
    // Ensure daily directory exists
    await fs.mkdir(dailyDir, { recursive: true });
    
    return path.join(dailyDir, fileName);
  }

  async generateDownloadUrl(filePath) {
    // In a real application, this would generate a signed URL or move file to a web-accessible location
    // For Phase 1, we'll return a local file path
    const relativePath = path.relative(this.outputConfig.baseOutputDir, filePath);
    return `/downloads/${relativePath}`;
  }

  escapeCSVValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    
    const stringValue = String(value);
    
    // If value contains comma, newline, or quotes, wrap in quotes
    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
      // Escape internal quotes by doubling them
      const escaped = stringValue.replace(/"/g, '""');
      return `"${escaped}"`;
    }
    
    return stringValue;
  }

  formatOutputValue(value) {
    if (value === null || value === undefined) {
      return null;
    }
    
    // Handle boolean values
    if (typeof value === 'boolean') {
      return value;
    }
    
    // Handle numeric values
    if (typeof value === 'number') {
      return value;
    }
    
    // Handle string values
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    
    return value;
  }

  calculateQualityDistribution(validationResults) {
    // This would analyze the processed records to determine quality distribution
    // For Phase 1, we'll provide a basic calculation
    const total = validationResults.validation.totalRecords;
    const valid = validationResults.validation.validRecords;
    const invalid = validationResults.validation.invalidRecords;
    
    return {
      high: Math.round((valid * 0.7)), // Assume 70% of valid records are high quality
      medium: Math.round((valid * 0.3)), // 30% are medium quality
      low: invalid,
      distribution: {
        high: Math.round((valid * 0.7 / total) * 100),
        medium: Math.round((valid * 0.3 / total) * 100),
        low: Math.round((invalid / total) * 100),
      },
    };
  }

  /**
   * Clean up old output files
   * @param {number} retentionDays - Number of days to retain files
   */
  async cleanupOldFiles(retentionDays = 7) {
    const logger = this.logger.child({ method: 'cleanupOldFiles' });
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const directories = await fs.readdir(this.outputConfig.baseOutputDir);
      let filesDeleted = 0;
      
      for (const dirName of directories) {
        const dirPath = path.join(this.outputConfig.baseOutputDir, dirName);
        
        try {
          const stats = await fs.stat(dirPath);
          
          if (stats.isDirectory() && stats.mtime < cutoffDate) {
            await fs.rm(dirPath, { recursive: true, force: true });
            filesDeleted++;
            logger.info('Deleted old output directory', { directory: dirName });
          }
        } catch (error) {
          logger.warn('Error checking directory', { directory: dirName, error: error.message });
        }
      }
      
      logger.info('File cleanup completed', { 
        retentionDays,
        directoriesDeleted: filesDeleted,
      });
      
    } catch (error) {
      logger.error('File cleanup failed', { error: error.message });
    }
  }

  /**
   * Get file download information
   * @param {string} fileName - Name of the file
   * @returns {Promise<Object>} File information
   */
  async getFileInfo(fileName) {
    try {
      const filePath = await this.findFile(fileName);
      
      if (!filePath) {
        return {
          exists: false,
          error: 'File not found',
        };
      }
      
      const stats = await fs.stat(filePath);
      
      return {
        exists: true,
        fileName,
        filePath,
        fileSize: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        downloadUrl: await this.generateDownloadUrl(filePath),
      };
      
    } catch (error) {
      return {
        exists: false,
        error: error.message,
      };
    }
  }

  /**
   * Find file in output directories
   * @private
   */
  async findFile(fileName) {
    try {
      // Check recent directories first (last 7 days)
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().slice(0, 10);
        
        const dailyDir = path.join(this.outputConfig.baseOutputDir, dateStr);
        const filePath = path.join(dailyDir, fileName);
        
        try {
          await fs.access(filePath);
          return filePath;
        } catch {
          // File doesn't exist in this directory, continue searching
        }
      }
      
      return null;
      
    } catch (error) {
      this.logger.error('Error finding file', { fileName, error: error.message });
      return null;
    }
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      outputDirectory: this.outputConfig.baseOutputDir,
      supportedFormats: this.outputConfig.supportedFormats,
      configuration: this.outputConfig,
    };
  }

  /**
   * Shutdown service gracefully
   */
  async shutdown() {
    this.logger.info('File output service shutdown initiated');
    
    try {
      // Clean up old files before shutdown
      await this.cleanupOldFiles();
      
      this.logger.info('File output service shutdown complete');
    } catch (error) {
      this.logger.error('Error during file output service shutdown', { error: error.message });
    }
  }
}

export default FileOutputService;