/**
 * Comprehensive Monitoring System Setup
 * Initializes and coordinates all monitoring components
 */

import { metricsCollector } from './metrics-collector.js';
import { workflowMonitor } from './workflow-monitor.js';
import { workerHealthMonitor } from './worker-health-monitor.js';
import { apiIntegrationMonitor } from './api-integration-monitor.js';
import { costTracker } from './cost-tracker.js';
import { alertManager } from './alert-manager.js';
import { dashboardServer } from './dashboard-server.js';
import { createServiceLogger } from './logger.js';

const logger = createServiceLogger('monitoring-setup');

class MonitoringSystem {
  constructor() {
    this.components = new Map();
    this.isInitialized = false;
    this.eventHandlers = new Map();
    
    this.registerComponents();
    this.setupEventHandlers();
  }

  /**
   * Register all monitoring components
   */
  registerComponents() {
    this.components.set('metrics', {
      instance: metricsCollector,
      name: 'Metrics Collector',
      dependencies: [],
      healthCheck: () => metricsCollector.getSystemMetrics() !== null
    });

    this.components.set('workflow', {
      instance: workflowMonitor,
      name: 'Workflow Monitor',
      dependencies: ['metrics'],
      healthCheck: () => workflowMonitor.activeWorkflows.size >= 0
    });

    this.components.set('worker', {
      instance: workerHealthMonitor,
      name: 'Worker Health Monitor',
      dependencies: ['metrics'],
      healthCheck: () => workerHealthMonitor.getHealthStatus() !== null
    });

    this.components.set('api', {
      instance: apiIntegrationMonitor,
      name: 'API Integration Monitor',
      dependencies: ['metrics'],
      healthCheck: () => apiIntegrationMonitor.apiProviders.size > 0
    });

    this.components.set('cost', {
      instance: costTracker,
      name: 'Cost Tracker',
      dependencies: ['api'],
      healthCheck: () => costTracker.costData.size > 0
    });

    this.components.set('alerts', {
      instance: alertManager,
      name: 'Alert Manager',
      dependencies: ['metrics', 'workflow', 'worker', 'api', 'cost'],
      healthCheck: () => alertManager.alertRules.size > 0
    });

    this.components.set('dashboard', {
      instance: dashboardServer,
      name: 'Dashboard Server',
      dependencies: ['metrics', 'workflow', 'worker', 'api', 'cost', 'alerts'],
      healthCheck: () => true // Dashboard server provides its own health endpoint
    });
  }

  /**
   * Setup cross-component event handlers
   */
  setupEventHandlers() {
    // Workflow events to alert manager
    workflowMonitor.on('workflow:stuck', (data) => {
      alertManager.processAlert('workflow.stuck', data, 'workflow-monitor');
    });

    workflowMonitor.on('workflow:error', (data) => {
      alertManager.processAlert('workflow.failure_rate', {
        errorRate: data.errorRate || 0.1
      }, 'workflow-monitor');
    });

    // Worker events to alert manager
    workerHealthMonitor.on('worker:status_change', (data) => {
      if (data.currentStatus === 'unhealthy') {
        alertManager.processAlert('worker.unhealthy', data, 'worker-health-monitor');
      }
    });

    workerHealthMonitor.on('worker:consecutive_failures', (data) => {
      alertManager.processAlert('worker.consecutive_failures', data, 'worker-health-monitor');
    });

    workerHealthMonitor.on('task:slow', (data) => {
      alertManager.processAlert('api.slow_response', {
        responseTime: data.duration * 1000
      }, 'worker-health-monitor');
    });

    // API events to alert manager
    apiIntegrationMonitor.on('circuit_breaker:open', (data) => {
      alertManager.processAlert('api.circuit_breaker', {
        circuitBreakerState: 'open',
        ...data
      }, 'api-integration-monitor');
    });

    apiIntegrationMonitor.on('rate_limit:hit', (data) => {
      alertManager.processAlert('api.rate_limit', {
        rateLimitHit: true,
        ...data
      }, 'api-integration-monitor');
    });

    apiIntegrationMonitor.on('provider:unhealthy', (data) => {
      alertManager.processAlert('api.high_error_rate', {
        errorRate: 1 - data.successRate,
        ...data
      }, 'api-integration-monitor');
    });

    // Cost events to alert manager
    costTracker.on('budget:alert', (alert) => {
      let alertType;
      switch (alert.severity) {
        case 'warning':
          alertType = 'cost.budget_warning';
          break;
        case 'critical':
          alertType = 'cost.budget_critical';
          break;
        case 'emergency':
          alertType = 'cost.budget_emergency';
          break;
        default:
          alertType = 'cost.budget_warning';
      }
      
      alertManager.processAlert(alertType, {
        percentage: alert.percentage / 100,
        ...alert
      }, 'cost-tracker');
    });

    // API cost tracking integration
    apiIntegrationMonitor.on('request:completed', (data) => {
      if (data.cost > 0) {
        costTracker.recordUsage(data.providerId, {
          operation: data.operation,
          cost: data.cost,
          tokens: data.tokens,
          metadata: data.metadata
        });
      }
    });

    logger.info('Event handlers configured');
  }

  /**
   * Initialize all monitoring components
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('Monitoring system already initialized');
      return;
    }

    logger.info('Initializing monitoring system');

    // Initialize components in dependency order
    const initOrder = this.getInitializationOrder();
    
    for (const componentId of initOrder) {
      const component = this.components.get(componentId);
      
      try {
        logger.info(`Initializing ${component.name}`);
        
        // Some components may need explicit initialization
        if (component.instance.initialize) {
          await component.instance.initialize();
        }
        
        // Start component-specific monitoring/processing
        if (component.instance.startMonitoring) {
          component.instance.startMonitoring();
        } else if (component.instance.startProcessing) {
          component.instance.startProcessing();
        } else if (component.instance.startTracking) {
          component.instance.startTracking();
        }
        
        logger.info(`${component.name} initialized successfully`);
        
      } catch (error) {
        logger.error(`Failed to initialize ${component.name}`, {
          error: error.message,
          stack: error.stack
        });
        throw new Error(`Monitoring system initialization failed at ${component.name}`);
      }
    }

    // Start dashboard server last
    try {
      const port = process.env.DASHBOARD_PORT || 3004;
      dashboardServer.start(port);
      logger.info(`Dashboard server started on port ${port}`);
    } catch (error) {
      logger.error('Failed to start dashboard server', {
        error: error.message
      });
      // Dashboard failure shouldn't stop the monitoring system
    }

    this.isInitialized = true;
    logger.info('Monitoring system initialized successfully');

    // Start health monitoring of the monitoring system itself
    this.startSystemHealthChecks();
  }

  /**
   * Get component initialization order based on dependencies
   */
  getInitializationOrder() {
    const order = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (componentId) => {
      if (visiting.has(componentId)) {
        throw new Error(`Circular dependency detected: ${componentId}`);
      }
      
      if (visited.has(componentId)) {
        return;
      }

      visiting.add(componentId);
      
      const component = this.components.get(componentId);
      if (component) {
        for (const dep of component.dependencies) {
          visit(dep);
        }
        
        order.push(componentId);
        visited.add(componentId);
      }
      
      visiting.delete(componentId);
    };

    // Visit all components
    for (const componentId of this.components.keys()) {
      visit(componentId);
    }

    return order;
  }

  /**
   * Start health checks for the monitoring system itself
   */
  startSystemHealthChecks() {
    setInterval(async () => {
      try {
        await this.performSystemHealthCheck();
      } catch (error) {
        logger.error('System health check failed', { error: error.message });
      }
    }, 60000); // Every minute

    logger.info('Started monitoring system health checks');
  }

  /**
   * Perform health check on all monitoring components
   */
  async performSystemHealthCheck() {
    const healthStatus = {
      timestamp: Date.now(),
      overall: 'healthy',
      components: {}
    };

    let unhealthyCount = 0;

    for (const [componentId, component] of this.components.entries()) {
      try {
        const isHealthy = component.healthCheck();
        healthStatus.components[componentId] = {
          name: component.name,
          healthy: isHealthy,
          lastCheck: Date.now()
        };

        if (!isHealthy) {
          unhealthyCount++;
          logger.warn(`Component unhealthy: ${component.name}`);
        }
      } catch (error) {
        healthStatus.components[componentId] = {
          name: component.name,
          healthy: false,
          error: error.message,
          lastCheck: Date.now()
        };
        unhealthyCount++;
        
        logger.error(`Health check failed for ${component.name}`, {
          error: error.message
        });
      }
    }

    // Determine overall health
    if (unhealthyCount === 0) {
      healthStatus.overall = 'healthy';
    } else if (unhealthyCount <= 2) {
      healthStatus.overall = 'degraded';
    } else {
      healthStatus.overall = 'unhealthy';
    }

    // Record system health metric
    const healthScore = Math.max(0, 1 - (unhealthyCount / this.components.size));
    metricsCollector.recordSystemHealth(healthScore);

    // Alert if system is unhealthy
    if (healthStatus.overall === 'unhealthy') {
      alertManager.processAlert('system.monitoring.unhealthy', {
        unhealthyComponents: unhealthyCount,
        totalComponents: this.components.size,
        healthScore
      }, 'monitoring-system');
    }

    return healthStatus;
  }

  /**
   * Gracefully shutdown all monitoring components
   */
  async shutdown() {
    if (!this.isInitialized) {
      return;
    }

    logger.info('Shutting down monitoring system');

    // Shutdown in reverse order
    const shutdownOrder = this.getInitializationOrder().reverse();

    for (const componentId of shutdownOrder) {
      const component = this.components.get(componentId);
      
      try {
        logger.info(`Shutting down ${component.name}`);
        
        // Stop component-specific processing
        if (component.instance.stopMonitoring) {
          component.instance.stopMonitoring();
        } else if (component.instance.stopProcessing) {
          component.instance.stopProcessing();
        } else if (component.instance.stopTracking) {
          component.instance.stopTracking();
        } else if (component.instance.stop) {
          component.instance.stop();
        }
        
        logger.info(`${component.name} shut down successfully`);
        
      } catch (error) {
        logger.error(`Failed to shutdown ${component.name}`, {
          error: error.message
        });
      }
    }

    this.isInitialized = false;
    logger.info('Monitoring system shutdown complete');
  }

  /**
   * Get monitoring system status
   */
  async getStatus() {
    const status = {
      initialized: this.isInitialized,
      components: {},
      healthCheck: null
    };

    for (const [componentId, component] of this.components.entries()) {
      status.components[componentId] = {
        name: component.name,
        dependencies: component.dependencies
      };
    }

    if (this.isInitialized) {
      status.healthCheck = await this.performSystemHealthCheck();
    }

    return status;
  }

  /**
   * Create monitoring middleware for Express apps
   */
  createExpressMiddleware() {
    const middleware = {
      // Metrics collection middleware
      metrics: metricsCollector.createHTTPMiddleware('application'),
      
      // Request correlation middleware
      correlation: (req, res, next) => {
        // Add request tracking
        const startTime = Date.now();
        
        res.on('finish', () => {
          const duration = Date.now() - startTime;
          
          // Record API call if this is an API endpoint
          if (req.path.startsWith('/api/')) {
            const provider = req.headers['x-api-provider'] || 'internal';
            apiIntegrationMonitor.recordRequest(
              provider,
              req.path,
              req.method,
              startTime,
              Date.now(),
              res.statusCode,
              0, // response size would need to be calculated
              1, // tokens
              0, // cost
              res.statusCode >= 400 ? new Error(`HTTP ${res.statusCode}`) : null
            );
          }
        });
        
        next();
      },
      
      // Worker task tracking (for worker processes)
      task: (taskId, taskName, queueName = 'default') => {
        return {
          start: (metadata = {}) => {
            workerHealthMonitor.trackTaskStart(taskId, taskName, queueName, metadata);
          },
          complete: (status = 'completed', output = null, error = null) => {
            workerHealthMonitor.trackTaskComplete(taskId, status, output, error);
          }
        };
      }
    };

    return middleware;
  }

  /**
   * Create workflow tracking helpers
   */
  createWorkflowHelpers() {
    return {
      start: (workflowId, workflowName, version = '1.0', metadata = {}) => {
        workflowMonitor.trackWorkflowStart(workflowId, workflowName, version, metadata);
      },
      
      complete: (workflowId, status = 'completed') => {
        workflowMonitor.trackWorkflowComplete(workflowId, status);
      },
      
      error: (workflowId, error, taskName = null) => {
        workflowMonitor.trackWorkflowError(workflowId, error, taskName);
      },
      
      taskStart: (workflowId, taskId, taskName, metadata = {}) => {
        workflowMonitor.trackTaskStart(workflowId, taskId, taskName, metadata);
      },
      
      taskComplete: (workflowId, taskId, status = 'completed', output = null) => {
        workflowMonitor.trackTaskComplete(workflowId, taskId, status, output);
      }
    };
  }
}

// Create and export singleton instance
const monitoringSystem = new MonitoringSystem();

// Handle process signals for graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal, shutting down gracefully');
  await monitoringSystem.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal, shutting down gracefully');
  await monitoringSystem.shutdown();
  process.exit(0);
});

export { MonitoringSystem, monitoringSystem };
export default monitoringSystem;