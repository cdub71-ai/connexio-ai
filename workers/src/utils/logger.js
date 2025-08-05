import winston from 'winston';
import config from '../config/index.js';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, service, taskId, workflowId, ...meta }) => {
    let logMessage = `${timestamp} [${level.toUpperCase()}]`;
    
    if (service) logMessage += ` [${service}]`;
    if (taskId) logMessage += ` [task:${taskId}]`;
    if (workflowId) logMessage += ` [workflow:${workflowId}]`;
    
    logMessage += `: ${message}`;
    
    // Add metadata if present
    const metaKeys = Object.keys(meta);
    if (metaKeys.length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Console transport with colors
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    logFormat
  )
});

// File transport for errors
const errorFileTransport = new winston.transports.File({
  filename: 'logs/error.log',
  level: 'error',
  format: logFormat,
  maxsize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
});

// File transport for all logs
const combinedFileTransport = new winston.transports.File({
  filename: 'logs/combined.log',
  format: logFormat,
  maxsize: 10 * 1024 * 1024, // 10MB
  maxFiles: 10,
});

// Create logger instance
const logger = winston.createLogger({
  level: config.app.logLevel,
  defaultMeta: { 
    service: config.app.workerName,
    pid: process.pid,
    nodeEnv: config.app.nodeEnv
  },
  transports: [
    consoleTransport,
    errorFileTransport,
    combinedFileTransport,
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ],
  // Handle unhandled rejections
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ]
});

// Enhanced logging methods with context
export const createContextLogger = (context = {}) => {
  return {
    debug: (message, meta = {}) => logger.debug(message, { ...context, ...meta }),
    info: (message, meta = {}) => logger.info(message, { ...context, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { ...context, ...meta }),
    error: (message, meta = {}) => logger.error(message, { ...context, ...meta }),
    
    // Specialized logging methods
    taskStart: (taskId, workflowId, input) => {
      logger.info('Task started', {
        ...context,
        taskId,
        workflowId,
        inputSize: JSON.stringify(input).length,
        event: 'task_start'
      });
    },
    
    taskComplete: (taskId, workflowId, output, duration) => {
      logger.info('Task completed', {
        ...context,
        taskId,
        workflowId,
        outputSize: JSON.stringify(output).length,
        durationMs: duration,
        event: 'task_complete'
      });
    },
    
    taskError: (taskId, workflowId, error, duration) => {
      logger.error('Task failed', {
        ...context,
        taskId,
        workflowId,
        error: error.message,
        errorStack: error.stack,
        durationMs: duration,
        event: 'task_error'
      });
    },
    
    apiCall: (method, url, statusCode, duration, requestId) => {
      const level = statusCode >= 400 ? 'error' : 'info';
      logger[level]('API call', {
        ...context,
        method,
        url,
        statusCode,
        durationMs: duration,
        requestId,
        event: 'api_call'
      });
    },
    
    rateLimitHit: (service, retryAfter) => {
      logger.warn('Rate limit hit', {
        ...context,
        service,
        retryAfterMs: retryAfter,
        event: 'rate_limit'
      });
    },
    
    retryAttempt: (attempt, maxRetries, error, delay) => {
      logger.warn('Retry attempt', {
        ...context,
        attempt,
        maxRetries,
        error: error.message,
        delayMs: delay,
        event: 'retry_attempt'
      });
    },
    
    workerHealth: (status, metrics) => {
      logger.info('Worker health check', {
        ...context,
        status,
        ...metrics,
        event: 'worker_health'
      });
    }
  };
};

// Default logger instance
export const defaultLogger = createContextLogger();

// Performance timing utility
export const createTimer = (label) => {
  const start = Date.now();
  return {
    end: () => Date.now() - start,
    log: (logger, message, meta = {}) => {
      const duration = Date.now() - start;
      logger.info(message, { ...meta, durationMs: duration, timing: label });
    }
  };
};

// Structured error logging
export const logError = (error, context = {}) => {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code,
    statusCode: error.statusCode,
    ...context
  };
  
  // Log different error types at different levels
  if (error.statusCode >= 500 || !error.statusCode) {
    logger.error('System error', errorInfo);
  } else if (error.statusCode >= 400) {
    logger.warn('Client error', errorInfo);
  } else {
    logger.info('Handled error', errorInfo);
  }
};

// Request/response logging for debugging
export const logRequestResponse = (requestId, request, response, duration) => {
  if (config.app.logLevel === 'debug') {
    logger.debug('Request/Response details', {
      requestId,
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers,
        bodySize: request.body ? JSON.stringify(request.body).length : 0
      },
      response: {
        status: response.status,
        headers: response.headers,
        bodySize: response.data ? JSON.stringify(response.data).length : 0
      },
      durationMs: duration
    });
  }
};

export default logger;