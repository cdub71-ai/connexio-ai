import { App } from '@slack/bolt';
import { config } from '../config/index.js';
import { anthropicService } from '../services/anthropic.js';
import { sureshotService } from '../services/sureshot.js';
import { workflowClient } from '../services/workflow-client.js';
import { logger } from '../utils/logger.js';

class SlackBot {
  constructor() {
    this.app = new App({
      token: config.slack.botToken,
      signingSecret: config.slack.signingSecret,
      appToken: config.slack.appToken,
      socketMode: true,
    });

    this.setupCommands();
    this.setupEvents();
  }

  setupCommands() {
    this.app.command('/connexio', async ({ command, ack, respond }) => {
      await ack();
      
      try {
        // Execute via Little Horse workflow
        const workflowResult = await workflowClient.executeMarketingCampaignWorkflow(command);
        
        await respond({
          text: `🚀 Processing your request via Connexio.ai workflow...\n\n` +
                `**Workflow ID:** \`${workflowResult.workflowRunId}\`\n` +
                `**Status:** ${workflowResult.status}\n\n` +
                `_I'll send you the results shortly!_`,
          response_type: 'ephemeral',
        });

        logger.info('Connexio workflow started for Slack command:', {
          workflowRunId: workflowResult.workflowRunId,
          userId: command.user_id,
          command: command.text,
        });

      } catch (error) {
        logger.error('Slack connexio command error:', error);
        
        // Fallback to direct AI processing
        try {
          const aiResponse = await anthropicService.processMessage(command.text, {
            platform: 'slack',
            userId: command.user_id,
            channelId: command.channel_id,
          });

          await respond({
            text: `⚠️ Workflow temporarily unavailable. Here's a direct response:\n\n${aiResponse}`,
            response_type: 'ephemeral',
          });
        } catch (fallbackError) {
          logger.error('Fallback AI processing also failed:', fallbackError);
          await respond({
            text: 'Sorry, I encountered an error processing your request. Please try again later.',
            response_type: 'ephemeral',
          });
        }
      }
    });

    this.app.command('/create-campaign', async ({ command, ack, respond }) => {
      await ack();
      
      try {
        // Create a modified command for workflow execution
        const workflowCommand = {
          ...command,
          text: `create campaign ${command.text}`.trim(),
        };

        const workflowResult = await workflowClient.executeMarketingCampaignWorkflow(workflowCommand);
        
        await respond({
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '🚀 *Campaign Creation Started*\n\n' +
                      `Your campaign creation request is being processed via Connexio.ai workflow.\n\n` +
                      `**Workflow ID:** \`${workflowResult.workflowRunId}\`\n` +
                      `**Status:** ${workflowResult.status}\n\n` +
                      `_I'll analyze your request and create the appropriate campaign for you._`,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Check Status' },
                  action_id: 'check_workflow_status',
                  value: workflowResult.workflowRunId,
                },
              ],
            },
          ],
          response_type: 'ephemeral',
        });
      } catch (error) {
        logger.error('Create campaign command error:', error);
        await respond('Error starting campaign creation workflow.');
      }
    });

    this.app.command('/campaign-status', async ({ command, ack, respond }) => {
      await ack();
      
      const campaignId = command.text.trim();
      if (!campaignId) {
        await respond('Please provide a campaign ID: `/campaign-status CAMPAIGN_ID`');
        return;
      }

      try {
        const status = await sureshotService.getCampaignStatus(campaignId);
        await respond({
          text: `📊 *Campaign Status: ${campaignId}*\n\n` +
                `Status: ${status.status}\n` +
                `Created: ${status.createdAt}\n` +
                `Sent: ${status.sentCount || 0}\n` +
                `Opens: ${status.openCount || 0}\n` +
                `Clicks: ${status.clickCount || 0}`,
          response_type: 'ephemeral',
        });
      } catch (error) {
        logger.error('Campaign status error:', error);
        await respond('Error retrieving campaign status.');
      }
    });
  }

  setupEvents() {
    this.app.event('app_mention', async ({ event, say }) => {
      try {
        const aiResponse = await anthropicService.processMessage(event.text, {
          platform: 'slack',
          userId: event.user,
          channelId: event.channel,
        });

        await say({
          text: aiResponse,
          thread_ts: event.ts,
        });
      } catch (error) {
        logger.error('Slack app mention error:', error);
        await say('Sorry, I encountered an error processing your message.');
      }
    });

    this.app.action('check_workflow_status', async ({ ack, body, respond }) => {
      await ack();
      
      try {
        const workflowRunId = body.actions[0].value;
        const status = await workflowClient.getWorkflowStatus(workflowRunId);
        
        await respond({
          text: `📊 **Workflow Status Update**\n\n` +
                `**ID:** \`${status.id}\`\n` +
                `**Status:** ${status.status}\n` +
                `**Started:** ${new Date(status.startTime).toLocaleString()}\n` +
                `${status.endTime ? `**Completed:** ${new Date(status.endTime).toLocaleString()}` : ''}`,
          response_type: 'ephemeral',
        });
      } catch (error) {
        logger.error('Check workflow status error:', error);
        await respond({
          text: 'Error retrieving workflow status.',
          response_type: 'ephemeral',
        });
      }
    });

    this.app.action('create_email_campaign', async ({ ack, body, client }) => {
      await ack();
      logger.info('Email campaign creation requested');
    });

    this.app.action('create_sms_campaign', async ({ ack, body, client }) => {
      await ack();
      logger.info('SMS campaign creation requested');
    });
  }

  async start() {
    try {
      await this.app.start();
      logger.info('Slack bot is running!');
    } catch (error) {
      logger.error('Failed to start Slack bot:', error);
      throw error;
    }
  }
}

export const slackBot = new SlackBot();