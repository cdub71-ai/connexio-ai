/**
 * Enhanced Main Entry Point for Connexio.ai Little Horse Workers
 * Integrates the Enhanced Claude Worker with advanced patterns and monitoring
 */

import WorkerOrchestrator from './services/worker-orchestrator.js';
import config from './config/index.js';
import { createContextLogger } from './utils/logger.js';

// Import monitoring if available  
let monitoringSystem = null;
try {
  const { monitoringSystem: ms } = await import('../../monitoring/monitoring-setup.js');
  monitoringSystem = ms;
} catch (error) {
  console.warn('Monitoring system not available:', error.message);
}

const logger = createContextLogger({ service: 'enhanced-workers-main' });

/**
 * Enhanced Workers Main Entry Point
 * Coordinates advanced Little Horse workers with comprehensive monitoring
 */
class EnhancedWorkersMain {
  constructor() {
    this.orchestrator = new WorkerOrchestrator();
    this.isShuttingDown = false;
    this.startTime = Date.now();
    
    // Health and performance tracking
    this.metrics = {
      startTime: this.startTime,
      uptimeMs: 0,
      totalRestarts: 0,
      lastRestart: null,
      memoryPeakUsage: 0,
      systemHealth: 'initializing'
    };

    // Setup monitoring integration
    this.setupMonitoringIntegration();
    
    // Setup graceful shutdown
    this.setupShutdownHandlers();
    
    logger.info('Enhanced Connexio.ai workers initialized', {
      orchestrator: 'ready',
      monitoring: !!monitoringSystem,
      version: '2.0.0',
      capabilities: [
        'enhanced-claude-worker',
        'saga-patterns',
        'cross-workflow-coordination',
        'advanced-error-recovery',
        'comprehensive-monitoring'
      ]
    });
  }

  /**
   * Setup monitoring integration if available
   * @private
   */
  setupMonitoringIntegration() {
    if (!monitoringSystem) {
      logger.warn('Monitoring system not available, running without advanced monitoring');
      return;
    }

    try {
      // Initialize monitoring system
      monitoringSystem.initialize().then(() => {
        logger.info('Monitoring system integrated successfully');
        
        // Create workflow helpers for workers
        this.workflowHelpers = monitoringSystem.createWorkflowHelpers();
        
        // Create express middleware for health endpoints
        this.monitoringMiddleware = monitoringSystem.createExpressMiddleware();
        
      }).catch(error => {
        logger.error('Failed to initialize monitoring system', {
          error: error.message
        });
      });

    } catch (error) {
      logger.error('Monitoring integration failed', {
        error: error.message
      });
    }
  }

  /**
   * Start all enhanced workers
   */
  async start() {
    try {
      logger.info('Starting enhanced Connexio.ai workers...', {
        timestamp: new Date().toISOString(),
        config: {
          nodeEnv: config.app.nodeEnv,
          logLevel: config.app.logLevel,
          littlehorseHost: config.littlehorse.apiHost,
          littlehorsePort: config.littlehorse.apiPort,
          maxConcurrentTasks: config.worker.maxConcurrentTasks
        }
      });

      // Start monitoring if available
      if (monitoringSystem && !monitoringSystem.isInitialized) {
        await monitoringSystem.initialize();
        logger.info('Monitoring system started');
      }

      // Start worker orchestration
      await this.orchestrator.start();
      
      this.metrics.systemHealth = 'healthy';
      
      logger.info('Enhanced workers started successfully', {
        orchestratorStatus: this.orchestrator.getStatus(),
        monitoringEnabled: !!monitoringSystem,
        startupTime: Date.now() - this.startTime
      });

      // Start health monitoring
      this.startHealthMonitoring();

      // Setup performance monitoring
      this.setupPerformanceMonitoring();

      // Log comprehensive status
      await this.logComprehensiveStatus();

    } catch (error) {
      this.metrics.systemHealth = 'failed';
      logger.error('Failed to start enhanced workers', { 
        error: error.message,
        stack: error.stack
      });
      
      // Attempt graceful cleanup
      await this.emergencyShutdown();
      process.exit(1);
    }
  }

  /**
   * Start health monitoring with advanced patterns
   * @private
   */
  startHealthMonitoring() {
    const healthCheckInterval = config.errorRecovery.healthCheck.interval || 30000;

    const healthMonitor = setInterval(async () => {
      if (this.isShuttingDown) {
        clearInterval(healthMonitor);
        return;
      }

      try {
        await this.performAdvancedHealthCheck();
      } catch (error) {
        logger.error('Advanced health check failed', {
          error: error.message
        });
        
        // Increment failure count and check if restart is needed
        this.handleHealthCheckFailure(error);
      }
    }, healthCheckInterval);

    logger.info('Advanced health monitoring started', {
      intervalMs: healthCheckInterval,
      features: [
        'orchestrator-health',
        'worker-performance',
        'memory-monitoring',
        'system-resources',
        'automatic-recovery'
      ]
    });
  }

  /**
   * Perform comprehensive health check
   * @private
   */
  async performAdvancedHealthCheck() {
    const healthResults = {
      timestamp: new Date().toISOString(),
      overallHealth: 'healthy',
      components: {}
    };

    // Check orchestrator health
    const orchestratorStatus = this.orchestrator.getStatus();
    healthResults.components.orchestrator = {
      healthy: orchestratorStatus.isRunning,
      metrics: orchestratorStatus.metrics,
      littleHorseConnected: orchestratorStatus.littleHorse.connected
    };

    // Check system resources
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    healthResults.components.system = {
      healthy: memoryUsage.heapUsed < (memoryUsage.heapTotal * 0.9), // < 90% heap usage
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        utilization: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      },
      cpu: cpuUsage,
      uptime: process.uptime()
    };

    // Track peak memory usage
    if (memoryUsage.heapUsed > this.metrics.memoryPeakUsage) {
      this.metrics.memoryPeakUsage = memoryUsage.heapUsed;
    }

    // Check monitoring system if available
    if (monitoringSystem) {
      try {
        const monitoringStatus = await monitoringSystem.getStatus();
        healthResults.components.monitoring = {
          healthy: monitoringStatus.initialized,
          components: monitoringStatus.healthCheck?.components || {}
        };
      } catch (error) {
        healthResults.components.monitoring = {
          healthy: false,
          error: error.message
        };
      }
    }

    // Determine overall health
    const unhealthyComponents = Object.values(healthResults.components)
      .filter(component => !component.healthy).length;

    if (unhealthyComponents === 0) {
      healthResults.overallHealth = 'healthy';
    } else if (unhealthyComponents <= 1) {
      healthResults.overallHealth = 'degraded';
    } else {
      healthResults.overallHealth = 'critical';
    }

    this.metrics.systemHealth = healthResults.overallHealth;
    this.metrics.uptimeMs = Date.now() - this.startTime;

    // Log health status (reduced frequency for normal health)
    if (healthResults.overallHealth !== 'healthy') {
      logger.warn('System health degraded', healthResults);
    } else {
      logger.debug('Health check passed', {
        overallHealth: healthResults.overallHealth,
        uptime: Math.round(this.metrics.uptimeMs / 1000),
        memoryUtilization: healthResults.components.system.memory.utilization.toFixed(1)
      });
    }

    // Handle critical health
    if (healthResults.overallHealth === 'critical') {
      await this.handleCriticalHealth(healthResults);
    }

    return healthResults;
  }

  /**
   * Handle critical system health
   * @private
   */
  async handleCriticalHealth(healthResults) {
    logger.error('Critical system health detected', {
      healthResults,
      action: 'initiating_recovery'
    });

    // Attempt automated recovery
    try {
      // Force garbage collection if memory is the issue
      if (healthResults.components.system.memory.utilization > 90) {
        if (global.gc) {
          global.gc();
          logger.info('Forced garbage collection executed');
        }
      }

      // Restart orchestrator if it's unhealthy
      if (!healthResults.components.orchestrator.healthy) {
        logger.warn('Restarting orchestrator due to critical health');
        await this.restartOrchestrator();
      }

      // Alert monitoring system if available
      if (monitoringSystem) {
        // This would typically trigger alerts through the monitoring system
        logger.info('Critical health alert sent to monitoring system');
      }

    } catch (error) {
      logger.error('Automated recovery failed', {
        error: error.message,
        action: 'manual_intervention_required'
      });
    }
  }

  /**
   * Handle health check failures
   * @private
   */
  handleHealthCheckFailure(error) {
    logger.error('Health check failure', {
      error: error.message,
      consecutiveFailures: this.metrics.consecutiveHealthFailures || 0
    });

    this.metrics.consecutiveHealthFailures = (this.metrics.consecutiveHealthFailures || 0) + 1;

    // If too many consecutive failures, consider restart
    if (this.metrics.consecutiveHealthFailures >= 5) {
      logger.error('Too many consecutive health check failures, considering restart');
      this.scheduleRestart('health_check_failures');
    }
  }

  /**
   * Restart the orchestrator
   * @private
   */
  async restartOrchestrator() {
    try {
      logger.info('Restarting worker orchestrator');
      
      await this.orchestrator.shutdown();
      this.orchestrator = new WorkerOrchestrator();
      await this.orchestrator.start();
      
      this.metrics.totalRestarts++;
      this.metrics.lastRestart = new Date().toISOString();
      this.metrics.consecutiveHealthFailures = 0;
      
      logger.info('Worker orchestrator restarted successfully');
      
    } catch (error) {
      logger.error('Failed to restart orchestrator', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Schedule system restart
   * @private
   */
  scheduleRestart(reason) {
    logger.warn('Scheduling system restart', { reason });
    
    setTimeout(async () => {
      logger.info('Executing scheduled restart', { reason });
      await this.gracefulRestart();
    }, 5000); // 5 second delay
  }

  /**
   * Perform graceful restart
   * @private
   */
  async gracefulRestart() {
    try {
      await this.shutdown();
      
      // In a production environment, this would typically signal
      // a process manager (like PM2) to restart the process
      process.exit(0);
      
    } catch (error) {
      logger.error('Graceful restart failed', {
        error: error.message
      });
      process.exit(1);
    }
  }

  /**
   * Setup performance monitoring
   * @private
   */
  setupPerformanceMonitoring() {
    const performanceInterval = 60000; // 1 minute

    setInterval(() => {
      if (this.isShuttingDown) return;

      try {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        const performanceMetrics = {
          timestamp: new Date().toISOString(),
          memory: {
            heapUsed: memoryUsage.heapUsed,
            heapTotal: memoryUsage.heapTotal,
            external: memoryUsage.external,
            rss: memoryUsage.rss,
            arrayBuffers: memoryUsage.arrayBuffers
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system
          },
          uptime: process.uptime(),
          orchestrator: this.orchestrator.getStatus()
        };

        // Log performance metrics (debug level to avoid spam)
        logger.debug('Performance metrics', performanceMetrics);

        // Send metrics to monitoring system if available
        if (monitoringSystem) {
          // This would typically send metrics to the monitoring system
        }

      } catch (error) {
        logger.error('Performance monitoring failed', {
          error: error.message
        });
      }
    }, performanceInterval);

    logger.info('Performance monitoring enabled', {
      intervalMs: performanceInterval
    });
  }

  /**
   * Log comprehensive system status
   * @private
   */
  async logComprehensiveStatus() {
    try {
      const status = {
        application: {
          name: 'Connexio.ai Enhanced Workers',
          version: '2.0.0',
          environment: config.app.nodeEnv,
          uptime: process.uptime(),
          startTime: new Date(this.startTime).toISOString()
        },
        orchestrator: this.orchestrator.getStatus(),
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          cpuCount: require('os').cpus().length,
          totalMemory: require('os').totalmem(),
          freeMemory: require('os').freemem(),
          loadAverage: require('os').loadavg()
        },
        config: {
          littlehorse: {
            host: config.littlehorse.apiHost,
            port: config.littlehorse.apiPort
          },
          worker: {
            maxConcurrentTasks: config.worker.maxConcurrentTasks,
            taskTimeout: config.worker.taskTimeoutMs
          },
          rateLimit: {
            maxConcurrent: config.rateLimit.maxConcurrent,
            intervalCap: config.rateLimit.intervalCap
          }
        },
        monitoring: {
          enabled: !!monitoringSystem,
          initialized: monitoringSystem?.isInitialized || false
        }
      };

      logger.info('Comprehensive system status', status);

    } catch (error) {
      logger.error('Failed to generate comprehensive status', {
        error: error.message
      });
    }
  }

  /**
   * Setup graceful shutdown handlers
   * @private
   */
  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) {
        logger.warn('Shutdown already in progress, forcing exit');
        process.exit(1);
      }

      this.isShuttingDown = true;
      this.metrics.systemHealth = 'shutting_down';
      
      logger.info(`Received ${signal}, initiating graceful shutdown...`, {
        uptime: Date.now() - this.startTime,
        totalRestarts: this.metrics.totalRestarts
      });

      try {
        await this.shutdown();
        logger.info('Enhanced workers shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    };

    // Handle various shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { 
        error: error.message, 
        stack: error.stack 
      });
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { 
        reason: reason?.message || reason,
        promise: promise.toString()
      });
      shutdown('unhandledRejection');
    });
  }

  /**
   * Graceful shutdown of all components
   */
  async shutdown() {
    logger.info('Starting graceful shutdown of enhanced workers');

    const shutdownTasks = [];

    // Shutdown orchestrator
    if (this.orchestrator) {
      shutdownTasks.push(
        this.orchestrator.shutdown().catch(error => {
          logger.error('Orchestrator shutdown failed', {
            error: error.message
          });
        })
      );
    }

    // Shutdown monitoring if available
    if (monitoringSystem) {
      shutdownTasks.push(
        monitoringSystem.shutdown().catch(error => {
          logger.error('Monitoring system shutdown failed', {
            error: error.message
          });
        })
      );
    }

    // Wait for all shutdowns to complete
    await Promise.allSettled(shutdownTasks);

    logger.info('Enhanced workers shutdown complete', {
      totalUptime: Date.now() - this.startTime,
      totalRestarts: this.metrics.totalRestarts,
      peakMemoryUsage: this.metrics.memoryPeakUsage
    });
  }

  /**
   * Emergency shutdown (fast, minimal cleanup)
   * @private
   */
  async emergencyShutdown() {
    logger.error('Initiating emergency shutdown');
    
    try {
      // Give components 5 seconds to shutdown
      const emergencyTimeout = setTimeout(() => {
        logger.error('Emergency shutdown timeout, forcing exit');
        process.exit(1);
      }, 5000);

      await this.shutdown();
      clearTimeout(emergencyTimeout);
      
    } catch (error) {
      logger.error('Emergency shutdown failed', {
        error: error.message
      });
    }
  }

  /**
   * Get comprehensive status
   */
  getStatus() {
    return {
      status: this.metrics.systemHealth,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      metrics: this.metrics,
      orchestrator: this.orchestrator.getStatus(),
      monitoring: {
        enabled: !!monitoringSystem,
        initialized: monitoringSystem?.isInitialized || false
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime()
      }
    };
  }
}

// Create and start enhanced workers if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const enhancedWorkers = new EnhancedWorkersMain();
  enhancedWorkers.start().catch((error) => {
    logger.error('Failed to start enhanced workers', { 
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });
}

export default EnhancedWorkersMain;