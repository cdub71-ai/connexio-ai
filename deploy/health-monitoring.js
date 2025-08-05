/**
 * Health Monitoring and Alerting System for Fly.io Deployment
 */

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import axios from 'axios';
import { createContextLogger } from '../workers/src/utils/logger.js';

const app = express();
const logger = createContextLogger({ service: 'health-monitoring' });

// Configuration
const HEALTH_CHECK_CONFIG = {
  interval: 30000, // 30 seconds
  timeout: 5000,   // 5 seconds
  retries: 3,
  services: [
    {
      name: 'littlehorse-kernel',
      url: 'http://connexio-ai-littlehorse.internal:1822/health',
      critical: true,
    },
    {
      name: 'postgres',
      url: 'http://connexio-ai-postgres.internal:5432',
      type: 'tcp',
      critical: true,
    },
    {
      name: 'redis',
      url: 'http://connexio-ai-redis.internal:6379',
      type: 'tcp',
      critical: true,
    },
    {
      name: 'main-workers',
      url: 'http://connexio-ai-workers.internal:3000/health',
      critical: true,
    },
    {
      name: 'enrichment-workers',
      url: 'http://connexio-ai-enrichment-workers.internal:3000/health',
      critical: false,
    },
    {
      name: 'orchestration-workers',
      url: 'http://connexio-ai-orchestration-workers.internal:3000/health',
      critical: false,
    },
  ],
};

// Health check state
const healthState = new Map();
const alerts = [];

// Health check functions
class HealthMonitor {
  constructor() {
    this.checks = new Map();
    this.alertThresholds = {
      consecutive_failures: 3,
      error_rate: 0.1, // 10%
      response_time: 5000, // 5 seconds
    };
  }

  async checkHttpHealth(service) {
    try {
      const startTime = Date.now();
      const response = await axios.get(service.url, {
        timeout: HEALTH_CHECK_CONFIG.timeout,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: true,
        responseTime,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        code: error.code,
      };
    }
  }

  async checkTcpHealth(service) {
    return new Promise((resolve) => {
      const net = require('net');
      const [host, port] = service.url.replace('http://', '').split(':');
      
      const socket = new net.Socket();
      const startTime = Date.now();
      
      socket.setTimeout(HEALTH_CHECK_CONFIG.timeout);
      
      socket.connect(parseInt(port), host, () => {
        const responseTime = Date.now() - startTime;
        socket.destroy();
        resolve({
          healthy: true,
          responseTime,
        });
      });
      
      socket.on('error', (error) => {
        resolve({
          healthy: false,
          error: error.message,
        });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          healthy: false,
          error: 'Connection timeout',
        });
      });
    });
  }

  async performHealthCheck(service) {
    const checkType = service.type || 'http';
    let result;
    
    try {
      if (checkType === 'tcp') {
        result = await this.checkTcpHealth(service);
      } else {
        result = await this.checkHttpHealth(service);
      }
    } catch (error) {
      result = {
        healthy: false,
        error: error.message,
      };
    }
    
    // Update health state
    const currentState = healthState.get(service.name) || {
      consecutiveFailures: 0,
      totalChecks: 0,
      failures: 0,
      lastHealthy: null,
      lastCheck: null,
    };
    
    currentState.totalChecks++;
    currentState.lastCheck = new Date().toISOString();
    
    if (result.healthy) {
      currentState.consecutiveFailures = 0;
      currentState.lastHealthy = new Date().toISOString();
    } else {
      currentState.consecutiveFailures++;
      currentState.failures++;
    }
    
    healthState.set(service.name, currentState);
    
    // Check for alerts
    this.checkAlerts(service, currentState, result);
    
    return {
      service: service.name,
      healthy: result.healthy,
      critical: service.critical,
      responseTime: result.responseTime,
      error: result.error,
      timestamp: new Date().toISOString(),
      state: currentState,
    };
  }

  checkAlerts(service, state, result) {
    const now = new Date();
    
    // Consecutive failures alert
    if (state.consecutiveFailures >= this.alertThresholds.consecutive_failures) {
      this.sendAlert({
        type: 'consecutive_failures',
        service: service.name,
        critical: service.critical,
        message: `Service ${service.name} has failed ${state.consecutiveFailures} consecutive health checks`,
        severity: service.critical ? 'critical' : 'warning',
        timestamp: now.toISOString(),
        metadata: { consecutiveFailures: state.consecutiveFailures },
      });
    }
    
    // High error rate alert
    if (state.totalChecks > 10) {
      const errorRate = state.failures / state.totalChecks;
      if (errorRate > this.alertThresholds.error_rate) {
        this.sendAlert({
          type: 'high_error_rate',
          service: service.name,
          critical: service.critical,
          message: `Service ${service.name} has high error rate: ${Math.round(errorRate * 100)}%`,
          severity: service.critical ? 'critical' : 'warning',
          timestamp: now.toISOString(),
          metadata: { errorRate: Math.round(errorRate * 100) },
        });
      }
    }
    
    // Slow response time alert
    if (result.healthy && result.responseTime > this.alertThresholds.response_time) {
      this.sendAlert({
        type: 'slow_response',
        service: service.name,
        critical: service.critical,
        message: `Service ${service.name} response time is slow: ${result.responseTime}ms`,
        severity: 'warning',
        timestamp: now.toISOString(),
        metadata: { responseTime: result.responseTime },
      });
    }
  }

  sendAlert(alert) {
    // Prevent duplicate alerts
    const alertKey = `${alert.type}-${alert.service}`;
    const lastAlert = alerts.find(a => a.key === alertKey && 
      new Date(a.timestamp) > new Date(Date.now() - 300000) // 5 minutes
    );
    
    if (lastAlert) {
      return; // Skip duplicate alert
    }
    
    alert.key = alertKey;
    alerts.push(alert);
    
    // Keep only recent alerts
    const cutoff = new Date(Date.now() - 3600000); // 1 hour
    const recentAlerts = alerts.filter(a => new Date(a.timestamp) > cutoff);
    alerts.splice(0, alerts.length, ...recentAlerts);
    
    logger.warn('Health alert triggered', alert);
    
    // Send to external monitoring systems (Slack, PagerDuty, etc.)
    this.sendExternalAlert(alert);
  }

  async sendExternalAlert(alert) {
    try {
      // Send to Slack if configured
      if (process.env.SLACK_WEBHOOK_URL) {
        await this.sendSlackAlert(alert);
      }
      
      // Send to PagerDuty if configured
      if (process.env.PAGERDUTY_INTEGRATION_KEY) {
        await this.sendPagerDutyAlert(alert);
      }
    } catch (error) {
      logger.error('Failed to send external alert', { error: error.message, alert });
    }
  }

  async sendSlackAlert(alert) {
    const color = alert.severity === 'critical' ? 'danger' : 'warning';
    const emoji = alert.severity === 'critical' ? '🚨' : '⚠️';
    
    const payload = {
      text: `${emoji} Health Alert: ${alert.service}`,
      attachments: [{
        color,
        fields: [
          { title: 'Service', value: alert.service, short: true },
          { title: 'Type', value: alert.type, short: true },
          { title: 'Severity', value: alert.severity, short: true },
          { title: 'Critical', value: alert.critical ? 'Yes' : 'No', short: true },
          { title: 'Message', value: alert.message, short: false },
          { title: 'Timestamp', value: alert.timestamp, short: false },
        ],
      }],
    };
    
    await axios.post(process.env.SLACK_WEBHOOK_URL, payload);
  }

  async sendPagerDutyAlert(alert) {
    const payload = {
      routing_key: process.env.PAGERDUTY_INTEGRATION_KEY,
      event_action: 'trigger',
      dedup_key: `${alert.service}-${alert.type}`,
      payload: {
        summary: `${alert.service}: ${alert.message}`,
        severity: alert.severity === 'critical' ? 'critical' : 'warning',
        source: 'connexio-ai-health-monitor',
        component: alert.service,
        group: 'connexio-ai',
        class: alert.type,
        custom_details: alert.metadata,
      },
    };
    
    await axios.post('https://events.pagerduty.com/v2/enqueue', payload);
  }

  async runHealthChecks() {
    logger.info('Running health checks', { serviceCount: HEALTH_CHECK_CONFIG.services.length });
    
    const results = await Promise.allSettled(
      HEALTH_CHECK_CONFIG.services.map(service => this.performHealthCheck(service))
    );
    
    const healthResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          service: HEALTH_CHECK_CONFIG.services[index].name,
          healthy: false,
          error: result.reason.message,
          timestamp: new Date().toISOString(),
        };
      }
    });
    
    const unhealthyServices = healthResults.filter(r => !r.healthy);
    const criticalUnhealthy = unhealthyServices.filter(r => r.critical);
    
    logger.info('Health check completed', {
      total: healthResults.length,
      healthy: healthResults.filter(r => r.healthy).length,
      unhealthy: unhealthyServices.length,
      criticalUnhealthy: criticalUnhealthy.length,
    });
    
    return {
      timestamp: new Date().toISOString(),
      overall: criticalUnhealthy.length === 0 ? 'healthy' : 'unhealthy',
      services: healthResults,
      summary: {
        total: healthResults.length,
        healthy: healthResults.filter(r => r.healthy).length,
        unhealthy: unhealthyServices.length,
        critical_unhealthy: criticalUnhealthy.length,
      },
    };
  }

  getHealthStatus() {
    const serviceStates = Array.from(healthState.entries()).map(([name, state]) => ({
      name,
      ...state,
    }));
    
    return {
      timestamp: new Date().toISOString(),
      services: serviceStates,
      alerts: alerts.slice(-10), // Last 10 alerts
      thresholds: this.alertThresholds,
    };
  }
}

// Initialize health monitor
const healthMonitor = new HealthMonitor();

// API routes
app.use(express.json());

app.get('/health', async (req, res) => {
  try {
    const status = await healthMonitor.runHealthChecks();
    res.status(status.overall === 'healthy' ? 200 : 503).json(status);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({
      timestamp: new Date().toISOString(),
      overall: 'error',
      error: error.message,
    });
  }
});

app.get('/status', (req, res) => {
  res.json(healthMonitor.getHealthStatus());
});

app.get('/alerts', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    alerts: alerts.slice(-50), // Last 50 alerts
  });
});

// Metrics endpoint for Prometheus
app.get('/metrics', (req, res) => {
  const metrics = [];
  
  for (const [serviceName, state] of healthState.entries()) {
    const service = HEALTH_CHECK_CONFIG.services.find(s => s.name === serviceName);
    
    metrics.push(`# HELP service_health_status Service health status (1 = healthy, 0 = unhealthy)`);
    metrics.push(`# TYPE service_health_status gauge`);
    metrics.push(`service_health_status{service="${serviceName}",critical="${service?.critical || false}"} ${state.consecutiveFailures === 0 ? 1 : 0}`);
    
    metrics.push(`# HELP service_consecutive_failures Consecutive health check failures`);
    metrics.push(`# TYPE service_consecutive_failures gauge`);
    metrics.push(`service_consecutive_failures{service="${serviceName}"} ${state.consecutiveFailures}`);
    
    if (state.totalChecks > 0) {
      const errorRate = state.failures / state.totalChecks;
      metrics.push(`# HELP service_error_rate Service error rate`);
      metrics.push(`# TYPE service_error_rate gauge`);
      metrics.push(`service_error_rate{service="${serviceName}"} ${errorRate}`);
    }
  }
  
  metrics.push(`# HELP health_monitor_alerts_total Total number of alerts`);
  metrics.push(`# TYPE health_monitor_alerts_total counter`);
  metrics.push(`health_monitor_alerts_total ${alerts.length}`);
  
  res.set('Content-Type', 'text/plain');
  res.send(metrics.join('\n'));
});

// Proxy endpoints for individual service health checks
app.use('/proxy/littlehorse', createProxyMiddleware({
  target: 'http://connexio-ai-littlehorse.internal:1822',
  changeOrigin: true,
  pathRewrite: { '^/proxy/littlehorse': '' },
}));

app.use('/proxy/workers', createProxyMiddleware({
  target: 'http://connexio-ai-workers.internal:3000',
  changeOrigin: true,
  pathRewrite: { '^/proxy/workers': '' },
}));

app.use('/proxy/enrichment', createProxyMiddleware({
  target: 'http://connexio-ai-enrichment-workers.internal:3000',
  changeOrigin: true,
  pathRewrite: { '^/proxy/enrichment': '' },
}));

app.use('/proxy/orchestration', createProxyMiddleware({
  target: 'http://connexio-ai-orchestration-workers.internal:3000',
  changeOrigin: true,
  pathRewrite: { '^/proxy/orchestration': '' },
}));

// Start periodic health checks
setInterval(() => {
  healthMonitor.runHealthChecks().catch(error => {
    logger.error('Scheduled health check failed', { error: error.message });
  });
}, HEALTH_CHECK_CONFIG.interval);

// Start the server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  logger.info('Health monitoring server started', { port: PORT });
  
  // Run initial health check
  healthMonitor.runHealthChecks();
});

export default app;