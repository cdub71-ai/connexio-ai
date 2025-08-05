import ClaudeTaskWorker from './workers/claude-task-worker.js';
import SlackIntegrationWorker from './workers/slack-integration-worker.js';
import MultiChannelOrchestrator from './workers/multi-channel-orchestrator.js';
import SureshotEloquaWorker from './workers/sureshot-eloqua-worker.js';
import WorkflowTriggerService from './services/workflow-trigger.js';
import config from './config/index.js';
import { createContextLogger } from './utils/logger.js';

const logger = createContextLogger({ service: 'workers-main' });

/**
 * Main entry point for Connexio.ai Little Horse workers
 */
class WorkersMain {
  constructor() {
    this.claudeWorker = new ClaudeTaskWorker();
    this.slackWorker = new SlackIntegrationWorker();
    this.multiChannelOrchestrator = new MultiChannelOrchestrator();
    this.sureshotWorker = new SureshotEloquaWorker();
    this.workflowTrigger = new WorkflowTriggerService();
    
    this.isShuttingDown = false;
    
    // Setup graceful shutdown
    this.setupShutdownHandlers();
    
    logger.info('Connexio.ai workers initialized', {
      claudeWorker: 'ready',
      slackWorker: 'ready',
      multiChannelOrchestrator: 'ready',
      sureshotWorker: 'ready',
      workflowTrigger: 'ready',
    });
  }

  /**
   * Start all workers
   */
  async start() {
    try {
      logger.info('Starting Connexio.ai workers...');

      // Start Slack integration worker (includes HTTP server)
      await this.slackWorker.start(config.slack.port);
      
      logger.info('All workers started successfully', {
        slackPort: config.slack.port,
        environment: config.app.nodeEnv,
      });

      // Log worker health status
      this.logHealthStatus();

      // Set up periodic health checks
      this.setupHealthChecks();

    } catch (error) {
      logger.error('Failed to start workers', { error: error.message });
      process.exit(1);
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
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        // Shutdown all workers
        await Promise.all([
          this.claudeWorker.shutdown(),
          this.slackWorker.shutdown(),
          this.multiChannelOrchestrator.shutdown(),
          this.sureshotWorker.shutdown(),
          this.workflowTrigger.shutdown(),
        ]);

        logger.info('All workers shut down successfully');
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
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
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
   * Log health status of all workers
   * @private
   */
  logHealthStatus() {
    const healthStatus = {
      claudeWorker: this.claudeWorker.getHealthStatus(),
      slackWorker: this.slackWorker.getHealthStatus(),
      multiChannelOrchestrator: this.multiChannelOrchestrator.getHealthStatus(),
      sureshotWorker: this.sureshotWorker.getHealthStatus(),
      workflowTrigger: this.workflowTrigger.getHealthStatus(),
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
    };

    logger.info('Workers health status', healthStatus);
  }

  /**
   * Setup periodic health checks
   * @private
   */
  setupHealthChecks() {
    const healthCheckInterval = 60000; // 1 minute

    setInterval(() => {
      if (!this.isShuttingDown) {
        try {
          this.logHealthStatus();
        } catch (error) {
          logger.error('Health check failed', { error: error.message });
        }
      }
    }, healthCheckInterval);

    logger.info('Health checks enabled', { intervalMs: healthCheckInterval });
  }

  /**
   * Get comprehensive health status
   */
  getHealthStatus() {
    return {
      status: this.isShuttingDown ? 'shutting_down' : 'healthy',
      timestamp: new Date().toISOString(),
      workers: {
        claude: this.claudeWorker.getHealthStatus(),
        slack: this.slackWorker.getHealthStatus(),
        multiChannel: this.multiChannelOrchestrator.getHealthStatus(),
        sureshot: this.sureshotWorker.getHealthStatus(),
        workflowTrigger: this.workflowTrigger.getHealthStatus(),
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        pid: process.pid,
      },
      config: {
        nodeEnv: config.app.nodeEnv,
        logLevel: config.app.logLevel,
        slackPort: config.slack.port,
        littlehorseHost: config.littlehorse.apiHost,
        littlehorsePort: config.littlehorse.apiPort,
      },
    };
  }
}

// Create and start workers if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const workers = new WorkersMain();
  workers.start().catch((error) => {
    logger.error('Failed to start workers', { error: error.message });
    process.exit(1);
  });
}

export default WorkersMain;