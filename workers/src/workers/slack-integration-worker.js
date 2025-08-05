import { LHTaskWorker } from 'littlehorse-client';
import { App, ExpressReceiver } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import crypto from 'crypto';
import config from '../config/index.js';
import { createContextLogger, createTimer } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Little Horse Task Worker for Slack Integration
 * Handles webhooks, slash commands, interactive messages, and workflow triggers
 */
class SlackIntegrationWorker {
  constructor() {
    this.logger = createContextLogger({ service: 'slack-integration-worker' });
    
    // Initialize Express receiver for webhook handling
    this.receiver = new ExpressReceiver({
      signingSecret: config.slack.signingSecret,
      endpoints: '/slack/events',
      processBeforeResponse: true,
    });

    // Initialize Slack app with proper configuration
    this.app = new App({
      token: config.slack.botToken,
      signingSecret: config.slack.signingSecret,
      receiver: this.receiver,
      customRoutes: [
        {
          path: '/slack/webhook',
          method: ['POST'],
          handler: this.handleWebhook.bind(this),
        },
        {
          path: '/slack/interactive',
          method: ['POST'],
          handler: this.handleInteractive.bind(this),
        },
      ],
    });

    // Initialize Web API client
    this.webClient = new WebClient(config.slack.botToken);

    // Metrics tracking
    this.metrics = {
      totalWebhooks: 0,
      totalCommands: 0,
      totalInteractions: 0,
      workflowsTriggered: 0,
      errors: 0,
    };

    // Setup event handlers
    this.setupSlackHandlers();

    this.logger.info('Slack integration worker initialized', {
      signingSecret: config.slack.signingSecret ? 'configured' : 'missing',
      botToken: config.slack.botToken ? 'configured' : 'missing',
    });
  }

  /**
   * Process incoming Slack webhook
   * @param {Object} webhookPayload - Raw webhook payload from Slack
   * @param {string} workflowId - Little Horse workflow ID to trigger
   * @param {Object} context - Additional context
   */
  @LHTaskWorker('process-slack-webhook')
  async processSlackWebhook(webhookPayload, workflowId, context = {}) {
    const taskId = uuidv4();
    const timer = createTimer('slack-webhook-processing');
    const logger = createContextLogger({
      service: 'slack-integration-worker',
      taskId,
      workflowId: context.wfRunId,
    });

    logger.taskStart(taskId, workflowId, { eventType: webhookPayload.type });
    this.metrics.totalWebhooks++;

    try {
      // Validate webhook signature
      const isValid = this.verifySlackSignature(
        webhookPayload.rawBody,
        webhookPayload.headers
      );

      if (!isValid) {
        throw new Error('Invalid Slack webhook signature');
      }

      // Parse webhook event
      const event = this.parseWebhookEvent(webhookPayload);
      
      // Authenticate user and workspace
      const authResult = await this.authenticateSlackRequest(event);
      
      // Process different event types
      let result;
      switch (event.type) {
        case 'url_verification':
          result = await this.handleUrlVerification(event);
          break;
        case 'event_callback':
          result = await this.handleEventCallback(event, workflowId, logger);
          break;
        case 'interactive_message':
          result = await this.handleInteractiveMessage(event, workflowId, logger);
          break;
        case 'slash_command':
          result = await this.handleSlashCommand(event, workflowId, logger);
          break;
        default:
          result = await this.handleUnknownEvent(event, logger);
      }

      const duration = timer.end();
      logger.taskComplete(taskId, workflowId, result, duration);

      return {
        success: true,
        eventType: event.type,
        result,
        authentication: authResult,
        processingTimeMs: duration,
        taskId,
      };

    } catch (error) {
      const duration = timer.end();
      this.metrics.errors++;
      logger.taskError(taskId, workflowId, error, duration);

      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        processingTimeMs: duration,
        taskId,
      };
    }
  }

  /**
   * Send formatted response back to Slack
   * @param {Object} responseData - Response data with channel, message, etc.
   * @param {Object} context - Context from workflow
   */
  @LHTaskWorker('send-slack-response')
  async sendSlackResponse(responseData, context = {}) {
    const taskId = uuidv4();
    const timer = createTimer('slack-response-sending');
    const logger = createContextLogger({
      service: 'slack-integration-worker',
      taskId,
      workflowId: context.wfRunId,
    });

    logger.taskStart(taskId, context.wfRunId, { 
      channelId: responseData.channelId,
      messageType: responseData.messageType 
    });

    try {
      // Format the message based on type
      const formattedMessage = this.formatSlackMessage(responseData);
      
      // Send message via appropriate method
      let result;
      if (responseData.responseUrl) {
        // Send via response URL (for slash commands and interactions)
        result = await this.sendViaResponseUrl(responseData.responseUrl, formattedMessage);
      } else if (responseData.channelId) {
        // Send via Web API
        result = await this.webClient.chat.postMessage({
          channel: responseData.channelId,
          ...formattedMessage,
        });
      } else {
        throw new Error('No valid channel or response URL provided');
      }

      const duration = timer.end();
      logger.taskComplete(taskId, context.wfRunId, result, duration);

      return {
        success: true,
        messageTs: result.ts,
        channel: result.channel,
        processingTimeMs: duration,
      };

    } catch (error) {
      const duration = timer.end();
      this.metrics.errors++;
      logger.taskError(taskId, context.wfRunId, error, duration);

      return {
        success: false,
        error: error.message,
        processingTimeMs: duration,
      };
    }
  }

  /**
   * Setup Slack event handlers
   * @private
   */
  setupSlackHandlers() {
    // Slash command handlers
    this.app.command('/connexio', this.handleConnexioCommand.bind(this));
    this.app.command('/create-campaign', this.handleCreateCampaignCommand.bind(this));
    this.app.command('/campaign-status', this.handleCampaignStatusCommand.bind(this));

    // Interactive component handlers
    this.app.action('trigger_workflow', this.handleWorkflowTrigger.bind(this));
    this.app.action('check_status', this.handleStatusCheck.bind(this));
    this.app.action(/^campaign_action_/, this.handleCampaignAction.bind(this));

    // Event handlers
    this.app.event('app_mention', this.handleAppMention.bind(this));
    this.app.event('message', this.handleDirectMessage.bind(this));

    // Global error handler
    this.app.error(this.handleGlobalError.bind(this));
  }

  /**
   * Verify Slack webhook signature
   * @private
   */
  verifySlackSignature(rawBody, headers) {
    const slackSignature = headers['x-slack-signature'];
    const timestamp = headers['x-slack-request-timestamp'];

    if (!slackSignature || !timestamp) {
      return false;
    }

    // Prevent replay attacks
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestamp) > 300) {
      return false;
    }

    // Verify signature
    const baseString = `v0:${timestamp}:${rawBody}`;
    const expectedSignature = `v0=${crypto
      .createHmac('sha256', config.slack.signingSecret)
      .update(baseString)
      .digest('hex')}`;

    return crypto.timingSafeEqual(
      Buffer.from(slackSignature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Parse webhook event from payload
   * @private
   */
  parseWebhookEvent(payload) {
    try {
      const body = typeof payload.body === 'string' 
        ? JSON.parse(payload.body) 
        : payload.body;

      return {
        type: body.type || 'unknown',
        event: body.event,
        team_id: body.team_id,
        api_app_id: body.api_app_id,
        challenge: body.challenge,
        token: body.token,
        authed_users: body.authed_users,
        raw: body,
      };
    } catch (error) {
      throw new Error(`Failed to parse webhook payload: ${error.message}`);
    }
  }

  /**
   * Authenticate Slack request
   * @private
   */
  async authenticateSlackRequest(event) {
    try {
      // Verify team/workspace
      if (!config.slack.allowedTeams.includes(event.team_id)) {
        throw new Error(`Unauthorized team: ${event.team_id}`);
      }

      // Get team info for additional validation
      const teamInfo = await this.webClient.team.info({
        team: event.team_id,
      });

      return {
        valid: true,
        teamId: event.team_id,
        teamName: teamInfo.team.name,
        teamDomain: teamInfo.team.domain,
      };
    } catch (error) {
      this.logger.warn('Slack authentication failed', { 
        teamId: event.team_id,
        error: error.message 
      });
      
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Handle URL verification for Slack app setup
   * @private
   */
  async handleUrlVerification(event) {
    return {
      challenge: event.challenge,
    };
  }

  /**
   * Handle event callback (mentions, messages, etc.)
   * @private
   */
  async handleEventCallback(event, workflowId, logger) {
    const slackEvent = event.event;
    
    logger.info('Processing Slack event callback', {
      eventType: slackEvent.type,
      userId: slackEvent.user,
      channelId: slackEvent.channel,
    });

    // Trigger Little Horse workflow for event processing
    const workflowData = {
      eventType: slackEvent.type,
      userId: slackEvent.user,
      channelId: slackEvent.channel,
      text: slackEvent.text,
      timestamp: slackEvent.ts,
      teamId: event.team_id,
    };

    // This would trigger the appropriate Little Horse workflow
    this.metrics.workflowsTriggered++;
    
    return {
      workflowTriggered: true,
      workflowData,
    };
  }

  /**
   * Handle interactive message (buttons, menus, etc.)
   * @private
   */
  async handleInteractiveMessage(event, workflowId, logger) {
    logger.info('Processing interactive message', {
      actionId: event.raw.payload?.actions?.[0]?.action_id,
      userId: event.raw.payload?.user?.id,
    });

    const payload = event.raw.payload;
    const action = payload.actions[0];

    // Trigger workflow based on action
    const workflowData = {
      actionId: action.action_id,
      actionValue: action.value,
      userId: payload.user.id,
      channelId: payload.channel.id,
      messageTs: payload.message.ts,
      responseUrl: payload.response_url,
      teamId: event.team_id,
    };

    this.metrics.workflowsTriggered++;
    
    return {
      workflowTriggered: true,
      workflowData,
    };
  }

  /**
   * Handle slash command
   * @private
   */
  async handleSlashCommand(event, workflowId, logger) {
    const command = event.raw;
    
    logger.info('Processing slash command', {
      command: command.command,
      userId: command.user_id,
      channelId: command.channel_id,
    });

    this.metrics.totalCommands++;

    // Parse command and trigger appropriate workflow
    const workflowData = {
      command: command.command,
      text: command.text,
      userId: command.user_id,
      channelId: command.channel_id,
      responseUrl: command.response_url,
      teamId: command.team_id,
    };

    this.metrics.workflowsTriggered++;
    
    return {
      workflowTriggered: true,
      workflowData,
    };
  }

  /**
   * Handle unknown event types
   * @private
   */
  async handleUnknownEvent(event, logger) {
    logger.warn('Received unknown event type', { eventType: event.type });
    
    return {
      handled: false,
      eventType: event.type,
    };
  }

  /**
   * Format Slack message based on type and data
   * @private
   */
  formatSlackMessage(responseData) {
    const { messageType, data } = responseData;

    switch (messageType) {
      case 'campaign_created':
        return this.formatCampaignCreatedMessage(data);
      case 'campaign_status':
        return this.formatCampaignStatusMessage(data);
      case 'error':
        return this.formatErrorMessage(data);
      case 'workflow_complete':
        return this.formatWorkflowCompleteMessage(data);
      default:
        return this.formatGenericMessage(data);
    }
  }

  /**
   * Format campaign created message
   * @private
   */
  formatCampaignCreatedMessage(data) {
    return {
      text: '🚀 Campaign Created Successfully!',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🚀 Campaign Created Successfully!*\n\n*Campaign:* ${data.campaignName}\n*Type:* ${data.campaignType}\n*Status:* ${data.status}`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Audience:*\n${data.audienceCount || 'N/A'} recipients`,
            },
            {
              type: 'mrkdwn',
              text: `*Channels:*\n${(data.channels || []).join(', ') || 'N/A'}`,
            },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '📊 View Status' },
              action_id: 'check_status',
              value: data.campaignId,
              style: 'primary',
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '📝 Edit Campaign' },
              action_id: 'campaign_action_edit',
              value: data.campaignId,
            },
          ],
        },
      ],
    };
  }

  /**
   * Format campaign status message
   * @private
   */
  formatCampaignStatusMessage(data) {
    return {
      text: `📊 Campaign Status: ${data.campaignName}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*📊 Campaign Status*\n\n*${data.campaignName}*\nStatus: ${data.status}`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Sent:*\n${data.sentCount || 0}`,
            },
            {
              type: 'mrkdwn',
              text: `*Opens:*\n${data.openCount || 0} (${data.openRate || '0%'})`,
            },
            {
              type: 'mrkdwn',
              text: `*Clicks:*\n${data.clickCount || 0} (${data.clickRate || '0%'})`,
            },
            {
              type: 'mrkdwn',
              text: `*Created:*\n${data.createdAt || 'N/A'}`,
            },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '🔄 Refresh' },
              action_id: 'check_status',
              value: data.campaignId,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '📈 View Analytics' },
              action_id: 'campaign_action_analytics',
              value: data.campaignId,
            },
          ],
        },
      ],
    };
  }

  /**
   * Format error message
   * @private
   */
  formatErrorMessage(data) {
    return {
      text: '❌ An error occurred',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*❌ Error*\n\n${data.message || 'An unexpected error occurred'}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Error ID: \`${data.errorId || 'unknown'}\` | Time: ${new Date().toLocaleTimeString()}`,
            },
          ],
        },
      ],
    };
  }

  /**
   * Format workflow complete message
   * @private
   */
  formatWorkflowCompleteMessage(data) {
    return {
      text: '✅ Workflow Complete',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*✅ Workflow Complete*\n\n*${data.workflowName}*\nCompleted successfully in ${data.duration}ms`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Workflow ID:*\n\`${data.workflowId}\``,
            },
            {
              type: 'mrkdwn',
              text: `*Status:*\n${data.status}`,
            },
          ],
        },
      ],
    };
  }

  /**
   * Format generic message
   * @private
   */
  formatGenericMessage(data) {
    return {
      text: data.text || 'Message from Connexio.ai',
      blocks: data.blocks || [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: data.text || 'Message from Connexio.ai',
          },
        },
      ],
    };
  }

  /**
   * Send message via response URL
   * @private
   */
  async sendViaResponseUrl(responseUrl, message) {
    const response = await fetch(responseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Failed to send response: ${response.statusText}`);
    }

    return { success: true, statusCode: response.status };
  }

  /**
   * Handle webhook endpoint
   * @private
   */
  async handleWebhook(req, res) {
    try {
      const rawBody = req.rawBody || JSON.stringify(req.body);
      const headers = req.headers;

      const isValid = this.verifySlackSignature(rawBody, headers);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Process webhook asynchronously
      setImmediate(() => {
        this.processSlackWebhook(
          { body: req.body, rawBody, headers },
          'default-workflow-id'
        ).catch(error => {
          this.logger.error('Webhook processing failed', { error: error.message });
        });
      });

      res.status(200).json({ ok: true });
    } catch (error) {
      this.logger.error('Webhook handler error', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Handle interactive components endpoint
   * @private
   */
  async handleInteractive(req, res) {
    try {
      const payload = JSON.parse(req.body.payload);
      
      // Process interaction asynchronously
      setImmediate(() => {
        this.handleInteractiveMessage(
          { raw: { payload } },
          'interactive-workflow-id',
          this.logger
        ).catch(error => {
          this.logger.error('Interactive processing failed', { error: error.message });
        });
      });

      res.status(200).json({ ok: true });
    } catch (error) {
      this.logger.error('Interactive handler error', { error: error.message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Slack command handlers
   */
  async handleConnexioCommand({ command, ack, respond }) {
    await ack();
    this.metrics.totalCommands++;
    // Implementation handled by workflow trigger
  }

  async handleCreateCampaignCommand({ command, ack, respond }) {
    await ack();
    this.metrics.totalCommands++;
    // Implementation handled by workflow trigger
  }

  async handleCampaignStatusCommand({ command, ack, respond }) {
    await ack();
    this.metrics.totalCommands++;
    // Implementation handled by workflow trigger
  }

  async handleWorkflowTrigger({ ack, body, respond }) {
    await ack();
    this.metrics.totalInteractions++;
    // Implementation handled by workflow trigger
  }

  async handleStatusCheck({ ack, body, respond }) {
    await ack();
    this.metrics.totalInteractions++;
    // Implementation handled by workflow trigger
  }

  async handleCampaignAction({ ack, body, respond }) {
    await ack();
    this.metrics.totalInteractions++;
    // Implementation handled by workflow trigger
  }

  async handleAppMention({ event, say }) {
    // Implementation handled by workflow trigger
  }

  async handleDirectMessage({ event, say }) {
    // Implementation handled by workflow trigger
  }

  async handleGlobalError(error) {
    this.logger.error('Slack app error', { error: error.message });
    this.metrics.errors++;
  }

  /**
   * Get worker health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      slack: {
        connected: true,
        botToken: config.slack.botToken ? 'configured' : 'missing',
        signingSecret: config.slack.signingSecret ? 'configured' : 'missing',
      },
    };
  }

  /**
   * Start the Slack app server
   */
  async start(port = 3000) {
    try {
      await this.app.start(port);
      this.logger.info('Slack integration worker started', { port });
    } catch (error) {
      this.logger.error('Failed to start Slack integration worker', { error: error.message });
      throw error;
    }
  }

  /**
   * Shutdown worker gracefully
   */
  async shutdown() {
    try {
      await this.app.stop();
      this.logger.info('Slack integration worker shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown', { error: error.message });
    }
  }
}

export default SlackIntegrationWorker;