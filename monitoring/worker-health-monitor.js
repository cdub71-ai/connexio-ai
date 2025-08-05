/**
 * Task Worker Health Monitoring System
 * Comprehensive monitoring and health checks for all worker types
 */

import os from 'os';
import { metricsCollector } from './metrics-collector.js';
import { createServiceLogger, logTaskEvent } from './logger.js';
import EventEmitter from 'events';

const logger = createServiceLogger('worker-health-monitor');

class WorkerHealthMonitor extends EventEmitter {
  constructor() {
    super();
    this.workers = new Map();
    this.workerTypes = new Map();
    this.healthCheckInterval = null;
    this.metricsCollectionInterval = null;
    this.alertThresholds = {
      cpu: 85, // CPU usage percentage
      memory: 90, // Memory usage percentage
      errorRate: 0.1, // 10% error rate
      responseTime: 10000, // 10 seconds
      queueDepth: 1000, // Queue depth
      consecutiveFailures: 5
    };
    
    this.workerId = this.generateWorkerId();
    this.workerType = process.env.WORKER_TYPE || 'general';
    this.region = process.env.FLY_REGION || 'unknown';
    this.machineId = process.env.FLY_MACHINE_ID || 'unknown';
    
    this.initializeWorker();
    this.startMonitoring();
  }

  generateWorkerId() {
    const hostname = os.hostname();
    const pid = process.pid;
    const timestamp = Date.now();
    return `${hostname}-${pid}-${timestamp}`;
  }

  initializeWorker() {
    const workerData = {
      id: this.workerId,
      type: this.workerType,
      region: this.region,
      machineId: this.machineId,
      pid: process.pid,
      startTime: Date.now(),
      status: 'healthy',
      lastHealthCheck: Date.now(),
      metrics: {
        tasksProcessed: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        tasksInProgress: 0,
        avgProcessingTime: 0,
        lastTaskTime: null,
        consecutiveFailures: 0,
        errorRate: 0,
        queueDepth: 0,
        cpu: 0,
        memory: 0,
        uptime: 0
      },
      queues: new Map(),
      activeTasks: new Map(),
      recentErrors: []
    };

    this.workers.set(this.workerId, workerData);
    
    if (!this.workerTypes.has(this.workerType)) {
      this.workerTypes.set(this.workerType, {
        type: this.workerType,
        totalWorkers: 0,
        healthyWorkers: 0,
        unhealthyWorkers: 0,
        totalTasks: 0,
        avgResponseTime: 0,
        errorRate: 0,
        totalQueues: 0,
        totalQueueDepth: 0
      });
    }

    const typeStats = this.workerTypes.get(this.workerType);
    typeStats.totalWorkers++;
    typeStats.healthyWorkers++;

    logger.info('Worker initialized', {
      workerId: this.workerId,
      workerType: this.workerType,
      region: this.region,
      machineId: this.machineId
    });
  }

  /**
   * Register a task queue for monitoring
   */
  registerQueue(queueName, config = {}) {
    const worker = this.workers.get(this.workerId);
    if (!worker) return;

    const queueData = {
      name: queueName,
      type: config.type || 'fifo',
      maxDepth: config.maxDepth || 1000,
      currentDepth: 0,
      processedCount: 0,
      errorCount: 0,
      avgProcessingTime: 0,
      lastProcessedTime: null,
      isHealthy: true,
      ...config
    };

    worker.queues.set(queueName, queueData);

    logger.info('Queue registered', {
      workerId: this.workerId,
      queueName,
      config
    });
  }

  /**
   * Track task execution
   */
  trackTaskStart(taskId, taskName, queueName = 'default', metadata = {}) {
    const worker = this.workers.get(this.workerId);
    if (!worker) return;

    const startTime = Date.now();
    const taskData = {
      id: taskId,
      name: taskName,
      queueName,
      startTime,
      status: 'running',
      metadata,
      retryCount: 0
    };

    worker.activeTasks.set(taskId, taskData);
    worker.metrics.tasksInProgress++;
    worker.metrics.tasksProcessed++;

    // Update queue metrics
    const queue = worker.queues.get(queueName);
    if (queue) {
      queue.currentDepth++;
    }

    // Record metrics
    metricsCollector.recordQueueDepth(queueName, this.workerType, queue ? queue.currentDepth : 0);

    logTaskEvent(taskId, 'started', {
      taskName,
      queueName,
      workerId: this.workerId,
      workerType: this.workerType,
      metadata
    });

    logger.debug('Task started', {
      taskId,
      taskName,
      queueName,
      workerId: this.workerId
    });
  }

  trackTaskComplete(taskId, status = 'completed', output = null, error = null) {
    const worker = this.workers.get(this.workerId);
    if (!worker) return;

    const task = worker.activeTasks.get(taskId);
    if (!task) {
      logger.warn('Attempted to complete unknown task', { taskId, workerId: this.workerId });
      return;
    }

    const endTime = Date.now();
    const duration = (endTime - task.startTime) / 1000;

    task.status = status;
    task.endTime = endTime;
    task.duration = duration;
    task.output = output;
    task.error = error;

    // Update worker metrics
    worker.metrics.tasksInProgress--;
    worker.metrics.lastTaskTime = endTime;

    if (status === 'completed') {
      worker.metrics.tasksCompleted++;
      worker.metrics.consecutiveFailures = 0;
    } else {
      worker.metrics.tasksFailed++;
      worker.metrics.consecutiveFailures++;
      
      if (error) {
        worker.recentErrors.push({
          taskId,
          taskName: task.name,
          error: error.message,
          timestamp: endTime,
          stack: error.stack
        });
        
        // Keep only recent errors (last 10)
        if (worker.recentErrors.length > 10) {
          worker.recentErrors = worker.recentErrors.slice(-10);
        }
      }
    }

    // Update average processing time
    const totalCompleted = worker.metrics.tasksCompleted + worker.metrics.tasksFailed;
    if (totalCompleted > 0) {
      worker.metrics.avgProcessingTime = 
        ((worker.metrics.avgProcessingTime * (totalCompleted - 1)) + duration) / totalCompleted;
    }

    // Update error rate
    if (worker.metrics.tasksProcessed > 0) {
      worker.metrics.errorRate = worker.metrics.tasksFailed / worker.metrics.tasksProcessed;
    }

    // Update queue metrics
    const queue = worker.queues.get(task.queueName);
    if (queue) {
      queue.currentDepth = Math.max(0, queue.currentDepth - 1);
      queue.processedCount++;
      queue.lastProcessedTime = endTime;
      
      if (status === 'failed') {
        queue.errorCount++;
      }
      
      // Update queue average processing time
      if (queue.processedCount > 0) {
        queue.avgProcessingTime = 
          ((queue.avgProcessingTime * (queue.processedCount - 1)) + duration) / queue.processedCount;
      }
    }

    // Record metrics
    metricsCollector.recordTaskExecution(task.name, this.workerType, duration, status);
    metricsCollector.recordQueueDepth(task.queueName, this.workerType, queue ? queue.currentDepth : 0);

    logTaskEvent(taskId, status, {
      taskName: task.name,
      queueName: task.queueName,
      workerId: this.workerId,
      workerType: this.workerType,
      duration,
      retryCount: task.retryCount,
      error: error?.message
    });

    logger.debug(`Task ${status}`, {
      taskId,
      taskName: task.name,
      queueName: task.queueName,
      workerId: this.workerId,
      duration,
      status
    });

    // Remove from active tasks
    worker.activeTasks.delete(taskId);

    // Check for alerts
    this.checkTaskAlerts(worker, task, status);
  }

  /**
   * Collect system metrics
   */
  async collectMetrics() {
    const worker = this.workers.get(this.workerId);
    if (!worker) return;

    try {
      // CPU usage
      const cpuUsage = process.cpuUsage();
      const uptime = process.uptime();
      worker.metrics.cpu = ((cpuUsage.user + cpuUsage.system) / 1000000) / uptime * 100;

      // Memory usage
      const memoryUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      worker.metrics.memory = (memoryUsage.rss / totalMemory) * 100;

      // Uptime
      worker.metrics.uptime = uptime;

      // Queue depths
      let totalQueueDepth = 0;
      for (const queue of worker.queues.values()) {
        totalQueueDepth += queue.currentDepth;
      }
      worker.metrics.queueDepth = totalQueueDepth;

      // Record in metrics collector
      metricsCollector.recordWorkerHealth(this.workerId, this.workerType, worker.status === 'healthy', this.region);
      metricsCollector.metrics.workerMemoryUsage.set(
        { worker_id: this.workerId, worker_type: this.workerType },
        memoryUsage.rss
      );
      metricsCollector.metrics.workerCpuUsage.set(
        { worker_id: this.workerId, worker_type: this.workerType },
        worker.metrics.cpu
      );

      // Update worker type statistics
      this.updateWorkerTypeStats();

    } catch (error) {
      logger.error('Failed to collect worker metrics', {
        workerId: this.workerId,
        error: error.message
      });
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    const worker = this.workers.get(this.workerId);
    if (!worker) return;

    const now = Date.now();
    let isHealthy = true;
    const healthIssues = [];

    // Check CPU usage
    if (worker.metrics.cpu > this.alertThresholds.cpu) {
      isHealthy = false;
      healthIssues.push(`High CPU usage: ${worker.metrics.cpu.toFixed(1)}%`);
    }

    // Check memory usage
    if (worker.metrics.memory > this.alertThresholds.memory) {
      isHealthy = false;
      healthIssues.push(`High memory usage: ${worker.metrics.memory.toFixed(1)}%`);
    }

    // Check error rate
    if (worker.metrics.errorRate > this.alertThresholds.errorRate) {
      isHealthy = false;
      healthIssues.push(`High error rate: ${(worker.metrics.errorRate * 100).toFixed(1)}%`);
    }

    // Check consecutive failures
    if (worker.metrics.consecutiveFailures >= this.alertThresholds.consecutiveFailures) {
      isHealthy = false;
      healthIssues.push(`Consecutive failures: ${worker.metrics.consecutiveFailures}`);
    }

    // Check queue depths
    for (const [queueName, queue] of worker.queues.entries()) {
      if (queue.currentDepth > this.alertThresholds.queueDepth) {
        isHealthy = false;
        healthIssues.push(`High queue depth for ${queueName}: ${queue.currentDepth}`);
      }
    }

    // Check if worker is responsive (has processed tasks recently)
    if (worker.metrics.lastTaskTime && (now - worker.metrics.lastTaskTime) > 300000) { // 5 minutes
      if (worker.metrics.tasksInProgress > 0) {
        isHealthy = false;
        healthIssues.push('Worker appears stuck with tasks in progress');
      }
    }

    const previousStatus = worker.status;
    worker.status = isHealthy ? 'healthy' : 'unhealthy';
    worker.lastHealthCheck = now;
    worker.healthIssues = healthIssues;

    // Emit events for status changes
    if (previousStatus !== worker.status) {
      this.emit('worker:status_change', {
        workerId: this.workerId,
        workerType: this.workerType,
        previousStatus,
        currentStatus: worker.status,
        healthIssues
      });

      if (worker.status === 'unhealthy') {
        logger.warn('Worker health degraded', {
          workerId: this.workerId,
          workerType: this.workerType,
          healthIssues,
          metrics: worker.metrics
        });
      } else {
        logger.info('Worker health recovered', {
          workerId: this.workerId,
          workerType: this.workerType
        });
      }
    }
  }

  /**
   * Check for task-related alerts
   */
  checkTaskAlerts(worker, task, status) {
    // Check for slow tasks
    if (task.duration > (this.alertThresholds.responseTime / 1000)) {
      this.emit('task:slow', {
        workerId: this.workerId,
        taskId: task.id,
        taskName: task.name,
        duration: task.duration,
        threshold: this.alertThresholds.responseTime / 1000
      });
    }

    // Check for consecutive failures
    if (status === 'failed' && worker.metrics.consecutiveFailures >= this.alertThresholds.consecutiveFailures) {
      this.emit('worker:consecutive_failures', {
        workerId: this.workerId,
        workerType: this.workerType,
        consecutiveFailures: worker.metrics.consecutiveFailures,
        recentErrors: worker.recentErrors.slice(-3)
      });
    }
  }

  /**
   * Update worker type statistics
   */
  updateWorkerTypeStats() {
    const typeStats = this.workerTypes.get(this.workerType);
    if (!typeStats) return;

    // Reset counters
    typeStats.healthyWorkers = 0;
    typeStats.unhealthyWorkers = 0;
    typeStats.totalTasks = 0;
    typeStats.totalQueueDepth = 0;
    typeStats.totalQueues = 0;

    let totalResponseTime = 0;
    let totalErrorRate = 0;
    let workerCount = 0;

    // Aggregate from all workers of this type
    for (const worker of this.workers.values()) {
      if (worker.type === this.workerType) {
        workerCount++;
        
        if (worker.status === 'healthy') {
          typeStats.healthyWorkers++;
        } else {
          typeStats.unhealthyWorkers++;
        }

        typeStats.totalTasks += worker.metrics.tasksProcessed;
        typeStats.totalQueueDepth += worker.metrics.queueDepth;
        typeStats.totalQueues += worker.queues.size;
        
        totalResponseTime += worker.metrics.avgProcessingTime;
        totalErrorRate += worker.metrics.errorRate;
      }
    }

    if (workerCount > 0) {
      typeStats.avgResponseTime = totalResponseTime / workerCount;
      typeStats.errorRate = totalErrorRate / workerCount;
    }
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const worker = this.workers.get(this.workerId);
    if (!worker) return null;

    return {
      workerId: this.workerId,
      workerType: this.workerType,
      region: this.region,
      status: worker.status,
      lastHealthCheck: worker.lastHealthCheck,
      healthIssues: worker.healthIssues || [],
      metrics: { ...worker.metrics },
      queues: Array.from(worker.queues.values()),
      activeTasks: worker.activeTasks.size,
      recentErrors: worker.recentErrors.slice(-5),
      uptime: worker.metrics.uptime
    };
  }

  /**
   * Get all worker type statistics
   */
  getWorkerTypeStats() {
    return Array.from(this.workerTypes.values());
  }

  /**
   * Start monitoring
   */
  startMonitoring() {
    // Health checks every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);

    // Metrics collection every 15 seconds
    this.metricsCollectionInterval = setInterval(() => {
      this.collectMetrics();
    }, 15000);

    // Initial collection
    this.collectMetrics();
    this.performHealthCheck();

    logger.info('Started worker health monitoring', {
      workerId: this.workerId,
      workerType: this.workerType
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.metricsCollectionInterval) {
      clearInterval(this.metricsCollectionInterval);
      this.metricsCollectionInterval = null;
    }

    // Update worker type stats
    const typeStats = this.workerTypes.get(this.workerType);
    if (typeStats) {
      typeStats.totalWorkers--;
      if (this.workers.get(this.workerId)?.status === 'healthy') {
        typeStats.healthyWorkers--;
      } else {
        typeStats.unhealthyWorkers--;
      }
    }

    // Remove worker
    this.workers.delete(this.workerId);

    logger.info('Stopped worker health monitoring', {
      workerId: this.workerId,
      workerType: this.workerType
    });
  }

  /**
   * Generate health report
   */
  generateHealthReport() {
    return {
      timestamp: Date.now(),
      workers: Array.from(this.workers.values()).map(worker => ({
        id: worker.id,
        type: worker.type,
        region: worker.region,
        status: worker.status,
        metrics: worker.metrics,
        queues: Array.from(worker.queues.values()),
        activeTasks: worker.activeTasks.size,
        healthIssues: worker.healthIssues || [],
        recentErrors: worker.recentErrors.slice(-3)
      })),
      workerTypes: Array.from(this.workerTypes.values()),
      alertThresholds: this.alertThresholds
    };
  }
}

// Export singleton instance
const workerHealthMonitor = new WorkerHealthMonitor();

export { WorkerHealthMonitor, workerHealthMonitor };
export default workerHealthMonitor;