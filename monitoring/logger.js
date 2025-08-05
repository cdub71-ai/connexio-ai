/**
 * Production-Ready Structured Logging System for Connexio AI
 * Provides comprehensive logging with context, correlation, and observability
 */

import winston from 'winston';
import 'winston-daily-rotate-file';
import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';
import { metricsCollector } from './metrics-collector.js';

// Context storage for request correlation
const asyncLocalStorage = new AsyncLocalStorage();

// Log levels and colors
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'white',
  silly: 'grey'
};

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, correlationId, userId, sessionId, workflowId, taskId, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      message,
      service,
      correlationId,
      userId,
      sessionId,
      workflowId,
      taskId,
      ...meta
    };
    
    // Remove undefined values
    Object.keys(logEntry).forEach(key => 
      logEntry[key] === undefined && delete logEntry[key]
    );
    
    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service, correlationId, workflowId, taskId, ...meta }) => {
    let logLine = `${timestamp} [${level}] ${service ? `[${service}]` : ''} ${message}`;
    
    if (correlationId) logLine += ` | correlation: ${correlationId}`;
    if (workflowId) logLine += ` | workflow: ${workflowId}`;
    if (taskId) logLine += ` | task: ${taskId}`;
    
    if (Object.keys(meta).length > 0) {
      logLine += ` | ${JSON.stringify(meta)}`;
    }
    
    return logLine;
  })
);

// Create transports
const createTransports = () => {
  const transports = [];
  
  // Console transport
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_CONSOLE_LOGS === 'true') {
    transports.push(
      new winston.transports.Console({
        level: process.env.LOG_LEVEL || 'info',
        format: consoleFormat,
        handleExceptions: true,
        handleRejections: true
      })
    );
  }
  
  // File transports for production
  if (process.env.NODE_ENV === 'production') {
    // Application logs
    transports.push(
      new winston.transports.DailyRotateFile({
        filename: 'logs/application-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '100m',
        maxFiles: '30d',
        format: logFormat,
        level: 'info'
      })
    );
    
    // Error logs
    transports.push(
      new winston.transports.DailyRotateFile({
        filename: 'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '50m',
        maxFiles: '60d',
        format: logFormat,
        level: 'error'
      })
    );
    
    // HTTP logs
    transports.push(
      new winston.transports.DailyRotateFile({
        filename: 'logs/http-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '200m',
        maxFiles: '14d',
        format: logFormat,
        level: 'http'
      })
    );
    
    // Debug logs (short retention)
    transports.push(
      new winston.transports.DailyRotateFile({
        filename: 'logs/debug-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '500m',
        maxFiles: '7d',
        format: logFormat,
        level: 'debug'
      })
    );
  }
  
  return transports;
};

// Create main logger
const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: createTransports(),
  exitOnError: false,
  silent: process.env.NODE_ENV === 'test'
});

// Add colors
winston.addColors(logColors);

// Context-aware logger class
class ContextLogger {
  constructor(defaultContext = {}) {
    this.defaultContext = defaultContext;
  }

  _getContext() {
    const asyncContext = asyncLocalStorage.getStore() || {};
    return {
      ...this.defaultContext,
      ...asyncContext
    };
  }

  _log(level, message, meta = {}) {
    const context = this._getContext();
    const logData = {
      ...context,
      ...meta
    };
    
    // Record metrics for errors and warnings
    if (level === 'error') {
      metricsCollector.recordAlert('log_error', 'error', logData.service || 'unknown');
    } else if (level === 'warn') {
      metricsCollector.recordAlert('log_warning', 'warning', logData.service || 'unknown');
    }
    
    logger.log(level, message, logData);
  }

  error(message, meta = {}) {
    this._log('error', message, meta);
  }

  warn(message, meta = {}) {
    this._log('warn', message, meta);
  }

  info(message, meta = {}) {
    this._log('info', message, meta);
  }

  http(message, meta = {}) {
    this._log('http', message, meta);
  }

  verbose(message, meta = {}) {
    this._log('verbose', message, meta);
  }

  debug(message, meta = {}) {
    this._log('debug', message, meta);
  }

  silly(message, meta = {}) {
    this._log('silly', message, meta);
  }

  // Workflow-specific logging
  workflow(workflowId, message, meta = {}) {
    this._log('info', message, { ...meta, workflowId, logType: 'workflow' });
  }

  // Task-specific logging
  task(taskId, message, meta = {}) {
    this._log('info', message, { ...meta, taskId, logType: 'task' });
  }

  // API call logging
  apiCall(provider, endpoint, message, meta = {}) {
    this._log('info', message, { 
      ...meta, 
      apiProvider: provider, 
      apiEndpoint: endpoint, 
      logType: 'api_call' 
    });
  }

  // Campaign logging
  campaign(campaignId, message, meta = {}) {
    this._log('info', message, { ...meta, campaignId, logType: 'campaign' });
  }

  // Database logging
  database(operation, table, message, meta = {}) {
    this._log('debug', message, { 
      ...meta, 
      dbOperation: operation, 
      dbTable: table, 
      logType: 'database' 
    });
  }

  // Performance logging
  performance(operation, duration, message, meta = {}) {
    this._log('info', message, { 
      ...meta, 
      operation, 
      duration, 
      logType: 'performance' 
    });
  }

  // Security logging
  security(event, message, meta = {}) {
    this._log('warn', message, { 
      ...meta, 
      securityEvent: event, 
      logType: 'security' 
    });
  }

  // Create child logger with additional context
  child(additionalContext) {
    const newContext = {
      ...this.defaultContext,
      ...additionalContext
    };
    return new ContextLogger(newContext);
  }
}

// Middleware for Express.js request correlation
const createCorrelationMiddleware = () => {
  return (req, res, next) => {
    const correlationId = req.headers['x-correlation-id'] || uuidv4();
    const sessionId = req.headers['x-session-id'] || req.sessionID;
    const userId = req.user?.id || req.headers['x-user-id'];
    
    // Set correlation ID in response headers
    res.setHeader('x-correlation-id', correlationId);
    
    // Create context for async local storage
    const context = {
      correlationId,
      sessionId,
      userId,
      requestId: uuidv4(),
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress,
      method: req.method,
      url: req.url
    };
    
    asyncLocalStorage.run(context, () => {
      // Log request start
      const contextLogger = new ContextLogger();
      contextLogger.http('Request started', {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        contentLength: req.headers['content-length']
      });
      
      next();
    });
  };
};

// Middleware for Little Horse workflow correlation
const createWorkflowCorrelationMiddleware = (workflowId) => {
  return (req, res, next) => {
    const existingContext = asyncLocalStorage.getStore() || {};
    const workflowContext = {
      ...existingContext,
      workflowId
    };
    
    asyncLocalStorage.run(workflowContext, next);
  };
};

// Error logging middleware
const createErrorLoggingMiddleware = () => {
  return (error, req, res, next) => {
    const contextLogger = new ContextLogger();
    
    contextLogger.error('Unhandled error', {
      error: error.message,
      stack: error.stack,
      method: req.method,
      url: req.url,
      statusCode: error.statusCode || 500,
      errorType: error.constructor.name
    });
    
    next(error);
  };
};

// Structured logging for API calls
const logAPICall = async (provider, endpoint, operation, duration, statusCode, metadata = {}) => {
  const contextLogger = new ContextLogger();
  
  contextLogger.apiCall(provider, endpoint, `API call ${operation}`, {
    duration,
    statusCode,
    success: statusCode >= 200 && statusCode < 300,
    ...metadata
  });
};

// Structured logging for workflow events
const logWorkflowEvent = (workflowId, event, metadata = {}) => {
  const contextLogger = new ContextLogger();
  
  contextLogger.workflow(workflowId, `Workflow ${event}`, {
    event,
    ...metadata
  });
};

// Structured logging for task events
const logTaskEvent = (taskId, event, metadata = {}) => {
  const contextLogger = new ContextLogger();
  
  contextLogger.task(taskId, `Task ${event}`, {
    event,
    ...metadata
  });
};

// Log aggregation helper
class LogAggregator {
  constructor(windowMs = 60000) { // 1 minute window
    this.windowMs = windowMs;
    this.counts = new Map();
    this.cleanup();
  }

  increment(key, tags = {}) {
    const now = Date.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const aggregateKey = `${key}:${JSON.stringify(tags)}`;
    
    if (!this.counts.has(aggregateKey)) {
      this.counts.set(aggregateKey, { count: 0, windowStart, key, tags });
    }
    
    this.counts.get(aggregateKey).count++;
  }

  flush() {
    const results = Array.from(this.counts.values());
    this.counts.clear();
    return results;
  }

  cleanup() {
    setInterval(() => {
      const now = Date.now();
      const cutoff = now - this.windowMs * 2;
      
      for (const [key, data] of this.counts.entries()) {
        if (data.windowStart < cutoff) {
          this.counts.delete(key);
        }
      }
    }, this.windowMs);
  }
}

// Create default logger instances
const defaultLogger = new ContextLogger({ service: 'connexio-ai' });
const logAggregator = new LogAggregator();

// Export functions to create specific loggers
const createLogger = (context = {}) => new ContextLogger(context);
const createServiceLogger = (serviceName) => new ContextLogger({ service: serviceName });

export {
  logger,
  ContextLogger,
  createLogger,
  createServiceLogger,
  createCorrelationMiddleware,
  createWorkflowCorrelationMiddleware,
  createErrorLoggingMiddleware,
  logAPICall,
  logWorkflowEvent,
  logTaskEvent,
  logAggregator,
  LogAggregator,
  asyncLocalStorage
};

export default defaultLogger;