/**
 * Download Server - Production File Delivery API
 * Provides secure file download endpoints with authentication and monitoring
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const { createContextLogger } = require('../utils/logger.js');
const FileStorageService = require('../services/file-storage-service.js');

class DownloadServer {
  constructor(options = {}) {
    this.logger = createContextLogger({ service: 'download-server' });
    this.app = express();
    this.fileStorage = new FileStorageService(options.storage || {});
    
    this.config = {
      port: options.port || 3001,
      corsOrigins: options.corsOrigins || ['http://localhost:3000'],
      rateLimitWindow: options.rateLimitWindow || 15 * 60 * 1000, // 15 minutes
      rateLimitMax: options.rateLimitMax || 100, // 100 requests per window
      downloadRateLimit: options.downloadRateLimit || 10, // 10 downloads per window
      requireAuth: options.requireAuth !== false,
      logDownloads: options.logDownloads !== false,
      ...options
    };

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();

    this.logger.info('Download server initialized', {
      port: this.config.port,
      rateLimitMax: this.config.rateLimitMax,
      requireAuth: this.config.requireAuth
    });
  }

  /**
   * Setup middleware
   * @private
   */
  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Allow file downloads
      crossOriginEmbedderPolicy: false
    }));

    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigins,
      methods: ['GET', 'HEAD', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    }));

    // Rate limiting
    const generalLimiter = rateLimit({
      windowMs: this.config.rateLimitWindow,
      max: this.config.rateLimitMax,
      message: {
        error: 'Too many requests',
        message: 'Please try again later'
      },
      standardHeaders: true,
      legacyHeaders: false
    });

    const downloadLimiter = rateLimit({
      windowMs: this.config.rateLimitWindow,
      max: this.config.downloadRateLimit,
      message: {
        error: 'Too many download requests',
        message: 'Download limit exceeded. Please try again later.'
      },
      keyGenerator: (req) => {
        // Use IP + access token for download rate limiting
        return `${req.ip}-${req.params.accessToken || 'unknown'}`;
      }
    });

    this.app.use('/api', generalLimiter);
    this.app.use('/api/download', downloadLimiter);

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      const logger = createContextLogger({
        service: 'download-server',
        method: req.method,
        url: req.url,
        ip: req.ip
      });
      
      req.logger = logger;
      logger.debug('Request received');
      next();
    });
  }

  /**
   * Setup routes
   * @private
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'download-server'
      });
    });

    // Download file by access token
    this.app.get('/api/download/:accessToken', async (req, res) => {
      await this.handleDownloadRequest(req, res);
    });

    // Get download info (without downloading)
    this.app.get('/api/download/:accessToken/info', async (req, res) => {
      await this.handleDownloadInfo(req, res);
    });

    // Direct file download (legacy support)
    this.app.get('/download/results/:fileId', async (req, res) => {
      await this.handleDirectDownload(req, res);
    });

    // Storage statistics (admin only)
    this.app.get('/api/admin/storage/stats', async (req, res) => {
      await this.handleStorageStats(req, res);
    });

    // Download statistics
    this.app.get('/api/admin/downloads/stats', async (req, res) => {
      await this.handleDownloadStats(req, res);
    });

    // Catch-all for 404s
    this.app.get('*', (req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: 'The requested resource was not found'
      });
    });
  }

  /**
   * Handle file download request
   * @private
   */
  async handleDownloadRequest(req, res) {
    const { accessToken } = req.params;
    const logger = createContextLogger({
      service: 'download-handler',
      accessToken: accessToken.substring(0, 8) + '...'
    });

    try {
      logger.info('Download request received');

      // Extract request context
      const requestContext = {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer'),
        timestamp: new Date().toISOString()
      };

      // Validate and serve file
      const fileData = await this.fileStorage.validateAndServeFile(accessToken, requestContext);

      // Set response headers
      Object.entries(fileData.headers).forEach(([key, value]) => {
        res.set(key, value);
      });

      // Log download
      if (this.config.logDownloads) {
        logger.info('File download served', {
          filename: fileData.filename,
          size: fileData.size,
          mimetype: fileData.mimetype,
          userAgent: requestContext.userAgent
        });
      }

      // Send file
      res.status(200).send(fileData.content);

    } catch (error) {
      logger.error('Download request failed', { error: error.message });

      if (error.message.includes('expired')) {
        res.status(410).json({
          error: 'Link expired',
          message: 'This download link has expired. Please request a new one.'
        });
      } else if (error.message.includes('limit')) {
        res.status(429).json({
          error: 'Download limit exceeded',
          message: 'Maximum number of downloads reached for this file.'
        });
      } else if (error.message.includes('not authorized')) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You are not authorized to download this file.'
        });
      } else {
        res.status(404).json({
          error: 'File not found',
          message: 'The requested file could not be found or accessed.'
        });
      }
    }
  }

  /**
   * Handle download info request
   * @private
   */
  async handleDownloadInfo(req, res) {
    const { accessToken } = req.params;
    const logger = createContextLogger({
      service: 'download-info',
      accessToken: accessToken.substring(0, 8) + '...'
    });

    try {
      logger.info('Download info request received');

      // This would require extending FileStorageService to get info without downloading
      // For now, return basic info
      res.json({
        status: 'available',
        accessToken: accessToken.substring(0, 8) + '...',
        message: 'File is available for download'
      });

    } catch (error) {
      logger.error('Download info request failed', { error: error.message });
      res.status(404).json({
        error: 'File not found',
        message: 'Download information not available'
      });
    }
  }

  /**
   * Handle direct download (legacy)
   * @private
   */
  async handleDirectDownload(req, res) {
    const { fileId } = req.params;
    const logger = createContextLogger({
      service: 'direct-download',
      fileId
    });

    try {
      logger.info('Direct download request received');

      // For security, direct downloads should be limited or deprecated
      res.status(410).json({
        error: 'Direct download not available',
        message: 'Please use the secure download link provided in your processing results.'
      });

    } catch (error) {
      logger.error('Direct download failed', { error: error.message });
      res.status(404).json({
        error: 'File not found',
        message: 'The requested file could not be found.'
      });
    }
  }

  /**
   * Handle storage statistics
   * @private
   */
  async handleStorageStats(req, res) {
    try {
      // Basic admin authentication (expand as needed)
      const authHeader = req.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Admin access required'
        });
      }

      const stats = await this.fileStorage.getStorageStats();
      res.json({
        timestamp: new Date().toISOString(),
        storage: stats
      });

    } catch (error) {
      req.logger.error('Storage stats request failed', { error: error.message });
      res.status(500).json({
        error: 'Internal server error',
        message: 'Unable to retrieve storage statistics'
      });
    }
  }

  /**
   * Handle download statistics
   * @private
   */
  async handleDownloadStats(req, res) {
    try {
      // Return basic download statistics
      res.json({
        timestamp: new Date().toISOString(),
        downloads: {
          total: 0, // This would be tracked in a real implementation
          today: 0,
          thisWeek: 0,
          thisMonth: 0
        },
        message: 'Download statistics endpoint - implement tracking as needed'
      });

    } catch (error) {
      req.logger.error('Download stats request failed', { error: error.message });
      res.status(500).json({
        error: 'Internal server error',
        message: 'Unable to retrieve download statistics'
      });
    }
  }

  /**
   * Setup error handling
   * @private
   */
  setupErrorHandling() {
    // Handle uncaught errors
    this.app.use((error, req, res, next) => {
      const logger = createContextLogger({
        service: 'download-server-error',
        url: req.url,
        method: req.method
      });

      logger.error('Unhandled error in download server', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      });
    });

    // Handle 404s
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: 'The requested endpoint was not found'
      });
    });
  }

  /**
   * Start the download server
   * @returns {Promise<void>}
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, () => {
          this.logger.info('Download server started', {
            port: this.config.port,
            endpoints: [
              '/api/download/:accessToken',
              '/api/download/:accessToken/info',
              '/health'
            ]
          });
          resolve();
        });

        this.server.on('error', (error) => {
          this.logger.error('Download server error', { error: error.message });
          reject(error);
        });

      } catch (error) {
        this.logger.error('Failed to start download server', { error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Stop the download server
   * @returns {Promise<void>}
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Download server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get server statistics
   * @returns {Object} Server statistics
   */
  getStats() {
    return {
      config: {
        port: this.config.port,
        rateLimitMax: this.config.rateLimitMax,
        downloadRateLimit: this.config.downloadRateLimit
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = DownloadServer;