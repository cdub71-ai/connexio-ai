const SimpleSlackBot = require('./simple-slack-bot-cjs.js');

const logger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || '')
};

class SimpleWorkerMain {
  constructor() {
    this.slackBot = new SimpleSlackBot();
    this.isShuttingDown = false;
    
    this.setupShutdownHandlers();
    
    logger.info('Connexio.ai Simple Workers initialized');
  }

  async start() {
    try {
      logger.info('Starting Connexio.ai Simple Workers...');

      // Start Slack bot
      const port = process.env.PORT || 3000;
      await this.slackBot.start(port);
      
      logger.info('Simple Workers started successfully', {
        port: port,
        environment: process.env.NODE_ENV || 'development',
        slackToken: process.env.SLACK_BOT_TOKEN ? 'configured' : 'missing',
        slackSecret: process.env.SLACK_SIGNING_SECRET ? 'configured' : 'missing',
      });

    } catch (error) {
      logger.error('Failed to start workers', { error: error.message });
      process.exit(1);
    }
  }

  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      if (this.isShuttingDown) {
        logger.warn('Shutdown already in progress, forcing exit');
        process.exit(1);
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        await this.slackBot.shutdown();
        logger.info('All workers shut down successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2'));

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
}

// Start the simple workers
const workers = new SimpleWorkerMain();
workers.start().catch((error) => {
  console.error('Failed to start workers:', error.message);
  process.exit(1);
});