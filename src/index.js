import express from 'express';
import { BotFrameworkAdapter } from 'botbuilder';
import { config } from './config/index.js';
import { slackBot } from './bots/slack-bot.js';
import { teamsBot } from './bots/teams-bot.js';
import { littleHorseService } from './services/littlehorse.js';
import { logger } from './utils/logger.js';

const app = express();

// Teams Bot Framework adapter
const teamsAdapter = new BotFrameworkAdapter({
  appId: config.teams.appId,
  appPassword: config.teams.appPassword,
});

teamsAdapter.onTurnError = async (context, error) => {
  logger.error('Teams adapter error:', error);
  await context.sendActivity('Sorry, an error occurred.');
};

// Teams webhook endpoint
app.post('/api/messages', (req, res) => {
  teamsAdapter.processActivity(req, res, async (context) => {
    await teamsBot.run(context);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Initialize services and start bots
async function startApplication() {
  try {
    logger.info('Initializing Connexio.ai...');

    // Initialize Little Horse workflows
    await littleHorseService.initializeWorkflows();

    // Start Slack bot (socket mode)
    await slackBot.start();

    // Start Express server for Teams bot
    const port = config.app.port;
    app.listen(port, () => {
      logger.info(`Connexio.ai server running on port ${port}`);
      logger.info('✅ Slack bot: Connected via Socket Mode');
      logger.info('✅ Teams bot: Listening for webhooks');
      logger.info('✅ Little Horse: Workflows initialized');
    });

  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down Connexio.ai...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down Connexio.ai...');
  process.exit(0);
});

startApplication();