/**
 * Worker Orchestration Service
 * Manages Enhanced Claude Worker lifecycle and Little Horse integration
 * Implements advanced monitoring and coordination patterns
 */

import { LHWorkerGroup } from 'littlehorse-client';
import EnhancedClaudeWorker from '../workers/enhanced-claude-worker.js';
import config from '../config/index.js';
import { createContextLogger } from '../utils/logger.js';

/**
 * Worker Orchestration Service
 * Coordinates multiple workers and handles Little Horse integration
 */
class WorkerOrchestrator {
  constructor() {
    this.logger = createContextLogger({ service: 'worker-orchestrator' });
    this.workers = new Map();
    this.workerGroup = null;
    this.isRunning = false;
    this.healthCheckInterval = null;
    
    // Orchestration metrics
    this.metrics = {
      totalWorkers: 0,
      activeWorkers: 0,
      failedWorkers: 0,
      totalTasksProcessed: 0,
      averageTaskDuration: 0,
      workerRestarts: 0,
      lastHealthCheck: null
    };

    this.logger.info('Worker orchestrator initialized');
  }

  /**
   * Initialize and start the worker orchestration
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('Worker orchestrator already running');
      return;
    }

    try {
      this.logger.info('Starting worker orchestration', {
        littlehorseHost: config.littlehorse.apiHost,
        littlehorsePort: config.littlehorse.apiPort,
        maxWorkers: config.worker.maxConcurrentTasks
      });

      // Initialize Little Horse worker group
      await this.initializeLittleHorseConnection();

      // Create and register enhanced Claude worker
      await this.createEnhancedClaudeWorker();

      // Start health monitoring
      this.startHealthMonitoring();

      // Start the worker group
      await this.workerGroup.start();

      this.isRunning = true;
      this.logger.info('Worker orchestration started successfully', {
        activeWorkers: this.workers.size,
        registeredTasks: Array.from(this.workers.keys())
      });

    } catch (error) {
      this.logger.error('Failed to start worker orchestration', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Initialize Little Horse connection and worker group
   * @private
   */
  async initializeLittleHorseConnection() {
    try {
      const workerGroupConfig = {
        apiHost: config.littlehorse.apiHost,
        apiPort: config.littlehorse.apiPort,
        clientId: config.littlehorse.clientId,
        clientSecret: config.littlehorse.clientSecret,
        workerName: config.app.workerName,
        maxConcurrentTasks: config.worker.maxConcurrentTasks,
        heartbeatIntervalMs: config.worker.heartbeatIntervalMs,
        taskTimeoutMs: config.worker.taskTimeoutMs
      };

      this.workerGroup = new LHWorkerGroup(workerGroupConfig);
      
      // Set up global error handlers
      this.workerGroup.on('error', (error) => {
        this.logger.error('Little Horse worker group error', {
          error: error.message,
          stack: error.stack
        });
        this.handleWorkerGroupError(error);
      });

      this.workerGroup.on('task:started', (taskInfo) => {
        this.logger.debug('Task started', {
          taskName: taskInfo.taskName,
          taskId: taskInfo.taskId,
          workflowId: taskInfo.wfRunId
        });
        this.updateTaskMetrics('started');
      });

      this.workerGroup.on('task:completed', (taskInfo) => {
        this.logger.debug('Task completed', {
          taskName: taskInfo.taskName,
          taskId: taskInfo.taskId,
          duration: taskInfo.duration
        });
        this.updateTaskMetrics('completed', taskInfo.duration);
      });

      this.workerGroup.on('task:failed', (taskInfo) => {
        this.logger.warn('Task failed', {
          taskName: taskInfo.taskName,
          taskId: taskInfo.taskId,
          error: taskInfo.error
        });
        this.updateTaskMetrics('failed');
      });

      this.logger.info('Little Horse connection initialized', workerGroupConfig);

    } catch (error) {
      this.logger.error('Failed to initialize Little Horse connection', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create and register enhanced Claude worker
   * @private
   */
  async createEnhancedClaudeWorker() {
    try {
      const enhancedWorker = new EnhancedClaudeWorker();
      
      // Register multiple task types with the enhanced worker
      const taskMethods = [
        {
          taskName: 'parse-marketing-command-enhanced',
          method: enhancedWorker.parseMarketingCommandEnhanced.bind(enhancedWorker),
          description: 'Enhanced marketing command parsing with workflow patterns'
        },
        {
          taskName: 'generate-campaign-content-saga',
          method: enhancedWorker.generateCampaignContentSaga.bind(enhancedWorker),
          description: 'Saga-aware campaign content generation'
        },
        {
          taskName: 'compensate-content-generation',
          method: enhancedWorker.compensateContentGeneration.bind(enhancedWorker),
          description: 'Compensation handler for content generation rollback'
        },
        {
          taskName: 'coordinate-cross-workflow',
          method: enhancedWorker.coordinateCrossWorkflow.bind(enhancedWorker),
          description: 'Cross-workflow coordination and state synchronization'
        }
      ];

      // Register each task method with Little Horse
      for (const task of taskMethods) {
        this.workerGroup.registerTaskMethod(task.taskName, task.method);
        this.workers.set(task.taskName, {
          worker: enhancedWorker,
          taskName: task.taskName,
          description: task.description,
          status: 'registered',
          registeredAt: new Date().toISOString(),
          tasksProcessed: 0,
          lastTaskAt: null,
          errors: []
        });

        this.logger.info('Registered task method', {
          taskName: task.taskName,
          description: task.description
        });
      }

      this.metrics.totalWorkers = this.workers.size;
      this.metrics.activeWorkers = this.workers.size;

      this.logger.info('Enhanced Claude worker created and registered', {
        taskMethods: taskMethods.length,
        workerInstance: enhancedWorker.constructor.name
      });

    } catch (error) {
      this.logger.error('Failed to create enhanced Claude worker', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Start health monitoring for workers
   * @private
   */
  startHealthMonitoring() {
    const healthCheckInterval = config.errorRecovery.healthCheck.interval || 30000;
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        this.logger.error('Health check failed', {
          error: error.message
        });
      }
    }, healthCheckInterval);

    this.logger.info('Health monitoring started', {
      intervalMs: healthCheckInterval
    });
  }

  /**
   * Perform comprehensive health check on all workers
   * @private
   */
  async performHealthCheck() {
    const healthResults = {
      timestamp: new Date().toISOString(),
      overallHealth: 'healthy',
      workers: {},
      metrics: { ...this.metrics }
    };

    let unhealthyWorkers = 0;

    for (const [taskName, workerInfo] of this.workers.entries()) {
      try {
        const workerHealth = workerInfo.worker.getHealthStatus();
        
        const isHealthy = workerHealth.status === 'healthy' && 
                         workerHealth.worker.successRate > 50;

        healthResults.workers[taskName] = {
          status: isHealthy ? 'healthy' : 'unhealthy',
          successRate: workerHealth.worker.successRate,
          tasksProcessed: workerInfo.tasksProcessed,
          lastTaskAt: workerInfo.lastTaskAt,
          errors: workerInfo.errors.slice(-5), // Last 5 errors
          metrics: workerHealth.worker.metrics
        };

        if (!isHealthy) {
          unhealthyWorkers++;
          this.logger.warn('Unhealthy worker detected', {
            taskName,
            successRate: workerHealth.worker.successRate,
            status: workerHealth.status
          });
        }

      } catch (error) {
        unhealthyWorkers++;
        healthResults.workers[taskName] = {
          status: 'error',
          error: error.message,
          lastChecked: new Date().toISOString()
        };

        this.logger.error('Worker health check failed', {
          taskName,
          error: error.message
        });
      }
    }

    // Determine overall health
    if (unhealthyWorkers === 0) {
      healthResults.overallHealth = 'healthy';
    } else if (unhealthyWorkers <= this.workers.size / 2) {
      healthResults.overallHealth = 'degraded';
    } else {
      healthResults.overallHealth = 'critical';
    }

    this.metrics.lastHealthCheck = healthResults.timestamp;

    // Log health summary
    this.logger.info('Health check completed', {
      overallHealth: healthResults.overallHealth,
      totalWorkers: this.workers.size,
      unhealthyWorkers,
      totalTasksProcessed: this.metrics.totalTasksProcessed
    });

    // Handle critical health issues
    if (healthResults.overallHealth === 'critical') {
      await this.handleCriticalHealth(healthResults);
    }

    return healthResults;
  }

  /**
   * Handle critical health issues
   * @private
   */
  async handleCriticalHealth(healthResults) {
    this.logger.error('Critical health detected, initiating recovery', {
      overallHealth: healthResults.overallHealth,
      timestamp: healthResults.timestamp
    });

    // Implement recovery strategies
    for (const [taskName, workerHealth] of Object.entries(healthResults.workers)) {
      if (workerHealth.status === 'unhealthy' || workerHealth.status === 'error') {
        try {
          await this.restartWorker(taskName);
        } catch (error) {
          this.logger.error('Failed to restart worker', {
            taskName,
            error: error.message
          });
        }
      }
    }
  }

  /**
   * Restart a specific worker
   * @private
   */
  async restartWorker(taskName) {
    const workerInfo = this.workers.get(taskName);
    if (!workerInfo) {
      throw new Error(`Worker not found: ${taskName}`);
    }

    this.logger.info('Restarting worker', { taskName });

    try {
      // Shutdown the existing worker
      await workerInfo.worker.shutdown();

      // Create new worker instance
      const newWorker = new EnhancedClaudeWorker();
      
      // Update worker info
      workerInfo.worker = newWorker;
      workerInfo.status = 'restarted';
      workerInfo.errors = [];

      // Re-register the task method
      const taskMethod = this.getTaskMethod(taskName, newWorker);
      this.workerGroup.registerTaskMethod(taskName, taskMethod);

      this.metrics.workerRestarts++;

      this.logger.info('Worker restarted successfully', { taskName });

    } catch (error) {
      this.logger.error('Worker restart failed', {
        taskName,
        error: error.message
      });
      
      workerInfo.status = 'failed';
      workerInfo.errors.push({
        timestamp: new Date().toISOString(),
        error: error.message,
        context: 'restart'
      });

      throw error;
    }
  }

  /**
   * Get task method for worker registration
   * @private
   */
  getTaskMethod(taskName, worker) {
    const methodMap = {
      'parse-marketing-command-enhanced': worker.parseMarketingCommandEnhanced.bind(worker),
      'generate-campaign-content-saga': worker.generateCampaignContentSaga.bind(worker),
      'compensate-content-generation': worker.compensateContentGeneration.bind(worker),
      'coordinate-cross-workflow': worker.coordinateCrossWorkflow.bind(worker)
    };

    return methodMap[taskName];
  }

  /**
   * Handle worker group errors
   * @private
   */
  async handleWorkerGroupError(error) {
    this.logger.error('Handling worker group error', {
      error: error.message,
      code: error.code
    });

    // Implement error recovery based on error type
    if (error.code === 'CONNECTION_LOST') {
      await this.handleConnectionLoss();
    } else if (error.code === 'TASK_TIMEOUT') {
      await this.handleTaskTimeouts();
    } else if (error.code === 'WORKER_OVERLOAD') {
      await this.handleWorkerOverload();
    }
  }

  /**
   * Handle connection loss to Little Horse
   * @private
   */
  async handleConnectionLoss() {
    this.logger.warn('Connection to Little Horse lost, attempting reconnect');

    try {
      // Attempt to reconnect
      await this.workerGroup.reconnect();
      this.logger.info('Successfully reconnected to Little Horse');
    } catch (error) {
      this.logger.error('Failed to reconnect to Little Horse', {
        error: error.message
      });
      
      // Schedule retry
      setTimeout(() => {
        this.handleConnectionLoss();
      }, 5000);
    }
  }

  /**
   * Handle task timeouts
   * @private
   */
  async handleTaskTimeouts() {
    this.logger.warn('Task timeouts detected, checking worker performance');

    // Check if any workers are consistently timing out
    for (const [taskName, workerInfo] of this.workers.entries()) {
      const recentErrors = workerInfo.errors.slice(-5);
      const timeoutErrors = recentErrors.filter(e => e.error.includes('timeout'));
      
      if (timeoutErrors.length >= 3) {
        this.logger.warn('Worker has frequent timeouts, restarting', { taskName });
        await this.restartWorker(taskName);
      }
    }
  }

  /**
   * Handle worker overload
   * @private
   */
  async handleWorkerOverload() {
    this.logger.warn('Worker overload detected, implementing backpressure');

    // Reduce concurrent task limits temporarily
    const currentLimit = config.worker.maxConcurrentTasks;
    const reducedLimit = Math.max(1, Math.floor(currentLimit * 0.7));

    this.logger.info('Reducing concurrent task limit', {
      from: currentLimit,
      to: reducedLimit
    });

    // This would typically involve reconfiguring the worker group
    // Implementation depends on your specific Little Horse client
  }

  /**
   * Update task execution metrics
   * @private
   */
  updateTaskMetrics(event, duration = null) {
    switch (event) {
      case 'started':
        // Metrics updated when task starts
        break;
        
      case 'completed':
        this.metrics.totalTasksProcessed++;
        if (duration) {
          const totalTime = this.metrics.averageTaskDuration * (this.metrics.totalTasksProcessed - 1) + duration;
          this.metrics.averageTaskDuration = totalTime / this.metrics.totalTasksProcessed;
        }
        break;
        
      case 'failed':
        this.metrics.totalTasksProcessed++;
        break;
    }
  }

  /**
   * Get orchestrator status and metrics
   */
  getStatus() {
    const workerStatuses = {};
    
    for (const [taskName, workerInfo] of this.workers.entries()) {
      workerStatuses[taskName] = {
        status: workerInfo.status,
        tasksProcessed: workerInfo.tasksProcessed,
        lastTaskAt: workerInfo.lastTaskAt,
        errorCount: workerInfo.errors.length
      };
    }

    return {
      isRunning: this.isRunning,
      metrics: this.metrics,
      workers: workerStatuses,
      littleHorse: {
        connected: this.workerGroup?.isConnected() || false,
        host: config.littlehorse.apiHost,
        port: config.littlehorse.apiPort
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Graceful shutdown of orchestrator and all workers
   */
  async shutdown() {
    if (!this.isRunning) {
      this.logger.info('Worker orchestrator already stopped');
      return;
    }

    this.logger.info('Shutting down worker orchestrator');

    try {
      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = null;
      }

      // Shutdown all workers
      const shutdownPromises = [];
      for (const [taskName, workerInfo] of this.workers.entries()) {
        shutdownPromises.push(
          workerInfo.worker.shutdown().catch(error => {
            this.logger.error('Worker shutdown failed', {
              taskName,
              error: error.message
            });
          })
        );
      }

      await Promise.allSettled(shutdownPromises);

      // Stop worker group
      if (this.workerGroup) {
        await this.workerGroup.stop();
      }

      this.isRunning = false;
      this.workers.clear();

      this.logger.info('Worker orchestrator shutdown complete', {
        totalTasksProcessed: this.metrics.totalTasksProcessed,
        workerRestarts: this.metrics.workerRestarts
      });

    } catch (error) {
      this.logger.error('Error during orchestrator shutdown', {
        error: error.message
      });
      throw error;
    }
  }
}

export default WorkerOrchestrator;