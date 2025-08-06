import fs from 'fs/promises';
import path from 'path';
import { createContextLogger } from '../utils/logger.js';

/**
 * File Parsing Service
 * Handles parsing of CSV and Excel files for data enrichment
 */
class FileParsingService {
  constructor() {
    this.logger = createContextLogger({ service: 'file-parsing-service' });
    
    // Column mapping patterns for auto-detection
    this.columnMappings = {
      // Email patterns
      email: [
        'email', 'email_address', 'e-mail', 'emailaddress', 'mail', 
        'primary_email', 'work_email', 'contact_email', 'e_mail'
      ],
      
      // Name patterns
      first_name: [
        'first_name', 'firstname', 'first', 'fname', 'given_name', 
        'forename', 'first name'
      ],
      last_name: [
        'last_name', 'lastname', 'last', 'lname', 'surname', 
        'family_name', 'last name'
      ],
      
      // Phone patterns
      phone: [
        'phone', 'phone_number', 'phonenumber', 'mobile', 'cell', 
        'telephone', 'tel', 'contact_number', 'phone number'
      ],
      
      // Company patterns
      company: [
        'company', 'company_name', 'companyname', 'organization', 
        'org', 'employer', 'business', 'company name'
      ],
      
      // Title patterns
      title: [
        'title', 'job_title', 'jobtitle', 'position', 'role', 
        'job_position', 'job title'
      ],
      
      // Location patterns
      city: ['city', 'town', 'locality'],
      state: ['state', 'province', 'region', 'st'],
      country: ['country', 'nation', 'country_code'],
    };

    this.supportedFormats = ['csv', 'xlsx', 'xls'];
    
    this.logger.info('File Parsing Service initialized', {
      supportedFormats: this.supportedFormats,
      columnMappingPatterns: Object.keys(this.columnMappings).length,
    });
  }

  /**
   * Parse file based on format
   * @param {Object} fileSpec - File specification
   * @param {Object} options - Parsing options
   * @returns {Promise<Object>} Parsed data with records and metadata
   */
  async parseFile(fileSpec, options = {}) {
    const logger = this.logger.child({ 
      method: 'parseFile',
      fileName: fileSpec.fileName,
      format: fileSpec.format 
    });

    logger.info('Starting file parsing', {
      format: fileSpec.format,
      autoDetectColumns: options.autoDetectColumns,
      maxRows: options.maxRows,
    });

    try {
      let parseResult;
      
      switch (fileSpec.format.toLowerCase()) {
        case 'csv':
          parseResult = await this.parseCSV(fileSpec, options);
          break;
        case 'xlsx':
        case 'xls':
          parseResult = await this.parseExcel(fileSpec, options);
          break;
        default:
          throw new Error(`Unsupported file format: ${fileSpec.format}`);
      }

      // Auto-detect column mappings if requested
      if (options.autoDetectColumns) {
        parseResult.columnMapping = this.detectColumnMappings(parseResult.columns);
        parseResult.mappingConfidence = this.calculateMappingConfidence(parseResult.columnMapping);
      }

      logger.info('File parsing completed', {
        recordsParsed: parseResult.records.length,
        columnsDetected: parseResult.columns.length,
        mappingConfidence: parseResult.mappingConfidence || 'N/A',
      });

      return {
        success: true,
        ...parseResult,
      };

    } catch (error) {
      logger.error('File parsing failed', { error: error.message });
      
      return {
        success: false,
        error: error.message,
        records: [],
        columns: [],
      };
    }
  }

  /**
   * Parse CSV file
   * @private
   */
  async parseCSV(fileSpec, options) {
    const records = [];
    const warnings = [];
    let columns = [];
    
    // Read file content
    let content;
    if (fileSpec.fileBuffer) {
      content = fileSpec.fileBuffer.toString('utf8');
    } else if (fileSpec.filePath) {
      content = await fs.readFile(fileSpec.filePath, 'utf8');
    } else {
      throw new Error('No file path or buffer provided');
    }

    // Simple CSV parsing (for production, consider using a proper CSV library like csv-parser)
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new Error('File appears to be empty');
    }

    // Parse header row
    const headerLine = lines[0];
    columns = this.parseCSVLine(headerLine);
    
    // Clean column names
    columns = columns.map(col => col.trim().toLowerCase().replace(/['"]/g, ''));

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      if (options.maxRows && records.length >= options.maxRows) {
        warnings.push(`Reached maximum row limit of ${options.maxRows}. Additional rows were skipped.`);
        break;
      }

      const line = lines[i].trim();
      if (!line || (options.skipEmptyRows && this.isEmptyRow(line))) {
        continue;
      }

      try {
        const values = this.parseCSVLine(line);
        const record = {};
        
        // Map values to columns
        columns.forEach((column, index) => {
          const value = values[index];
          record[column] = value ? value.trim().replace(/['"]/g, '') : null;
        });

        records.push(record);

      } catch (error) {
        warnings.push(`Error parsing row ${i + 1}: ${error.message}`);
        continue;
      }
    }

    return {
      records,
      columns,
      warnings,
      metadata: {
        format: 'csv',
        totalRows: lines.length - 1, // Excluding header
        parsedRows: records.length,
        skippedRows: (lines.length - 1) - records.length,
      },
    };
  }

  /**
   * Parse Excel file (basic implementation)
   * @private
   */
  async parseExcel(fileSpec, options) {
    // For Phase 1, we'll create a placeholder that handles basic Excel parsing
    // In production, you'd use a library like 'xlsx' or 'exceljs'
    
    throw new Error('Excel parsing not yet implemented in Phase 1. Please convert to CSV format.');
    
    // Future implementation would look like:
    /*
    const XLSX = require('xlsx');
    
    let workbook;
    if (fileSpec.fileBuffer) {
      workbook = XLSX.read(fileSpec.fileBuffer, { type: 'buffer' });
    } else {
      workbook = XLSX.readFile(fileSpec.filePath);
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Process jsonData similar to CSV parsing...
    */
  }

  /**
   * Parse a single CSV line handling quoted values
   * @private
   */
  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = null;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
      } else if (inQuotes && char === quoteChar) {
        if (nextChar === quoteChar) {
          // Escaped quote
          current += char;
          i++; // Skip next character
        } else {
          // End of quoted section
          inQuotes = false;
          quoteChar = null;
        }
      } else if (!inQuotes && char === ',') {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last value
    values.push(current);
    
    return values;
  }

  /**
   * Check if a row is empty or contains only separators
   * @private
   */
  isEmptyRow(line) {
    return !line.replace(/[,\s]/g, '').length;
  }

  /**
   * Auto-detect column mappings based on header names
   * @private
   */
  detectColumnMappings(columns) {
    const mapping = {};
    const unmappedColumns = [];
    
    columns.forEach(column => {
      const normalizedColumn = column.toLowerCase().trim();
      let mapped = false;
      
      // Check each standard column for matches
      Object.entries(this.columnMappings).forEach(([standardColumn, patterns]) => {
        if (!mapped && patterns.some(pattern => 
          normalizedColumn === pattern || 
          normalizedColumn.includes(pattern) || 
          pattern.includes(normalizedColumn)
        )) {
          mapping[column] = standardColumn;
          mapped = true;
        }
      });
      
      if (!mapped) {
        unmappedColumns.push(column);
      }
    });

    this.logger.info('Column mapping detection completed', {
      mappedColumns: Object.keys(mapping).length,
      unmappedColumns: unmappedColumns.length,
      unmapped: unmappedColumns,
    });

    return mapping;
  }

  /**
   * Calculate confidence score for column mappings
   * @private
   */
  calculateMappingConfidence(columnMapping) {
    const totalColumns = Object.keys(columnMapping).length;
    if (totalColumns === 0) return 0;

    // Required columns for high confidence
    const requiredColumns = ['email'];
    const importantColumns = ['first_name', 'last_name', 'phone', 'company'];
    
    let score = 0;
    let maxScore = 0;

    // Check for required columns (high weight)
    requiredColumns.forEach(column => {
      maxScore += 40;
      if (Object.values(columnMapping).includes(column)) {
        score += 40;
      }
    });

    // Check for important columns (medium weight)
    importantColumns.forEach(column => {
      maxScore += 15;
      if (Object.values(columnMapping).includes(column)) {
        score += 15;
      }
    });

    return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  }

  /**
   * Validate file structure before parsing
   * @param {Object} fileSpec - File specification
   * @returns {Promise<Object>} Validation result
   */
  async validateFileStructure(fileSpec) {
    const logger = this.logger.child({ 
      method: 'validateFileStructure',
      fileName: fileSpec.fileName 
    });

    try {
      // Check file exists and is readable
      if (fileSpec.filePath) {
        await fs.access(fileSpec.filePath, fs.constants.R_OK);
        
        const stats = await fs.stat(fileSpec.filePath);
        if (stats.size === 0) {
          throw new Error('File is empty');
        }
        
        if (stats.size > 100 * 1024 * 1024) { // 100MB limit
          throw new Error('File is too large (over 100MB)');
        }
      }

      // Validate format
      const format = fileSpec.format.toLowerCase();
      if (!this.supportedFormats.includes(format)) {
        throw new Error(`Unsupported format: ${format}`);
      }

      logger.info('File structure validation passed');
      return { isValid: true };

    } catch (error) {
      logger.error('File structure validation failed', { error: error.message });
      return { 
        isValid: false, 
        error: error.message 
      };
    }
  }

  /**
   * Get parsing statistics for a file
   * @param {Object} fileSpec - File specification
   * @returns {Promise<Object>} File statistics
   */
  async getFileStatistics(fileSpec) {
    try {
      if (fileSpec.format.toLowerCase() === 'csv') {
        return await this.getCSVStatistics(fileSpec);
      } else {
        return await this.getExcelStatistics(fileSpec);
      }
    } catch (error) {
      return {
        error: error.message,
        estimatedRows: 0,
        estimatedColumns: 0,
      };
    }
  }

  /**
   * Get CSV file statistics without full parsing
   * @private
   */
  async getCSVStatistics(fileSpec) {
    let content;
    if (fileSpec.fileBuffer) {
      content = fileSpec.fileBuffer.toString('utf8');
    } else {
      content = await fs.readFile(fileSpec.filePath, 'utf8');
    }

    const lines = content.split('\n').filter(line => line.trim());
    const headerLine = lines[0] || '';
    const columns = this.parseCSVLine(headerLine);

    return {
      estimatedRows: Math.max(0, lines.length - 1), // Excluding header
      estimatedColumns: columns.length,
      fileSize: content.length,
      hasHeader: lines.length > 0,
      sampleColumns: columns.slice(0, 10), // First 10 columns as sample
    };
  }

  /**
   * Get Excel file statistics
   * @private
   */
  async getExcelStatistics(fileSpec) {
    // Placeholder for Excel statistics
    return {
      estimatedRows: 0,
      estimatedColumns: 0,
      fileSize: fileSpec.fileSize || 0,
      hasHeader: true,
      sampleColumns: [],
      note: 'Excel parsing not implemented in Phase 1',
    };
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      supportedFormats: this.supportedFormats,
      columnMappingPatterns: Object.keys(this.columnMappings).length,
    };
  }

  /**
   * Shutdown service gracefully
   */
  async shutdown() {
    this.logger.info('File parsing service shutdown complete');
  }
}

export default FileParsingService;