/**
 * Little Horse Workflow Monitoring System
 * Provides comprehensive monitoring and observability for workflow execution
 */

import { metricsCollector } from './metrics-collector.js';
import { createServiceLogger, logWorkflowEvent } from './logger.js';
import EventEmitter from 'events';

const logger = createServiceLogger('workflow-monitor');

class WorkflowMonitor extends EventEmitter {
  constructor() {
    super();
    this.activeWorkflows = new Map();
    this.workflowStats = new Map();
    this.taskStats = new Map();
    this.healthCheckInterval = null;
    this.cleanupInterval = null;
    
    this.startHealthChecks();
    this.startCleanup();
  }

  /**
   * Track workflow lifecycle events
   */
  trackWorkflowStart(workflowId, workflowName, version = '1.0', metadata = {}) {
    const startTime = Date.now();
    
    const workflowData = {
      id: workflowId,
      name: workflowName,
      version,
      status: 'running',
      startTime,
      tasks: new Map(),
      metadata: {
        ...metadata,
        region: process.env.FLY_REGION || 'unknown',
        machineId: process.env.FLY_MACHINE_ID || 'unknown'
      }
    };
    
    this.activeWorkflows.set(workflowId, workflowData);
    
    // Update stats
    const statsKey = `${workflowName}:${version}`;
    if (!this.workflowStats.has(statsKey)) {
      this.workflowStats.set(statsKey, {
        name: workflowName,
        version,
        totalStarted: 0,
        totalCompleted: 0,
        totalFailed: 0,
        totalErrors: 0,
        avgDuration: 0,
        lastExecution: null,
        activeTasks: 0,
        errorRate: 0
      });
    }
    
    const stats = this.workflowStats.get(statsKey);
    stats.totalStarted++;
    stats.lastExecution = startTime;
    
    // Record metrics
    metricsCollector.recordWorkflowStart(workflowName, version);
    
    // Log event
    logWorkflowEvent(workflowId, 'started', {
      workflowName,
      version,
      ...metadata
    });
    
    // Emit event
    this.emit('workflow:started', { workflowId, workflowName, version, metadata });
    
    logger.info(`Workflow started: ${workflowName}`, {
      workflowId,
      workflowName,
      version,
      metadata
    });
  }

  trackWorkflowComplete(workflowId, status = 'completed') {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      logger.warn('Attempted to complete unknown workflow', { workflowId });
      return;
    }
    
    const endTime = Date.now();
    const duration = (endTime - workflow.startTime) / 1000;
    
    workflow.status = status;
    workflow.endTime = endTime;
    workflow.duration = duration;
    
    // Update stats
    const statsKey = `${workflow.name}:${workflow.version}`;
    const stats = this.workflowStats.get(statsKey);
    if (stats) {
      if (status === 'completed') {
        stats.totalCompleted++;
      } else {
        stats.totalFailed++;
      }
      
      // Update average duration
      const totalExecutions = stats.totalCompleted + stats.totalFailed;
      stats.avgDuration = ((stats.avgDuration * (totalExecutions - 1)) + duration) / totalExecutions;
      
      // Update error rate
      stats.errorRate = stats.totalFailed / stats.totalStarted;
    }
    
    // Record metrics
    metricsCollector.recordWorkflowComplete(workflow.name, duration, status, workflow.version);
    
    // Log event
    logWorkflowEvent(workflowId, status, {
      workflowName: workflow.name,
      version: workflow.version,
      duration,
      taskCount: workflow.tasks.size,
      ...workflow.metadata
    });
    
    // Emit event
    this.emit('workflow:completed', { 
      workflowId, 
      workflowName: workflow.name, 
      status, 
      duration,
      taskCount: workflow.tasks.size
    });
    
    logger.info(`Workflow ${status}: ${workflow.name}`, {
      workflowId,
      workflowName: workflow.name,
      status,
      duration,
      taskCount: workflow.tasks.size
    });
    
    // Remove from active workflows
    this.activeWorkflows.delete(workflowId);
  }

  trackWorkflowError(workflowId, error, taskName = null) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      logger.warn('Attempted to record error for unknown workflow', { workflowId });
      return;
    }
    
    // Update workflow error count
    workflow.errorCount = (workflow.errorCount || 0) + 1;
    
    // Update stats
    const statsKey = `${workflow.name}:${workflow.version}`;
    const stats = this.workflowStats.get(statsKey);
    if (stats) {
      stats.totalErrors++;
      stats.errorRate = stats.totalErrors / stats.totalStarted;
    }
    
    // Record metrics
    metricsCollector.recordWorkflowError(workflow.name, error.name || 'UnknownError', taskName);
    
    // Log event
    logWorkflowEvent(workflowId, 'error', {
      workflowName: workflow.name,
      version: workflow.version,
      error: error.message,
      errorType: error.name || 'UnknownError',
      taskName,
      stack: error.stack
    });
    
    // Emit event
    this.emit('workflow:error', { 
      workflowId, 
      workflowName: workflow.name, 
      error, 
      taskName 
    });
    
    logger.error(`Workflow error: ${workflow.name}`, {
      workflowId,
      workflowName: workflow.name,
      error: error.message,
      errorType: error.name,
      taskName,
      stack: error.stack
    });
  }

  /**
   * Track task execution within workflows
   */
  trackTaskStart(workflowId, taskId, taskName, metadata = {}) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      logger.warn('Attempted to start task for unknown workflow', { workflowId, taskId });
      return;
    }
    
    const startTime = Date.now();
    const taskData = {
      id: taskId,
      name: taskName,
      status: 'running',
      startTime,
      metadata,
      retryCount: 0
    };
    
    workflow.tasks.set(taskId, taskData);
    
    // Update task stats
    if (!this.taskStats.has(taskName)) {
      this.taskStats.set(taskName, {
        name: taskName,
        totalStarted: 0,
        totalCompleted: 0,
        totalFailed: 0,
        totalRetries: 0,
        avgDuration: 0,
        errorRate: 0,
        activeCount: 0
      });
    }
    
    const taskStats = this.taskStats.get(taskName);
    taskStats.totalStarted++;
    taskStats.activeCount++;
    
    // Update workflow stats
    const statsKey = `${workflow.name}:${workflow.version}`;
    const workflowStats = this.workflowStats.get(statsKey);
    if (workflowStats) {
      workflowStats.activeTasks++;
    }
    
    logger.debug(`Task started: ${taskName}`, {
      workflowId,
      taskId,
      taskName,
      metadata
    });
  }

  trackTaskComplete(workflowId, taskId, status = 'completed', output = null) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      logger.warn('Attempted to complete task for unknown workflow', { workflowId, taskId });
      return;
    }
    
    const task = workflow.tasks.get(taskId);
    if (!task) {
      logger.warn('Attempted to complete unknown task', { workflowId, taskId });
      return;
    }
    
    const endTime = Date.now();
    const duration = (endTime - task.startTime) / 1000;
    
    task.status = status;
    task.endTime = endTime;
    task.duration = duration;
    task.output = output;
    
    // Update task stats
    const taskStats = this.taskStats.get(task.name);
    if (taskStats) {
      taskStats.activeCount--;
      
      if (status === 'completed') {
        taskStats.totalCompleted++;
      } else {
        taskStats.totalFailed++;
      }
      
      // Update average duration
      const totalExecutions = taskStats.totalCompleted + taskStats.totalFailed;
      taskStats.avgDuration = ((taskStats.avgDuration * (totalExecutions - 1)) + duration) / totalExecutions;
      
      // Update error rate
      taskStats.errorRate = taskStats.totalFailed / taskStats.totalStarted;
    }
    
    // Update workflow stats
    const statsKey = `${workflow.name}:${workflow.version}`;
    const workflowStats = this.workflowStats.get(statsKey);
    if (workflowStats) {
      workflowStats.activeTasks--;
    }
    
    // Record metrics
    metricsCollector.recordTaskExecution(task.name, 'workflow-task', duration, status);
    
    logger.debug(`Task ${status}: ${task.name}`, {
      workflowId,
      taskId,
      taskName: task.name,
      status,
      duration,
      retryCount: task.retryCount
    });
  }

  trackTaskRetry(workflowId, taskId, retryCount, reason) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return;
    
    const task = workflow.tasks.get(taskId);
    if (!task) return;
    
    task.retryCount = retryCount;
    
    // Update task stats
    const taskStats = this.taskStats.get(task.name);
    if (taskStats) {
      taskStats.totalRetries++;
    }
    
    logger.warn(`Task retry: ${task.name}`, {
      workflowId,
      taskId,
      taskName: task.name,
      retryCount,
      reason
    });
  }

  /**
   * Get workflow statistics
   */
  getWorkflowStats(workflowName = null, version = null) {
    if (workflowName) {
      const key = version ? `${workflowName}:${version}` : workflowName;
      if (version) {
        return this.workflowStats.get(key);
      } else {
        // Return all versions of the workflow
        const stats = [];
        for (const [statsKey, data] of this.workflowStats.entries()) {
          if (data.name === workflowName) {
            stats.push(data);
          }
        }
        return stats;
      }
    }
    
    return Array.from(this.workflowStats.values());
  }

  getTaskStats(taskName = null) {
    if (taskName) {
      return this.taskStats.get(taskName);
    }
    
    return Array.from(this.taskStats.values());
  }

  getActiveWorkflows() {
    const workflows = [];
    for (const [workflowId, workflow] of this.activeWorkflows.entries()) {
      workflows.push({
        id: workflowId,
        name: workflow.name,
        version: workflow.version,
        status: workflow.status,
        startTime: workflow.startTime,
        duration: Date.now() - workflow.startTime,
        taskCount: workflow.tasks.size,
        errorCount: workflow.errorCount || 0,
        metadata: workflow.metadata
      });
    }
    
    return workflows;
  }

  /**
   * Health check for stuck or long-running workflows
   */
  performHealthCheck() {
    const now = Date.now();
    const maxWorkflowDuration = 3600000; // 1 hour
    const maxTaskDuration = 900000; // 15 minutes
    
    let stuckWorkflows = 0;
    let stuckTasks = 0;
    
    for (const [workflowId, workflow] of this.activeWorkflows.entries()) {
      const workflowDuration = now - workflow.startTime;
      
      // Check for stuck workflows
      if (workflowDuration > maxWorkflowDuration) {
        stuckWorkflows++;
        
        logger.warn('Long-running workflow detected', {
          workflowId,
          workflowName: workflow.name,
          duration: workflowDuration / 1000,
          taskCount: workflow.tasks.size
        });
        
        this.emit('workflow:stuck', {
          workflowId,
          workflowName: workflow.name,
          duration: workflowDuration
        });
      }
      
      // Check for stuck tasks
      for (const [taskId, task] of workflow.tasks.entries()) {
        if (task.status === 'running') {
          const taskDuration = now - task.startTime;
          
          if (taskDuration > maxTaskDuration) {
            stuckTasks++;
            
            logger.warn('Long-running task detected', {
              workflowId,
              taskId,
              taskName: task.name,
              duration: taskDuration / 1000,
              retryCount: task.retryCount
            });
            
            this.emit('task:stuck', {
              workflowId,
              taskId,
              taskName: task.name,
              duration: taskDuration
            });
          }
        }
      }
    }
    
    // Record health metrics
    metricsCollector.metrics.activeWorkflows.set({}, this.activeWorkflows.size);
    
    if (stuckWorkflows > 0 || stuckTasks > 0) {
      logger.warn('Health check completed', {
        activeWorkflows: this.activeWorkflows.size,
        stuckWorkflows,
        stuckTasks
      });
    }
  }

  /**
   * Generate monitoring report
   */
  generateReport() {
    const now = Date.now();
    const report = {
      timestamp: now,
      summary: {
        activeWorkflows: this.activeWorkflows.size,
        totalWorkflowTypes: this.workflowStats.size,
        totalTaskTypes: this.taskStats.size
      },
      workflows: [],
      tasks: [],
      topErrors: this.getTopErrors(),
      slowestWorkflows: this.getSlowestWorkflows(),
      slowestTasks: this.getSlowestTasks()
    };
    
    // Add workflow stats
    for (const stats of this.workflowStats.values()) {
      report.workflows.push({
        name: stats.name,
        version: stats.version,
        totalStarted: stats.totalStarted,
        totalCompleted: stats.totalCompleted,
        totalFailed: stats.totalFailed,
        successRate: stats.totalStarted > 0 ? stats.totalCompleted / stats.totalStarted : 0,
        errorRate: stats.errorRate,
        avgDuration: stats.avgDuration,
        activeTasks: stats.activeTasks
      });
    }
    
    // Add task stats
    for (const stats of this.taskStats.values()) {
      report.tasks.push({
        name: stats.name,
        totalStarted: stats.totalStarted,
        totalCompleted: stats.totalCompleted,
        totalFailed: stats.totalFailed,
        successRate: stats.totalStarted > 0 ? stats.totalCompleted / stats.totalStarted : 0,
        errorRate: stats.errorRate,
        avgDuration: stats.avgDuration,
        activeCount: stats.activeCount,
        totalRetries: stats.totalRetries
      });
    }
    
    return report;
  }

  getTopErrors() {
    // This would be implemented with error tracking
    return [];
  }

  getSlowestWorkflows() {
    return Array.from(this.workflowStats.values())
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);
  }

  getSlowestTasks() {
    return Array.from(this.taskStats.values())
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);
  }

  /**
   * Start background monitoring
   */
  startHealthChecks(intervalMs = 30000) {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalMs);
    
    logger.info('Started workflow health checks', { intervalMs });
  }

  startCleanup(intervalMs = 300000) { // 5 minutes
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);
    
    logger.info('Started workflow cleanup', { intervalMs });
  }

  cleanup() {
    const now = Date.now();
    const maxAge = 86400000; // 24 hours
    
    // Clean up old completed workflows from memory
    for (const [workflowId, workflow] of this.activeWorkflows.entries()) {
      if (workflow.endTime && (now - workflow.endTime) > maxAge) {
        this.activeWorkflows.delete(workflowId);
      }
    }
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    logger.info('Stopped workflow monitoring');
  }
}

// Export singleton instance
const workflowMonitor = new WorkflowMonitor();

export { WorkflowMonitor, workflowMonitor };
export default workflowMonitor;