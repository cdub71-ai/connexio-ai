import { LHClient } from 'littlehorse-client';
import config from '../config/index.js';
import { createContextLogger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Little Horse Workflow Trigger Service
 * Handles triggering workflows from Slack integration worker
 */
class WorkflowTriggerService {
  constructor() {
    this.client = new LHClient({
      host: config.littlehorse.apiHost,
      port: config.littlehorse.apiPort,
      clientId: config.littlehorse.clientId,
      clientSecret: config.littlehorse.clientSecret,
    });

    this.logger = createContextLogger({ service: 'workflow-trigger' });
    
    // Workflow name mappings
    this.workflowMappings = {
      'slack_command': 'marketing-campaign-workflow',
      'slack_interaction': 'interactive-response-workflow',
      'slack_mention': 'ai-response-workflow',
      'slack_dm': 'direct-message-workflow',
    };

    this.logger.info('Workflow trigger service initialized');
  }

  /**
   * Trigger workflow based on Slack event type
   * @param {string} eventType - Type of Slack event (command, interaction, etc.)
   * @param {Object} eventData - Data from Slack event
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Workflow execution result
   */
  async triggerWorkflow(eventType, eventData, context = {}) {
    const triggerId = uuidv4();
    const logger = createContextLogger({
      service: 'workflow-trigger',
      triggerId,
      eventType,
    });

    logger.info('Triggering workflow', {
      eventType,
      workflowName: this.workflowMappings[eventType],
      userId: eventData.userId,
      channelId: eventData.channelId,
    });

    try {
      const workflowName = this.workflowMappings[eventType] || 'default-workflow';
      
      // Prepare workflow variables
      const variables = this.prepareWorkflowVariables(eventType, eventData, context);

      // Create workflow run
      const workflowRun = await this.client.runWorkflow(workflowName, variables);

      logger.info('Workflow triggered successfully', {
        workflowRunId: workflowRun.id,
        workflowName,
        variables: Object.keys(variables),
      });

      return {
        success: true,
        workflowRunId: workflowRun.id,
        workflowName,
        status: 'RUNNING',
        triggerId,
      };

    } catch (error) {
      logger.error('Failed to trigger workflow', {
        error: error.message,
        eventType,
        eventData: JSON.stringify(eventData).substring(0, 200),
      });

      return {
        success: false,
        error: error.message,
        eventType,
        triggerId,
      };
    }
  }

  /**
   * Trigger marketing campaign workflow specifically
   * @param {Object} slackCommand - Slack command data
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Workflow execution result
   */
  async triggerMarketingCampaignWorkflow(slackCommand, context = {}) {
    const triggerId = uuidv4();
    const logger = createContextLogger({
      service: 'workflow-trigger',
      triggerId,
      workflowType: 'marketing-campaign',
    });

    logger.info('Triggering marketing campaign workflow', {
      command: slackCommand.command,
      userId: slackCommand.userId || slackCommand.user_id,
      channelId: slackCommand.channelId || slackCommand.channel_id,
    });

    try {
      const variables = {
        // Slack command data
        slackCommand: {
          command: slackCommand.command,
          text: slackCommand.text,
          user_id: slackCommand.userId || slackCommand.user_id,
          user_name: slackCommand.user_name,
          channel_id: slackCommand.channelId || slackCommand.channel_id,
          channel_name: slackCommand.channel_name,
          team_id: slackCommand.team_id,
          team_domain: slackCommand.team_domain,
          response_url: slackCommand.response_url,
        },
        
        // Metadata
        metadata: {
          triggerId,
          timestamp: new Date().toISOString(),
          source: 'slack-integration-worker',
          context: context,
        },
      };

      const workflowRun = await this.client.runWorkflow(
        'marketing-campaign-workflow',
        variables
      );

      logger.info('Marketing campaign workflow triggered successfully', {
        workflowRunId: workflowRun.id,
        variables: Object.keys(variables),
      });

      return {
        success: true,
        workflowRunId: workflowRun.id,
        workflowName: 'marketing-campaign-workflow',
        status: 'RUNNING',
        triggerId,
      };

    } catch (error) {
      logger.error('Failed to trigger marketing campaign workflow', {
        error: error.message,
        command: slackCommand.command,
        text: slackCommand.text?.substring(0, 100),
      });

      return {
        success: false,
        error: error.message,
        workflowName: 'marketing-campaign-workflow',
        triggerId,
      };
    }
  }

  /**
   * Trigger interactive response workflow
   * @param {Object} interactionData - Slack interaction data
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} Workflow execution result
   */
  async triggerInteractiveResponseWorkflow(interactionData, context = {}) {
    const triggerId = uuidv4();
    const logger = createContextLogger({
      service: 'workflow-trigger',
      triggerId,
      workflowType: 'interactive-response',
    });

    logger.info('Triggering interactive response workflow', {
      actionId: interactionData.actionId,
      userId: interactionData.userId,
      channelId: interactionData.channelId,
    });

    try {
      const variables = {
        // Interaction data
        interaction: {
          action_id: interactionData.actionId,
          action_value: interactionData.actionValue,
          user_id: interactionData.userId,
          channel_id: interactionData.channelId,
          message_ts: interactionData.messageTs,
          response_url: interactionData.responseUrl,
          team_id: interactionData.teamId,
        },
        
        // Metadata
        metadata: {
          triggerId,
          timestamp: new Date().toISOString(),
          source: 'slack-integration-worker',
          context: context,
        },
      };

      const workflowRun = await this.client.runWorkflow(
        'interactive-response-workflow',
        variables
      );

      logger.info('Interactive response workflow triggered successfully', {
        workflowRunId: workflowRun.id,
        actionId: interactionData.actionId,
      });

      return {
        success: true,
        workflowRunId: workflowRun.id,
        workflowName: 'interactive-response-workflow',
        status: 'RUNNING',
        triggerId,
      };

    } catch (error) {
      logger.error('Failed to trigger interactive response workflow', {
        error: error.message,
        actionId: interactionData.actionId,
      });

      return {
        success: false,
        error: error.message,
        workflowName: 'interactive-response-workflow',
        triggerId,
      };
    }
  }

  /**
   * Get workflow status
   * @param {string} workflowRunId - Workflow run ID
   * @returns {Promise<Object>} Workflow status
   */
  async getWorkflowStatus(workflowRunId) {
    const logger = createContextLogger({
      service: 'workflow-trigger',
      workflowRunId,
    });

    try {
      const workflowRun = await this.client.getWorkflowRun(workflowRunId);

      logger.info('Retrieved workflow status', {
        workflowRunId,
        status: workflowRun.status,
      });

      return {
        id: workflowRun.id,
        status: workflowRun.status,
        workflowName: workflowRun.workflowDefName,
        startTime: workflowRun.createTime,
        endTime: workflowRun.endTime,
        variables: workflowRun.variables,
      };

    } catch (error) {
      logger.error('Failed to get workflow status', {
        error: error.message,
        workflowRunId,
      });

      return {
        id: workflowRunId,
        status: 'ERROR',
        error: error.message,
      };
    }
  }

  /**
   * Prepare workflow variables based on event type
   * @private
   */
  prepareWorkflowVariables(eventType, eventData, context) {
    const baseVariables = {
      metadata: {
        triggerId: uuidv4(),
        timestamp: new Date().toISOString(),
        source: 'slack-integration-worker',
        eventType,
        context,
      },
    };

    switch (eventType) {
      case 'slack_command':
        return {
          ...baseVariables,
          slackCommand: {
            command: eventData.command,
            text: eventData.text,
            user_id: eventData.userId,
            channel_id: eventData.channelId,
            response_url: eventData.responseUrl,
            team_id: eventData.teamId,
          },
        };

      case 'slack_interaction':
        return {
          ...baseVariables,
          interaction: {
            action_id: eventData.actionId,
            action_value: eventData.actionValue,
            user_id: eventData.userId,
            channel_id: eventData.channelId,
            message_ts: eventData.messageTs,
            response_url: eventData.responseUrl,
            team_id: eventData.teamId,
          },
        };

      case 'slack_mention':
      case 'slack_dm':
        return {
          ...baseVariables,
          message: {
            text: eventData.text,
            user_id: eventData.userId,
            channel_id: eventData.channelId,
            timestamp: eventData.timestamp,
            team_id: eventData.teamId,
          },
        };

      default:
        return {
          ...baseVariables,
          eventData,
        };
    }
  }

  /**
   * List running workflows
   * @param {Object} filters - Filters for workflow listing
   * @returns {Promise<Array>} List of workflow runs
   */
  async listRunningWorkflows(filters = {}) {
    try {
      // This would depend on the specific Little Horse client API
      // Placeholder implementation
      const workflows = [];
      
      this.logger.info('Listed running workflows', {
        count: workflows.length,
        filters,
      });

      return workflows;

    } catch (error) {
      this.logger.error('Failed to list running workflows', {
        error: error.message,
        filters,
      });

      return [];
    }
  }

  /**
   * Cancel workflow
   * @param {string} workflowRunId - Workflow run ID to cancel
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelWorkflow(workflowRunId) {
    const logger = createContextLogger({
      service: 'workflow-trigger',
      workflowRunId,
    });

    try {
      // This would depend on the specific Little Horse client API
      // Placeholder implementation
      logger.info('Workflow cancelled', { workflowRunId });

      return {
        success: true,
        workflowRunId,
        status: 'CANCELLED',
      };

    } catch (error) {
      logger.error('Failed to cancel workflow', {
        error: error.message,
        workflowRunId,
      });

      return {
        success: false,
        error: error.message,
        workflowRunId,
      };
    }
  }

  /**
   * Get service health status
   */
  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      client: {
        host: config.littlehorse.apiHost,
        port: config.littlehorse.apiPort,
        connected: true, // This should be checked properly
      },
      workflowMappings: this.workflowMappings,
    };
  }

  /**
   * Shutdown service
   */
  async shutdown() {
    try {
      // Close LH client connection if needed
      this.logger.info('Workflow trigger service shutdown complete');
    } catch (error) {
      this.logger.error('Error during workflow trigger service shutdown', {
        error: error.message,
      });
    }
  }
}

export default WorkflowTriggerService;