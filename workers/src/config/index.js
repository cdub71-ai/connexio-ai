import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config();

// Configuration schema validation
const configSchema = Joi.object({
  // Little Horse configuration
  littlehorse: Joi.object({
    apiHost: Joi.string().default('localhost'),
    apiPort: Joi.number().integer().min(1).max(65535).default(2023),
    clientId: Joi.string().optional(),
    clientSecret: Joi.string().optional(),
  }).required(),

  // Anthropic Claude API configuration
  anthropic: Joi.object({
    apiKey: Joi.string().required(),
    baseUrl: Joi.string().uri().default('https://api.anthropic.com'),
    model: Joi.string().default('claude-3-haiku-20240307'),
    maxTokens: Joi.number().integer().min(1).max(4096).default(1024),
    temperature: Joi.number().min(0).max(1).default(0.3),
    timeout: Joi.number().integer().min(1000).default(30000),
  }).required(),

  // Rate limiting configuration
  rateLimit: Joi.object({
    maxConcurrent: Joi.number().integer().min(1).default(5),
    intervalCap: Joi.number().integer().min(1).default(100),
    interval: Joi.number().integer().min(1000).default(60000), // 1 minute
    maxRetries: Joi.number().integer().min(0).default(3),
    retryDelay: Joi.number().integer().min(100).default(1000),
  }).required(),

  // Application configuration
  app: Joi.object({
    nodeEnv: Joi.string().valid('development', 'production', 'test').default('development'),
    logLevel: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    workerName: Joi.string().default('claude-api-worker'),
  }).required(),

  // Task worker configuration
  worker: Joi.object({
    taskName: Joi.string().default('parse-marketing-command'),
    maxConcurrentTasks: Joi.number().integer().min(1).default(10),
    heartbeatIntervalMs: Joi.number().integer().min(1000).default(5000),
    taskTimeoutMs: Joi.number().integer().min(5000).default(30000),
  }).required(),

  // Slack integration configuration
  slack: Joi.object({
    botToken: Joi.string().required(),
    signingSecret: Joi.string().required(),
    appToken: Joi.string().optional(),
    allowedTeams: Joi.array().items(Joi.string()).default([]),
    port: Joi.number().integer().min(1).max(65535).default(3000),
  }).required(),

  // Twilio SMS/MMS configuration
  twilio: Joi.object({
    accountSid: Joi.string().required(),
    authToken: Joi.string().required(),
    messagingServiceSid: Joi.string().optional(),
    maxConcurrent: Joi.number().integer().min(1).default(10),
    intervalCap: Joi.number().integer().min(1).default(100),
    interval: Joi.number().integer().min(1000).default(60000),
    timeout: Joi.number().integer().min(1000).default(30000),
  }).required(),

  // Sureshot Eloqua configuration
  sureshot: Joi.object({
    baseUrl: Joi.string().uri().default('https://api.sureshot.com'),
    apiKey: Joi.string().required(),
    eloquaInstance: Joi.string().required(),
    eloquaUser: Joi.string().required(),
    eloquaPassword: Joi.string().required(),
    maxConcurrent: Joi.number().integer().min(1).default(5),
    intervalCap: Joi.number().integer().min(1).default(50),
    interval: Joi.number().integer().min(1000).default(60000),
    timeout: Joi.number().integer().min(1000).default(30000),
    defaultFolderId: Joi.string().optional(),
    defaultTimeZone: Joi.string().default('UTC'),
  }).required(),

  // Apollo API configuration
  apollo: Joi.object({
    apiKey: Joi.string().required(),
    baseUrl: Joi.string().uri().default('https://api.apollo.io/v1'),
    maxConcurrent: Joi.number().integer().min(1).default(2),
    intervalCap: Joi.number().integer().min(1).default(60),
    interval: Joi.number().integer().min(1000).default(60000),
    timeout: Joi.number().integer().min(1000).default(30000),
  }).required(),

  // Leadspace API configuration
  leadspace: Joi.object({
    apiKey: Joi.string().required(),
    customerId: Joi.string().required(),
    baseUrl: Joi.string().uri().default('https://api.leadspace.com/v2'),
    maxConcurrent: Joi.number().integer().min(1).default(3),
    intervalCap: Joi.number().integer().min(1).default(100),
    interval: Joi.number().integer().min(1000).default(60000),
    timeout: Joi.number().integer().min(1000).default(30000),
  }).required(),

  // Data enrichment configuration
  dataEnrichment: Joi.object({
    maxConcurrent: Joi.number().integer().min(1).default(5),
    intervalCap: Joi.number().integer().min(1).default(200),
    interval: Joi.number().integer().min(1000).default(60000),
    defaultStrategy: Joi.string().valid('comprehensive', 'fast', 'costEffective', 'validation').default('comprehensive'),
    enableCreditMonitoring: Joi.boolean().default(true),
    maxCreditsPerHour: Joi.number().integer().min(0).default(1000),
  }).required(),

  // Real-time synchronization configuration
  realtimeSync: Joi.object({
    syncInterval: Joi.number().integer().min(60000).default(300000), // 5 minutes
    batchSize: Joi.number().integer().min(1).default(100),
    maxRetries: Joi.number().integer().min(0).default(3),
    conflictResolution: Joi.string().valid('latest_wins', 'manual', 'priority_based').default('latest_wins'),
    enableChangeDetection: Joi.boolean().default(true),
    strategies: Joi.array().items(
      Joi.string().valid('incremental', 'full', 'selective', 'realtime')
    ).default(['incremental', 'full']),
  }).required(),

  // Error recovery configuration
  errorRecovery: Joi.object({
    circuitBreaker: Joi.object({
      failureThreshold: Joi.number().integer().min(1).default(5),
      timeout: Joi.number().integer().min(1000).default(60000),
      resetTimeout: Joi.number().integer().min(1000).default(300000),
    }).required(),
    retry: Joi.object({
      maxRetries: Joi.number().integer().min(0).default(3),
      baseDelay: Joi.number().integer().min(100).default(1000),
      maxDelay: Joi.number().integer().min(1000).default(30000),
      backoffFactor: Joi.number().min(1).default(2),
    }).required(),
    analysis: Joi.object({
      windowSize: Joi.number().integer().min(10).default(100),
      patternThreshold: Joi.number().min(0).max(1).default(0.3),
    }).required(),
    healthCheck: Joi.object({
      interval: Joi.number().integer().min(1000).default(30000),
      timeout: Joi.number().integer().min(1000).default(5000),
    }).required(),
  }).required(),
}).required();

// Raw configuration from environment
const rawConfig = {
  littlehorse: {
    apiHost: process.env.LITTLEHORSE_API_HOST || 'localhost',
    apiPort: parseInt(process.env.LITTLEHORSE_API_PORT) || 2023,
    clientId: process.env.LITTLEHORSE_CLIENT_ID,
    clientSecret: process.env.LITTLEHORSE_CLIENT_SECRET,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
    maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS) || 1024,
    temperature: parseFloat(process.env.ANTHROPIC_TEMPERATURE) || 0.3,
    timeout: parseInt(process.env.ANTHROPIC_TIMEOUT) || 30000,
  },
  rateLimit: {
    maxConcurrent: parseInt(process.env.RATE_LIMIT_MAX_CONCURRENT) || 5,
    intervalCap: parseInt(process.env.RATE_LIMIT_INTERVAL_CAP) || 100,
    interval: parseInt(process.env.RATE_LIMIT_INTERVAL) || 60000,
    maxRetries: parseInt(process.env.RATE_LIMIT_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.RATE_LIMIT_RETRY_DELAY) || 1000,
  },
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    workerName: process.env.WORKER_NAME || 'claude-api-worker',
  },
  worker: {
    taskName: process.env.TASK_NAME || 'parse-marketing-command',
    maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS) || 10,
    heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS) || 5000,
    taskTimeoutMs: parseInt(process.env.TASK_TIMEOUT_MS) || 30000,
  },
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
    allowedTeams: process.env.SLACK_ALLOWED_TEAMS ? process.env.SLACK_ALLOWED_TEAMS.split(',') : [],
    port: parseInt(process.env.SLACK_PORT) || 3000,
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
    maxConcurrent: parseInt(process.env.TWILIO_MAX_CONCURRENT) || 10,
    intervalCap: parseInt(process.env.TWILIO_INTERVAL_CAP) || 100,
    interval: parseInt(process.env.TWILIO_INTERVAL) || 60000,
    timeout: parseInt(process.env.TWILIO_TIMEOUT) || 30000,
  },
  sureshot: {
    baseUrl: process.env.SURESHOT_BASE_URL || 'https://api.sureshot.com',
    apiKey: process.env.SURESHOT_API_KEY,
    eloquaInstance: process.env.SURESHOT_ELOQUA_INSTANCE,
    eloquaUser: process.env.SURESHOT_ELOQUA_USER,
    eloquaPassword: process.env.SURESHOT_ELOQUA_PASSWORD,
    maxConcurrent: parseInt(process.env.SURESHOT_MAX_CONCURRENT) || 5,
    intervalCap: parseInt(process.env.SURESHOT_INTERVAL_CAP) || 50,
    interval: parseInt(process.env.SURESHOT_INTERVAL) || 60000,
    timeout: parseInt(process.env.SURESHOT_TIMEOUT) || 30000,
    defaultFolderId: process.env.SURESHOT_DEFAULT_FOLDER_ID,
    defaultTimeZone: process.env.SURESHOT_DEFAULT_TIME_ZONE || 'UTC',
  },
  apollo: {
    apiKey: process.env.APOLLO_API_KEY,
    baseUrl: process.env.APOLLO_BASE_URL || 'https://api.apollo.io/v1',
    maxConcurrent: parseInt(process.env.APOLLO_MAX_CONCURRENT) || 2,
    intervalCap: parseInt(process.env.APOLLO_INTERVAL_CAP) || 60,
    interval: parseInt(process.env.APOLLO_INTERVAL) || 60000,
    timeout: parseInt(process.env.APOLLO_TIMEOUT) || 30000,
  },
  leadspace: {
    apiKey: process.env.LEADSPACE_API_KEY,
    customerId: process.env.LEADSPACE_CUSTOMER_ID,
    baseUrl: process.env.LEADSPACE_BASE_URL || 'https://api.leadspace.com/v2',
    maxConcurrent: parseInt(process.env.LEADSPACE_MAX_CONCURRENT) || 3,
    intervalCap: parseInt(process.env.LEADSPACE_INTERVAL_CAP) || 100,
    interval: parseInt(process.env.LEADSPACE_INTERVAL) || 60000,
    timeout: parseInt(process.env.LEADSPACE_TIMEOUT) || 30000,
  },
  dataEnrichment: {
    maxConcurrent: parseInt(process.env.DATA_ENRICHMENT_MAX_CONCURRENT) || 5,
    intervalCap: parseInt(process.env.DATA_ENRICHMENT_INTERVAL_CAP) || 200,
    interval: parseInt(process.env.DATA_ENRICHMENT_INTERVAL) || 60000,
    defaultStrategy: process.env.DATA_ENRICHMENT_DEFAULT_STRATEGY || 'comprehensive',
    enableCreditMonitoring: process.env.DATA_ENRICHMENT_ENABLE_CREDIT_MONITORING !== 'false',
    maxCreditsPerHour: parseInt(process.env.DATA_ENRICHMENT_MAX_CREDITS_PER_HOUR) || 1000,
  },
  realtimeSync: {
    syncInterval: parseInt(process.env.REALTIME_SYNC_INTERVAL) || 300000,
    batchSize: parseInt(process.env.REALTIME_SYNC_BATCH_SIZE) || 100,
    maxRetries: parseInt(process.env.REALTIME_SYNC_MAX_RETRIES) || 3,
    conflictResolution: process.env.REALTIME_SYNC_CONFLICT_RESOLUTION || 'latest_wins',
    enableChangeDetection: process.env.REALTIME_SYNC_ENABLE_CHANGE_DETECTION !== 'false',
    strategies: process.env.REALTIME_SYNC_STRATEGIES 
      ? process.env.REALTIME_SYNC_STRATEGIES.split(',') 
      : ['incremental', 'full'],
  },
  errorRecovery: {
    circuitBreaker: {
      failureThreshold: parseInt(process.env.ERROR_RECOVERY_CIRCUIT_BREAKER_FAILURE_THRESHOLD) || 5,
      timeout: parseInt(process.env.ERROR_RECOVERY_CIRCUIT_BREAKER_TIMEOUT) || 60000,
      resetTimeout: parseInt(process.env.ERROR_RECOVERY_CIRCUIT_BREAKER_RESET_TIMEOUT) || 300000,
    },
    retry: {
      maxRetries: parseInt(process.env.ERROR_RECOVERY_RETRY_MAX_RETRIES) || 3,
      baseDelay: parseInt(process.env.ERROR_RECOVERY_RETRY_BASE_DELAY) || 1000,
      maxDelay: parseInt(process.env.ERROR_RECOVERY_RETRY_MAX_DELAY) || 30000,
      backoffFactor: parseFloat(process.env.ERROR_RECOVERY_RETRY_BACKOFF_FACTOR) || 2,
    },
    analysis: {
      windowSize: parseInt(process.env.ERROR_RECOVERY_ANALYSIS_WINDOW_SIZE) || 100,
      patternThreshold: parseFloat(process.env.ERROR_RECOVERY_ANALYSIS_PATTERN_THRESHOLD) || 0.3,
    },
    healthCheck: {
      interval: parseInt(process.env.ERROR_RECOVERY_HEALTH_CHECK_INTERVAL) || 30000,
      timeout: parseInt(process.env.ERROR_RECOVERY_HEALTH_CHECK_TIMEOUT) || 5000,
    },
  },
};

// Validate configuration
const { error, value: config } = configSchema.validate(rawConfig, {
  abortEarly: false,
  stripUnknown: true,
});

if (error) {
  const errorMessages = error.details.map(detail => detail.message).join(', ');
  throw new Error(`Configuration validation failed: ${errorMessages}`);
}

export default config;