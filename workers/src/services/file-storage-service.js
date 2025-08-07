/**
 * File Storage Service - Production Implementation
 * Handles secure file upload, processing, and delivery with best practices
 */

const fs = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { createContextLogger } = require('../utils/logger.js');

class FileStorageService {
  constructor(options = {}) {
    this.logger = createContextLogger({ service: 'file-storage' });
    
    // Configuration with defaults
    this.config = {
      baseDir: options.baseDir || './storage',
      maxFileSize: options.maxFileSize || 50 * 1024 * 1024, // 50MB
      allowedMimeTypes: options.allowedMimeTypes || [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ],
      allowedExtensions: options.allowedExtensions || ['.csv', '.xls', '.xlsx'],
      retentionDays: options.retentionDays || 30,
      encryptFiles: options.encryptFiles !== false, // Default true
      ...options
    };

    // Directory structure
    this.directories = {
      uploads: path.join(this.config.baseDir, 'uploads'),
      processing: path.join(this.config.baseDir, 'processing'),
      results: path.join(this.config.baseDir, 'results'),
      temp: path.join(this.config.baseDir, 'temp'),
      archive: path.join(this.config.baseDir, 'archive')
    };

    this.initializeStorage();
  }

  /**
   * Initialize storage directories
   * @private
   */
  async initializeStorage() {
    try {
      // Create all required directories
      for (const [name, dir] of Object.entries(this.directories)) {
        await fs.mkdir(dir, { recursive: true });
        this.logger.debug(`Storage directory created: ${name} -> ${dir}`);
      }

      this.logger.info('File storage service initialized', {
        baseDir: this.config.baseDir,
        maxFileSize: this.config.maxFileSize,
        encryptFiles: this.config.encryptFiles,
        retentionDays: this.config.retentionDays
      });

      // Start cleanup scheduler
      this.startCleanupScheduler();

    } catch (error) {
      this.logger.error('Failed to initialize storage directories', { error: error.message });
      throw error;
    }
  }

  /**
   * Store uploaded file securely
   * @param {Buffer} fileBuffer - File content buffer
   * @param {Object} fileMetadata - File metadata from Slack
   * @param {Object} context - Processing context (userId, channelId, etc.)
   * @returns {Promise<Object>} File storage result
   */
  async storeUploadedFile(fileBuffer, fileMetadata, context = {}) {
    const fileId = uuidv4();
    const timestamp = new Date().toISOString();
    const logger = createContextLogger({ 
      service: 'file-storage', 
      fileId, 
      userId: context.userId 
    });

    try {
      // Validate file
      await this.validateFile(fileBuffer, fileMetadata);

      // Generate secure filename and paths
      const ext = path.extname(fileMetadata.name).toLowerCase();
      const secureFilename = `${fileId}${ext}`;
      const uploadPath = path.join(this.directories.uploads, secureFilename);
      
      // Create file metadata
      const metadata = {
        fileId,
        originalName: fileMetadata.name,
        secureFilename,
        mimetype: fileMetadata.mimetype,
        size: fileBuffer.length,
        uploadedAt: timestamp,
        uploadedBy: context.userId,
        channelId: context.channelId,
        status: 'uploaded',
        checksum: crypto.createHash('sha256').update(fileBuffer).digest('hex'),
        paths: {
          upload: uploadPath,
          processing: path.join(this.directories.processing, secureFilename),
          results: path.join(this.directories.results, `${fileId}_results.csv`),
          metadata: path.join(this.directories.uploads, `${fileId}_metadata.json`)
        },
        security: {
          encrypted: this.config.encryptFiles,
          accessKey: this.config.encryptFiles ? crypto.randomBytes(32).toString('hex') : null
        }
      };

      // Store file (encrypted if enabled)
      let fileContent = fileBuffer;
      if (this.config.encryptFiles) {
        fileContent = this.encryptFile(fileBuffer, metadata.security.accessKey);
      }

      await fs.writeFile(uploadPath, fileContent);
      await fs.writeFile(metadata.paths.metadata, JSON.stringify(metadata, null, 2));

      logger.info('File stored successfully', {
        originalName: fileMetadata.name,
        size: fileBuffer.length,
        encrypted: this.config.encryptFiles,
        uploadPath: secureFilename
      });

      return {
        success: true,
        fileId,
        metadata,
        uploadPath,
        size: fileBuffer.length
      };

    } catch (error) {
      logger.error('File storage failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Retrieve file for processing
   * @param {string} fileId - File identifier
   * @returns {Promise<Object>} File content and metadata
   */
  async retrieveFile(fileId) {
    const logger = createContextLogger({ service: 'file-storage', fileId });

    try {
      // Load metadata
      const metadataPath = path.join(this.directories.uploads, `${fileId}_metadata.json`);
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

      // Load file content
      let fileContent = await fs.readFile(metadata.paths.upload);

      // Decrypt if necessary
      if (metadata.security.encrypted) {
        fileContent = this.decryptFile(fileContent, metadata.security.accessKey);
      }

      // Verify checksum
      const currentChecksum = crypto.createHash('sha256').update(fileContent).digest('hex');
      if (currentChecksum !== metadata.checksum) {
        throw new Error('File integrity check failed');
      }

      logger.info('File retrieved successfully', {
        originalName: metadata.originalName,
        size: fileContent.length
      });

      return {
        content: fileContent,
        metadata,
        buffer: fileContent
      };

    } catch (error) {
      logger.error('File retrieval failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Store processing results
   * @param {string} fileId - Original file identifier
   * @param {Object} results - Validation results
   * @param {Buffer} csvBuffer - Processed CSV content
   * @returns {Promise<Object>} Storage result
   */
  async storeResults(fileId, results, csvBuffer) {
    const logger = createContextLogger({ service: 'file-storage', fileId });

    try {
      // Load original metadata
      const metadataPath = path.join(this.directories.uploads, `${fileId}_metadata.json`);
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

      // Generate result filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const resultFilename = `${metadata.originalName.replace(/\.[^/.]+$/, '')}_validated_${timestamp}.csv`;
      const resultPath = path.join(this.directories.results, `${fileId}_results.csv`);
      const publicResultPath = path.join(this.directories.results, resultFilename);

      // Store CSV results
      await fs.writeFile(resultPath, csvBuffer);
      await fs.writeFile(publicResultPath, csvBuffer);

      // Update metadata
      metadata.status = 'completed';
      metadata.completedAt = new Date().toISOString();
      metadata.results = {
        ...results,
        resultFilename,
        resultPath: publicResultPath,
        downloadUrl: `/download/results/${fileId}`,
        publicDownloadUrl: `/download/results/${resultFilename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      };

      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      logger.info('Results stored successfully', {
        resultFilename,
        size: csvBuffer.length,
        processedRecords: results.processedRecords
      });

      return {
        success: true,
        resultFilename,
        downloadUrl: metadata.results.downloadUrl,
        publicDownloadUrl: metadata.results.publicDownloadUrl,
        size: csvBuffer.length,
        metadata: metadata.results
      };

    } catch (error) {
      logger.error('Results storage failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate secure download link with expiration
   * @param {string} fileId - File identifier  
   * @param {Object} options - Download options
   * @returns {Promise<Object>} Download link information
   */
  async generateDownloadLink(fileId, options = {}) {
    const logger = createContextLogger({ service: 'file-storage', fileId });
    
    try {
      const expiresInHours = options.expiresInHours || 24;
      const accessToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + (expiresInHours * 60 * 60 * 1000));

      // Store download token
      const downloadMetadata = {
        fileId,
        accessToken,
        expiresAt: expiresAt.toISOString(),
        downloadCount: 0,
        maxDownloads: options.maxDownloads || 10,
        createdAt: new Date().toISOString(),
        createdBy: options.userId,
        restrictions: {
          ipWhitelist: options.ipWhitelist || null,
          userAgent: options.userAgent || null
        }
      };

      const tokenPath = path.join(this.directories.temp, `download_${accessToken}.json`);
      await fs.writeFile(tokenPath, JSON.stringify(downloadMetadata, null, 2));

      const downloadUrl = `/api/download/${accessToken}`;
      
      logger.info('Download link generated', {
        expiresAt: expiresAt.toISOString(),
        maxDownloads: downloadMetadata.maxDownloads
      });

      return {
        downloadUrl,
        accessToken,
        expiresAt,
        maxDownloads: downloadMetadata.maxDownloads,
        validFor: `${expiresInHours} hours`
      };

    } catch (error) {
      logger.error('Download link generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate download token and serve file
   * @param {string} accessToken - Download access token
   * @param {Object} requestContext - Request context (IP, user agent, etc.)
   * @returns {Promise<Object>} File content and headers
   */
  async validateAndServeFile(accessToken, requestContext = {}) {
    const logger = createContextLogger({ service: 'file-storage', accessToken });

    try {
      const tokenPath = path.join(this.directories.temp, `download_${accessToken}.json`);
      const downloadMetadata = JSON.parse(await fs.readFile(tokenPath, 'utf8'));

      // Validate expiration
      if (new Date() > new Date(downloadMetadata.expiresAt)) {
        await fs.unlink(tokenPath).catch(() => {}); // Clean up expired token
        throw new Error('Download link has expired');
      }

      // Validate download count
      if (downloadMetadata.downloadCount >= downloadMetadata.maxDownloads) {
        throw new Error('Maximum download limit reached');
      }

      // Validate restrictions
      if (downloadMetadata.restrictions.ipWhitelist) {
        const allowedIPs = downloadMetadata.restrictions.ipWhitelist;
        if (!allowedIPs.includes(requestContext.ip)) {
          throw new Error('IP address not authorized for download');
        }
      }

      // Retrieve file
      const fileData = await this.retrieveFile(downloadMetadata.fileId);
      const metadata = fileData.metadata;

      // Update download count
      downloadMetadata.downloadCount++;
      downloadMetadata.lastDownloadAt = new Date().toISOString();
      downloadMetadata.lastDownloadIP = requestContext.ip;
      await fs.writeFile(tokenPath, JSON.stringify(downloadMetadata, null, 2));

      logger.info('File served successfully', {
        fileId: downloadMetadata.fileId,
        downloadCount: downloadMetadata.downloadCount,
        originalName: metadata.originalName
      });

      return {
        content: fileData.content,
        filename: metadata.results?.resultFilename || metadata.originalName,
        mimetype: metadata.mimetype,
        size: metadata.size,
        headers: {
          'Content-Type': metadata.mimetype,
          'Content-Length': fileData.content.length,
          'Content-Disposition': `attachment; filename="${metadata.results?.resultFilename || metadata.originalName}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      };

    } catch (error) {
      logger.error('File serving failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate uploaded file
   * @private
   */
  async validateFile(fileBuffer, fileMetadata) {
    // Size validation
    if (fileBuffer.length > this.config.maxFileSize) {
      throw new Error(`File too large. Maximum size: ${this.config.maxFileSize / (1024 * 1024)}MB`);
    }

    // MIME type validation
    if (!this.config.allowedMimeTypes.includes(fileMetadata.mimetype)) {
      throw new Error(`Invalid file type. Allowed types: ${this.config.allowedMimeTypes.join(', ')}`);
    }

    // Extension validation
    const ext = path.extname(fileMetadata.name).toLowerCase();
    if (!this.config.allowedExtensions.includes(ext)) {
      throw new Error(`Invalid file extension. Allowed extensions: ${this.config.allowedExtensions.join(', ')}`);
    }

    // Basic content validation for CSV
    if (fileMetadata.mimetype === 'text/csv' || ext === '.csv') {
      const content = fileBuffer.toString('utf8', 0, Math.min(1024, fileBuffer.length));
      if (!content.includes(',') && !content.includes('\t')) {
        throw new Error('File does not appear to be a valid CSV format');
      }
    }

    return true;
  }

  /**
   * Encrypt file content
   * @private
   */
  encryptFile(buffer, key) {
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    const keyBuffer = Buffer.from(key, 'hex');
    
    const cipher = crypto.createCipher(algorithm, keyBuffer);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt file content
   * @private
   */
  decryptFile(encryptedBuffer, key) {
    const algorithm = 'aes-256-gcm';
    const keyBuffer = Buffer.from(key, 'hex');
    
    const iv = encryptedBuffer.slice(0, 16);
    const authTag = encryptedBuffer.slice(16, 32);
    const encrypted = encryptedBuffer.slice(32);
    
    const decipher = crypto.createDecipher(algorithm, keyBuffer);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Start cleanup scheduler for expired files
   * @private
   */
  startCleanupScheduler() {
    // Run cleanup every 6 hours
    setInterval(async () => {
      try {
        await this.cleanupExpiredFiles();
      } catch (error) {
        this.logger.error('Cleanup scheduler error', { error: error.message });
      }
    }, 6 * 60 * 60 * 1000);

    this.logger.info('Cleanup scheduler started', {
      interval: '6 hours',
      retentionDays: this.config.retentionDays
    });
  }

  /**
   * Clean up expired files and tokens
   */
  async cleanupExpiredFiles() {
    const logger = createContextLogger({ service: 'file-storage-cleanup' });
    const cutoffDate = new Date(Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000));
    
    let cleanedCount = 0;
    let errorCount = 0;

    try {
      // Clean up old files
      for (const [dirName, dirPath] of Object.entries(this.directories)) {
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
          try {
            const filePath = path.join(dirPath, file);
            const stats = await fs.stat(filePath);
            
            if (stats.mtime < cutoffDate) {
              await fs.unlink(filePath);
              cleanedCount++;
              logger.debug(`Cleaned expired file: ${file}`);
            }
          } catch (error) {
            errorCount++;
            logger.warn(`Failed to clean file: ${file}`, { error: error.message });
          }
        }
      }

      logger.info('File cleanup completed', {
        cleanedFiles: cleanedCount,
        errors: errorCount,
        cutoffDate: cutoffDate.toISOString()
      });

    } catch (error) {
      logger.error('File cleanup failed', { error: error.message });
    }
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object>} Storage statistics
   */
  async getStorageStats() {
    const stats = {
      directories: {},
      totalSize: 0,
      totalFiles: 0
    };

    for (const [dirName, dirPath] of Object.entries(this.directories)) {
      try {
        const files = await fs.readdir(dirPath);
        let dirSize = 0;
        
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const fileStat = await fs.stat(filePath);
          dirSize += fileStat.size;
        }
        
        stats.directories[dirName] = {
          files: files.length,
          size: dirSize,
          path: dirPath
        };
        
        stats.totalFiles += files.length;
        stats.totalSize += dirSize;
      } catch (error) {
        stats.directories[dirName] = { error: error.message };
      }
    }

    return stats;
  }
}

module.exports = FileStorageService;