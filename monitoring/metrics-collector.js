/**
 * Comprehensive Metrics Collection System for Connexio AI
 * Provides production-ready observability with Prometheus metrics
 */

import client from 'prom-client';
import express from 'express';
import { createContextLogger } from '../workers/src/utils/logger.js';

const logger = createContextLogger({ service: 'metrics-collector' });

// Initialize Prometheus registry
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'connexio_ai_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  eventLoopMonitoringPrecision: 5,
});

// Custom Metrics Definitions
const metrics = {
  // HTTP Request Metrics
  httpRequestDuration: new client.Histogram({
    name: 'connexio_ai_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code', 'service'],
    buckets: [0.001, 0.005, 0.015, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5, 10],
    registers: [register],
  }),

  httpRequestsTotal: new client.Counter({
    name: 'connexio_ai_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code', 'service'],
    registers: [register],
  }),

  httpActiveConnections: new client.Gauge({
    name: 'connexio_ai_http_active_connections',
    help: 'Number of active HTTP connections',
    labelNames: ['service'],
    registers: [register],
  }),

  // Little Horse Workflow Metrics
  workflowsTotal: new client.Counter({
    name: 'connexio_ai_workflows_total',
    help: 'Total number of workflows',
    labelNames: ['workflow_name', 'status', 'version'],
    registers: [register],
  }),

  workflowDuration: new client.Histogram({
    name: 'connexio_ai_workflow_duration_seconds',
    help: 'Duration of workflow execution in seconds',
    labelNames: ['workflow_name', 'status', 'version'],
    buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600],
    registers: [register],
  }),

  activeWorkflows: new client.Gauge({
    name: 'connexio_ai_active_workflows',
    help: 'Number of currently active workflows',
    labelNames: ['workflow_name'],
    registers: [register],
  }),

  workflowErrors: new client.Counter({
    name: 'connexio_ai_workflow_errors_total',
    help: 'Total number of workflow errors',
    labelNames: ['workflow_name', 'error_type', 'task_name'],
    registers: [register],
  }),

  // Task Worker Metrics
  taskExecutionDuration: new client.Histogram({
    name: 'connexio_ai_task_execution_duration_seconds',
    help: 'Duration of task execution in seconds',
    labelNames: ['task_name', 'worker_type', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    registers: [register],
  }),

  tasksTotal: new client.Counter({
    name: 'connexio_ai_tasks_total',
    help: 'Total number of tasks processed',
    labelNames: ['task_name', 'worker_type', 'status'],
    registers: [register],
  }),

  workerHealth: new client.Gauge({
    name: 'connexio_ai_worker_health',
    help: 'Worker health status (1 = healthy, 0 = unhealthy)',
    labelNames: ['worker_id', 'worker_type', 'region'],
    registers: [register],
  }),

  workerQueueDepth: new client.Gauge({
    name: 'connexio_ai_worker_queue_depth',
    help: 'Number of tasks in worker queues',
    labelNames: ['queue_name', 'worker_type'],
    registers: [register],
  }),

  workerMemoryUsage: new client.Gauge({
    name: 'connexio_ai_worker_memory_usage_bytes',
    help: 'Worker memory usage in bytes',
    labelNames: ['worker_id', 'worker_type'],
    registers: [register],
  }),

  workerCpuUsage: new client.Gauge({
    name: 'connexio_ai_worker_cpu_usage_percent',
    help: 'Worker CPU usage percentage',
    labelNames: ['worker_id', 'worker_type'],
    registers: [register],
  }),

  // API Integration Metrics
  apiRequestDuration: new client.Histogram({
    name: 'connexio_ai_api_request_duration_seconds',
    help: 'Duration of external API requests in seconds',
    labelNames: ['api_provider', 'endpoint', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [register],
  }),

  apiRequestsTotal: new client.Counter({
    name: 'connexio_ai_api_requests_total',
    help: 'Total number of external API requests',
    labelNames: ['api_provider', 'endpoint', 'status_code'],
    registers: [register],
  }),

  apiRateLimitHits: new client.Counter({
    name: 'connexio_ai_api_rate_limit_hits_total',
    help: 'Total number of API rate limit hits',
    labelNames: ['api_provider', 'endpoint'],
    registers: [register],
  }),

  apiQuotaUsage: new client.Gauge({
    name: 'connexio_ai_api_quota_usage_percent',
    help: 'API quota usage percentage',
    labelNames: ['api_provider', 'quota_type'],
    registers: [register],
  }),

  apiCosts: new client.Counter({
    name: 'connexio_ai_api_costs_total',
    help: 'Total API costs in USD',
    labelNames: ['api_provider', 'cost_type'],
    registers: [register],
  }),

  // Campaign Metrics
  campaignsTotal: new client.Counter({
    name: 'connexio_ai_campaigns_total',
    help: 'Total number of campaigns',
    labelNames: ['campaign_type', 'channel', 'status'],
    registers: [register],
  }),

  campaignDuration: new client.Histogram({
    name: 'connexio_ai_campaign_duration_seconds',
    help: 'Duration of campaign execution in seconds',
    labelNames: ['campaign_type', 'channel'],
    buckets: [60, 300, 600, 1800, 3600, 7200, 14400, 28800, 86400],
    registers: [register],
  }),

  activeCampaigns: new client.Gauge({
    name: 'connexio_ai_active_campaigns',
    help: 'Number of currently active campaigns',
    labelNames: ['campaign_type', 'channel'],
    registers: [register],
  }),

  campaignReachTotal: new client.Counter({
    name: 'connexio_ai_campaign_reach_total',
    help: 'Total campaign reach (messages sent)',
    labelNames: ['campaign_type', 'channel', 'status'],
    registers: [register],
  }),

  campaignEngagement: new client.Counter({
    name: 'connexio_ai_campaign_engagement_total',
    help: 'Total campaign engagement events',
    labelNames: ['campaign_type', 'channel', 'engagement_type'],
    registers: [register],
  }),

  // Database Metrics
  databaseConnections: new client.Gauge({
    name: 'connexio_ai_database_connections',
    help: 'Number of database connections',
    labelNames: ['database', 'status'],
    registers: [register],
  }),

  databaseQueryDuration: new client.Histogram({
    name: 'connexio_ai_database_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['database', 'operation', 'table'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register],
  }),

  databaseErrors: new client.Counter({
    name: 'connexio_ai_database_errors_total',
    help: 'Total number of database errors',
    labelNames: ['database', 'error_type'],
    registers: [register],
  }),

  // Cache Metrics
  cacheHits: new client.Counter({
    name: 'connexio_ai_cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['cache_type', 'key_pattern'],
    registers: [register],
  }),

  cacheMisses: new client.Counter({
    name: 'connexio_ai_cache_misses_total',
    help: 'Total number of cache misses',
    labelNames: ['cache_type', 'key_pattern'],
    registers: [register],
  }),

  cacheSize: new client.Gauge({
    name: 'connexio_ai_cache_size_bytes',
    help: 'Cache size in bytes',
    labelNames: ['cache_type'],
    registers: [register],
  }),

  // System Health Metrics
  systemHealth: new client.Gauge({
    name: 'connexio_ai_system_health',
    help: 'Overall system health score (0-1)',
    registers: [register],
  }),

  serviceUptime: new client.Counter({
    name: 'connexio_ai_service_uptime_seconds',
    help: 'Service uptime in seconds',
    labelNames: ['service', 'version'],
    registers: [register],
  }),

  alertsTotal: new client.Counter({
    name: 'connexio_ai_alerts_total',
    help: 'Total number of alerts triggered',
    labelNames: ['alert_type', 'severity', 'service'],
    registers: [register],
  }),
};

class MetricsCollector {
  constructor() {
    this.startTime = Date.now();
    this.collectionInterval = null;
    this.systemMetrics = new Map();
  }

  // HTTP Middleware for request metrics
  createHTTPMiddleware(serviceName = 'unknown') {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Track active connections
      metrics.httpActiveConnections.inc({ service: serviceName });
      
      // Override res.end to capture metrics
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = (Date.now() - startTime) / 1000;
        const route = req.route?.path || req.path || 'unknown';
        
        // Record metrics
        metrics.httpRequestDuration.observe(
          { method: req.method, route, status_code: res.statusCode, service: serviceName },
          duration
        );
        
        metrics.httpRequestsTotal.inc({
          method: req.method,
          route,
          status_code: res.statusCode,
          service: serviceName
        });
        
        metrics.httpActiveConnections.dec({ service: serviceName });
        
        originalEnd.apply(this, args);
      };
      
      next();
    };
  }

  // Record workflow metrics
  recordWorkflowStart(workflowName, version = '1.0') {
    metrics.activeWorkflows.inc({ workflow_name: workflowName });
    metrics.workflowsTotal.inc({ workflow_name: workflowName, status: 'started', version });
  }

  recordWorkflowComplete(workflowName, duration, status = 'completed', version = '1.0') {
    metrics.activeWorkflows.dec({ workflow_name: workflowName });
    metrics.workflowsTotal.inc({ workflow_name: workflowName, status, version });
    metrics.workflowDuration.observe({ workflow_name: workflowName, status, version }, duration);
  }

  recordWorkflowError(workflowName, errorType, taskName = 'unknown') {
    metrics.workflowErrors.inc({ workflow_name: workflowName, error_type: errorType, task_name: taskName });
  }

  // Record task metrics
  recordTaskExecution(taskName, workerType, duration, status = 'completed') {
    metrics.tasksTotal.inc({ task_name: taskName, worker_type: workerType, status });
    metrics.taskExecutionDuration.observe({ task_name: taskName, worker_type: workerType, status }, duration);
  }

  // Record worker health
  recordWorkerHealth(workerId, workerType, isHealthy, region = 'unknown') {
    metrics.workerHealth.set({ worker_id: workerId, worker_type: workerType, region }, isHealthy ? 1 : 0);
  }

  // Record queue depth
  recordQueueDepth(queueName, workerType, depth) {
    metrics.workerQueueDepth.set({ queue_name: queueName, worker_type: workerType }, depth);
  }

  // Record API metrics
  recordAPIRequest(provider, endpoint, duration, statusCode) {
    metrics.apiRequestsTotal.inc({ api_provider: provider, endpoint, status_code: statusCode });
    metrics.apiRequestDuration.observe({ api_provider: provider, endpoint, status_code: statusCode }, duration);
  }

  recordAPIRateLimit(provider, endpoint) {
    metrics.apiRateLimitHits.inc({ api_provider: provider, endpoint });
  }

  recordAPIQuotaUsage(provider, quotaType, usagePercent) {
    metrics.apiQuotaUsage.set({ api_provider: provider, quota_type: quotaType }, usagePercent);
  }

  recordAPICost(provider, costType, amount) {
    metrics.apiCosts.inc({ api_provider: provider, cost_type: costType }, amount);
  }

  // Record campaign metrics
  recordCampaignStart(campaignType, channel) {
    metrics.activeCampaigns.inc({ campaign_type: campaignType, channel });
    metrics.campaignsTotal.inc({ campaign_type: campaignType, channel, status: 'started' });
  }

  recordCampaignComplete(campaignType, channel, duration, status = 'completed') {
    metrics.activeCampaigns.dec({ campaign_type: campaignType, channel });
    metrics.campaignsTotal.inc({ campaign_type: campaignType, channel, status });
    metrics.campaignDuration.observe({ campaign_type: campaignType, channel }, duration);
  }

  recordCampaignReach(campaignType, channel, count, status = 'sent') {
    metrics.campaignReachTotal.inc({ campaign_type: campaignType, channel, status }, count);
  }

  recordCampaignEngagement(campaignType, channel, engagementType, count = 1) {
    metrics.campaignEngagement.inc({ campaign_type: campaignType, channel, engagement_type: engagementType }, count);
  }

  // Record database metrics
  recordDatabaseConnections(database, activeConnections, idleConnections) {
    metrics.databaseConnections.set({ database, status: 'active' }, activeConnections);
    metrics.databaseConnections.set({ database, status: 'idle' }, idleConnections);
  }

  recordDatabaseQuery(database, operation, table, duration) {
    metrics.databaseQueryDuration.observe({ database, operation, table }, duration);
  }

  recordDatabaseError(database, errorType) {
    metrics.databaseErrors.inc({ database, error_type: errorType });
  }

  // Record cache metrics
  recordCacheHit(cacheType, keyPattern) {
    metrics.cacheHits.inc({ cache_type: cacheType, key_pattern: keyPattern });
  }

  recordCacheMiss(cacheType, keyPattern) {
    metrics.cacheMisses.inc({ cache_type: cacheType, key_pattern: keyPattern });
  }

  recordCacheSize(cacheType, sizeBytes) {
    metrics.cacheSize.set({ cache_type: cacheType }, sizeBytes);
  }

  // System health
  recordSystemHealth(healthScore) {
    metrics.systemHealth.set(healthScore);
  }

  recordAlert(alertType, severity, service) {
    metrics.alertsTotal.inc({ alert_type: alertType, severity, service });
  }

  // Collect system metrics
  async collectSystemMetrics() {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Store for dashboard
      this.systemMetrics.set('memory', {
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        timestamp: Date.now()
      });
      
      this.systemMetrics.set('cpu', {
        user: cpuUsage.user,
        system: cpuUsage.system,
        timestamp: Date.now()
      });
      
      // Record uptime
      const uptime = (Date.now() - this.startTime) / 1000;
      metrics.serviceUptime.inc({ service: 'metrics-collector', version: '1.0' });
      
    } catch (error) {
      logger.error('Failed to collect system metrics', { error: error.message });
    }
  }

  // Start periodic collection
  startCollection(intervalMs = 15000) {
    this.collectionInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, intervalMs);
    
    logger.info('Started metrics collection', { intervalMs });
  }

  // Stop collection
  stopCollection() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
      logger.info('Stopped metrics collection');
    }
  }

  // Get metrics for Prometheus
  async getMetrics() {
    return register.metrics();
  }

  // Get system metrics for dashboard
  getSystemMetrics() {
    return Object.fromEntries(this.systemMetrics);
  }

  // Reset all metrics (for testing)
  resetMetrics() {
    register.resetMetrics();
  }
}

// Export singleton instance
const metricsCollector = new MetricsCollector();

export { MetricsCollector, metricsCollector, metrics, register };
export default metricsCollector;